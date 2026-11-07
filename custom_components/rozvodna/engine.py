"""Validate, stage, journal and verify registry edits."""

import asyncio
from collections import Counter
from dataclasses import asdict, dataclass
import logging
import re

from .references import ReferenceConflict, ReferenceLimit

_LOGGER = logging.getLogger(__name__)
ENTITY_ID = re.compile(r"(?!.*?__[^.]*\.)[a-z0-9](?:[a-z0-9_]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9_]*[a-z0-9])?")
ICON = re.compile(r"[a-z0-9_-]+:[a-z0-9_-]+")
FIELDS = {
    "device": {"name", "area_id", "labels"},
    "entity": {"name", "entity_id", "area_id", "labels", "icon", "hidden_by", "disabled_by"},
    "reference": {"path"},
}
FLAGS = {"hidden_by", "disabled_by"}
MAX_CHANGES = 5000


class Problem(ValueError):
    """Validation or concurrency failure safe to display by code."""


@dataclass(frozen=True)
class Operation:
    kind: str
    object_id: str
    field: str
    before: str | list[str] | None
    after: str | list[str] | None
    source: str | None = None

    @property
    def key(self):
        return (self.kind, self.object_id, self.field)


class Engine:
    def __init__(self, db, registry, executor, references=None):
        self.db = db
        self.registry = registry
        self.references = references
        self.execute = executor
        self.lock = asyncio.Lock()
        self.active = True

    async def initialize(self):
        await self.execute(self.db.initialize, self.registry.snapshot())
        if self.references:
            await self.references.refresh()

    def _check_active(self):
        if not self.active:
            raise Problem("inactive")

    async def _workspace(self, user, revision):
        self._check_active()
        state = await self.execute(self.db.state, user)
        if state["revision"] != revision:
            raise Problem("stale_revision")
        return {op.key: op for row in state["changes"] if (op := Operation(**row))}

    def _check(self, op):
        if op.kind == "reference":
            if (not self.references or not op.field.startswith("/")
                    or not isinstance(op.before, str) or not isinstance(op.after, str)
                    or not ENTITY_ID.fullmatch(op.before) or not ENTITY_ID.fullmatch(op.after)):
                raise Problem("unsupported_field")
            row = self.references.target(op.object_id, op.field)
            if row is None:
                raise Problem("missing_source")
            if row["values"].get(op.field) != op.before:
                raise Problem("changed")
            if not self.references.is_static_reference(op.object_id, op.field, op.before):
                raise Problem("unsupported_field")
            return row

        row = self.registry.target(op.kind, op.object_id)
        if row is None:
            raise Problem("missing_object")
        if op.field not in FIELDS.get(op.kind, ()) or op.field not in row["values"]:
            raise Problem("unsupported_field")
        current = row["values"][op.field]
        if current != op.before:
            raise Problem("changed")
        value = op.after
        if op.field == "entity_id":
            if (not isinstance(value, str) or len(value) > 255 or not ENTITY_ID.fullmatch(value)
                    or value.split(".")[0] != current.split(".")[0]):
                raise Problem("invalid_entity_id")
            if value != current and self.registry.occupied(value):
                raise Problem("occupied")
        elif op.field in FLAGS:
            if value not in (None, "user") or current not in (None, "user"):
                raise Problem("managed_state")
        elif op.field == "labels":
            if (not isinstance(value, list) or len(value) > 1000
                    or any(not isinstance(label, str) or len(label) > 255 for label in value)
                    or value != sorted(set(value))):
                raise Problem("invalid_labels")
            if any(not self.registry.exists("labels", label) for label in value):
                raise Problem("missing_label")
        elif value is not None:
            if not isinstance(value, str) or not value.strip() or len(value) > 255:
                raise Problem("invalid_value")
            if op.field == "area_id" and not self.registry.exists("area_id", value):
                raise Problem("missing_area")
            if op.field == "icon" and not ICON.fullmatch(value):
                raise Problem("invalid_icon")
        return row

    def _plan(self, operations):
        targets = Counter(op.after for op in operations if op.field == "entity_id")
        issues, plan = [], []
        for op in operations:
            try:
                row = self._check(op)
                if op.field == "entity_id" and targets[op.after] > 1:
                    raise Problem("duplicate_target")
            except Problem as error:
                issues.append({**asdict(op), "code": str(error)})
            else:
                plan.append((op, row["title"], row["integration"]))
        # Explicit renames only to free IDs. Run them before other fields.
        plan.sort(key=lambda entry: entry[0].field != "entity_id")
        return issues, plan

    async def state(self, user):
        async with self.lock:
            self._check_active()
            state = await self.execute(self.db.state, user)
            state["issues"], _ = self._plan([Operation(**op) for op in state["changes"]])
            return state

    async def stage(self, user, revision, changes, drop=()):
        async with self.lock:
            if self.references and any(item.get("kind") == "reference" for item in changes):
                await self.references.refresh()
            workspace = await self._workspace(user, revision)
            if len(changes) + len(drop) > MAX_CHANGES:
                raise Problem("too_many_changes")
            for item in drop:
                workspace.pop((item["kind"], item["object_id"], item["field"]), None)
            for item in changes:
                op = Operation(item["kind"], item["object_id"], item["field"], item["before"], item["after"])
                self._check(op)
                if op.before == op.after:
                    workspace.pop(op.key, None)
                else:
                    workspace[op.key] = op
            return await self._store(user, revision, workspace)

    async def _store(self, user, revision, workspace):
        if len(workspace) > MAX_CHANGES:
            raise Problem("too_many_changes")
        changes = list(workspace.values())
        await self.execute(self.db.stage, user, revision + 1, changes)
        issues, _ = self._plan(changes)
        return {"revision": revision + 1, "changes": [asdict(op) for op in changes], "issues": issues}

    async def preview_references(self, user, revision):
        async with self.lock:
            workspace = await self._workspace(user, revision)
            renames = [op for op in workspace.values() if op.field == "entity_id"]
            if not renames:
                raise Problem("no_renames")
            if not self.references:
                return {"token": "", "matches": [], "coverage": {}}
            try:
                return await self.references.inspect(renames)
            except ReferenceLimit as error:
                raise Problem(str(error)) from error

    async def commit(self, user, revision, message, reference_token=None, reference_ids=()):
        async with self.lock:
            workspace = await self._workspace(user, revision)
            if not workspace:
                raise Problem("empty")
            if self.references:
                await self.references.refresh()
            issues, plan = self._plan(list(workspace.values()))
            if issues:
                return {"status": "conflict", "issues": issues}
            renames = [op for op in workspace.values() if op.field == "entity_id"]
            reverting_references = any(op.kind == "reference" and op.source for op in workspace.values())
            if renames and self.references and not reverting_references:
                if not reference_token:
                    raise Problem("reference_review_required")
                try:
                    report = await self.references.inspect(renames)
                except ReferenceLimit as error:
                    raise Problem(str(error)) from error
                if report["token"] != reference_token:
                    raise Problem("reference_conflict")
                automatic = {item["id"]: item for item in report["matches"] if item["automatic"]}
                selected = set(reference_ids)
                if not selected.issubset(automatic):
                    raise Problem("reference_selection_invalid")
                for item in report["matches"]:
                    if item["id"] not in selected:
                        continue
                    op = Operation("reference", item["source_id"], item["location"],
                                   item["old"], item["new"])
                    try:
                        row = self._check(op)
                    except Problem as error:
                        raise Problem("reference_conflict") from error
                    plan.append((op, row["title"], row["integration"]))
            elif reference_ids or reference_token:
                raise Problem("reference_selection_invalid")
            commit_id = await self.execute(self.db.begin, user, message, plan)
            saved = 0
            failures = False
            rename_results = {}
            for position, (op, _, _) in enumerate(plan):
                await self.execute(self.db.applying, commit_id, position)
                pair = (op.before, op.after)
                if op.kind == "reference" and rename_results.get(pair) != "saved":
                    status, error = "skipped", "rename_not_saved"
                else:
                    status, error = await self._apply(op)
                await self.execute(self.db.outcome, commit_id, position, status, error)
                if op.field == "entity_id":
                    rename_results[pair] = status
                if status == "saved":
                    saved += 1
                    workspace.pop(op.key, None)
                else:
                    failures = True
            status = "saved" if not workspace and not failures else "partial" if saved else "error"
            await self.execute(self.db.finish, commit_id, status, user, revision + 1, list(workspace.values()))
            return await self.execute(self.db.detail, commit_id)

    async def _apply(self, op):
        try:
            self._check(op)
        except Problem as error:
            return "conflict", str(error)
        try:
            if op.kind == "reference":
                await self.references.apply(op)
                updated = self.references.target(op.object_id, op.field)
            else:
                self.registry.apply(op)
                updated = self.registry.target(op.kind, op.object_id)
            if updated is None or updated["values"].get(op.field) != op.after:
                return "error", "unexpected_value"
        except Exception as error:
            if op.kind == "reference" and isinstance(error, ReferenceConflict):
                return "conflict", str(error)
            if op.kind == "reference":
                _LOGGER.error("Rozvodňa could not update dashboard reference %s", op.key)
                return "error", "reference_error"
            _LOGGER.exception("Rozvodňa registry update failed for %s", op.key)
            return "error", "registry_error"
        return "saved", None

    async def history(self, kind=None, object_id=None, field=None, offset=0):
        return await self.execute(self.db.history, kind, object_id, field, offset)

    async def detail(self, commit_id):
        result = await self.execute(self.db.detail, commit_id)
        if result is None:
            raise Problem("missing_commit")
        return result

    async def revert(self, user, revision, commit_id, positions):
        async with self.lock:
            if self.references:
                await self.references.refresh()
            workspace = await self._workspace(user, revision)
            detail = await self.detail(commit_id)
            operations = [op for op in detail["operations"] if op["status"] == "saved"
                          and (positions is None or op["position"] in positions)]
            if not operations or (positions is not None and {op["position"] for op in operations} != set(positions)):
                raise Problem("empty_revert")
            if any(item["field"] == "replacement_release" for item in detail["operations"]):
                raise Problem("replacement_recovery_required")
            linked = {op["position"] for op in detail["operations"]
                      if op["status"] == "saved" and (op["field"] == "entity_id" or op["kind"] == "reference")}
            selected_linked = {op["position"] for op in operations} & linked
            if selected_linked and selected_linked != linked:
                raise Problem("dependent_revert")
            for item in operations:
                op = Operation(item["kind"], item["object_id"], item["field"],
                               item["after"], item["before"], commit_id)
                if op.key in workspace:
                    raise Problem("already_staged")
                self._check(op)
                workspace[op.key] = op
            return await self._store(user, revision, workspace)

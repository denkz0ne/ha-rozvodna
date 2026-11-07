"""Plan and journal the transfer of registered device entities."""

import asyncio
from hashlib import sha256
import json

from homeassistant.helpers import entity_registry as er

from .engine import Operation, Problem
from .references import ReferenceLimit
from .replacer_matching import match, unsure


async def preview(registry, references, old_id, new_id, overrides):
    old = registry.target("device", old_id)
    new = registry.target("device", new_id)
    if not old or not new or old_id == new_id:
        raise Problem("invalid_replacement_devices")

    def entries(device_id):
        return er.async_entries_for_device(registry.entities, device_id, include_disabled_entities=True)

    before, after = entries(old_id), entries(new_id)
    if len(before) > 100 or len(after) > 100:
        raise Problem("too_many_replacement_entities")
    mapping = match(before, after)
    uncertain = set(unsure(before, after, mapping))
    old_ids = {entry.entity_id for entry in before}
    new_ids = {entry.entity_id: entry for entry in after}
    old_domains = {entry.entity_id: entry.domain for entry in before}
    for source, target in overrides.items():
        if source not in old_ids or (target is not None and (
            target not in new_ids or old_domains[source] != new_ids[target].domain
        )):
            raise Problem("invalid_replacement_mapping")
    mapping.update(overrides)
    targets = [value for value in mapping.values() if value is not None]
    if len(targets) != len(set(targets)):
        raise Problem("duplicate_replacement_target")
    rows = []
    for entry in before:
        target = new_ids.get(mapping[entry.entity_id])
        differences = []
        if target is not None:
            for field in ("unit_of_measurement", "device_class"):
                old_value, new_value = getattr(entry, field), getattr(target, field)
                if old_value != new_value:
                    differences.append({"field": field, "before": old_value, "after": new_value})
            for field in ("state_class", "options", "event_types", "hvac_modes", "preset_modes",
                          "fan_modes", "swing_modes", "effect_list", "supported_color_modes"):
                old_value = (entry.capabilities or {}).get(field)
                new_value = (target.capabilities or {}).get(field)
                if old_value != new_value:
                    differences.append({"field": field, "before": old_value, "after": new_value})
        rows.append({"source": entry.entity_id, "target": mapping[entry.entity_id],
                     "uncertain": entry.entity_id in uncertain and entry.entity_id not in overrides,
                     "differences": differences})
    settings = []
    def copy_settings(source, target, fields):
        for field in fields:
            before_value, after_value = target["values"][field], source["values"][field]
            if before_value == after_value:
                continue
            if field in ("hidden_by", "disabled_by") and (
                before_value not in (None, "user") or after_value not in (None, "user")
            ):
                continue
            settings.append({"kind": target["kind"], "object_id": target["id"], "field": field,
                             "before": before_value, "after": after_value, "title": target["title"]})

    copy_settings(old, new, ("name", "area_id", "labels"))
    for entry in before:
        if (target := new_ids.get(mapping[entry.entity_id])) is not None:
            copy_settings(registry.target("entity", entry.id), registry.target("entity", target.id),
                          ("name", "area_id", "labels", "icon", "hidden_by", "disabled_by"))

    renames = [Operation("entity", new_ids[target].id, "entity_id", target, source)
               for source, target in mapping.items() if target is not None]
    try:
        report = await references.inspect(renames)
        device_report = await references.inspect(
            [Operation("device", old_id, "device_id", old_id, new_id)],
            reference_keys={"device_id", "device_ids"},
        )
    except ReferenceLimit as error:
        raise Problem(str(error)) from error
    result = {"old": old, "new": new, "pairs": rows, "unmatched_new": sorted(new_ids.keys() - set(targets)),
            "references": [{**item, "reference_kind": "entity"} for item in report["matches"]] + [{**item, "reference_kind": "device"} for item in device_report["matches"]],
            "coverage": report["coverage"], "settings": settings}

    result["token"] = sha256(json.dumps(
        [result, report["token"], device_report["token"],
         [(entry.id, entry.entity_id) for entry in before + after]], sort_keys=True
    ).encode()).hexdigest()
    return result

async def execute(engine, user, old_id, new_id, overrides, expected_token, selected):
    """Transfer IDs and apply reviewed settings using the registry journal."""
    async with engine.lock:
        engine._check_active()
        workspace = await engine.execute(engine.db.state, user)
        if workspace["changes"]:
            raise Problem("replacement_pending_changes")
        registry = engine.registry
        report = await preview(registry, engine.references, old_id, new_id, overrides)
        if report["token"] != expected_token:
            raise Problem("reference_conflict")
        pairs = [item for item in report["pairs"] if item["target"]]
        if not pairs or any(item["uncertain"] for item in pairs):
            raise Problem("replacement_review_required")
        plan = []
        for item in pairs:
            old = registry.entities.async_get(item["source"])
            new = registry.entities.async_get(item["target"])
            state = registry.hass.states.get(old.entity_id)
            if state is not None and state.state != "unavailable" and not state.attributes.get("restored"):
                raise Problem("replacement_source_active")
            if any(diff["field"] in ("unit_of_measurement", "state_class", "device_class")
                   for diff in item["differences"]):
                raise Problem("replacement_incompatible")
            identity = {"entity_id": old.entity_id, "platform": old.platform, "unique_id": old.unique_id,
                        "config_entry_id": old.config_entry_id, "config_subentry_id": old.config_subentry_id,
                        "device_id": old.device_id}
            plan.extend([
                (Operation("entity", old.id, "replacement_release", identity, None), old.entity_id, old.platform),
                (Operation("entity", new.id, "entity_id", new.entity_id, old.entity_id), new.entity_id, new.platform),
            ])
        for item in report["settings"]:
            op = Operation(item["kind"], item["object_id"], item["field"], item["before"], item["after"])
            row = engine._check(op)
            plan.append((op, row["title"], row["integration"]))
        eligible = {item["id"]: item for item in report["references"]
                    if item["automatic"] and item["reference_kind"] == "entity"}
        if not set(selected).issubset(eligible):
            raise Problem("reference_selection_invalid")
        # The entity scan precedes the device scan, which leaves the same dashboard snapshots cached.
        for match_id in dict.fromkeys(selected):
            item = eligible[match_id]
            op = Operation("reference", item["source_id"], item["location"], item["old"], item["new"])
            row = engine._check(op)
            plan.append((op, row["title"], row["integration"]))
        commit_id = await engine.execute(engine.db.begin, user, "Replace device", plan)
        saved = 0
        failed = False
        for position, (op, _, _) in enumerate(plan):
            if failed:
                await engine.execute(engine.db.outcome, commit_id, position, "skipped", "replacement_stopped")
                continue
            await engine.execute(engine.db.applying, commit_id, position)
            if op.field == "replacement_release":
                current = registry.entities.async_get(op.object_id)
                state = registry.hass.states.get(op.before["entity_id"])
                if (current is None or current.entity_id != op.before["entity_id"]
                        or (state is not None and state.state != "unavailable"
                            and not state.attributes.get("restored"))):
                    status, error = "conflict", "changed"
                else:
                    try:
                        registry.entities.async_remove(current.entity_id)
                        status, error = ("saved", None) if registry.entities.async_get(op.object_id) is None else (
                            "error", "unexpected_value"
                        )
                    except Exception:
                        status, error = "uncertain", "registry_error"
            else:
                if op.field == "entity_id":
                    # Registry listeners remove the old state asynchronously.
                    for _ in range(20):
                        if not registry.occupied(op.after):
                            break
                        await asyncio.sleep(0.05)
                status, error = await engine._apply(op)
            await engine.execute(engine.db.outcome, commit_id, position, status, error)
            failed = status != "saved"
            saved += status == "saved"
        status = "partial" if failed and saved else "error" if failed else "saved"
        await engine.execute(engine.db.finish, commit_id, status, user, workspace["revision"] + 1, [])
        return await engine.execute(engine.db.detail, commit_id)

"""Find and safely update a narrow set of entity references."""

from copy import deepcopy
import hashlib
import json

from homeassistant.components.lovelace.const import LOVELACE_DATA, MODE_STORAGE


REFERENCE_KEYS = {"entity", "entity_id", "entity_ids"}
TEMPLATE_MARKERS = ("{{", "{%")
MAX_REFERENCE_RENAMES = 100
MAX_REFERENCE_MATCHES = 5000


class ReferenceConflict(ValueError):
    """A reference source changed after it was inspected."""


class ReferenceLimit(ValueError):
    """A reference scan exceeded a safe work limit."""


class References:
    """Read configuration sources and only write through HA's dashboard API."""

    def __init__(self, hass):
        self.hass = hass
        self.sources = {}
        self.fingerprints = {}

    async def _load_sources(self):
        sources = {}
        yaml_dashboards = 0
        unavailable_dashboards = 0
        lovelace = self.hass.data.get(LOVELACE_DATA)
        for dashboard in getattr(lovelace, "dashboards", {}).values():
            if dashboard.mode != MODE_STORAGE:
                yaml_dashboards += 1
                continue
            try:
                config = deepcopy(await dashboard.async_load(True))
            except Exception:
                unavailable_dashboards += 1
                continue
            url_path = dashboard.url_path or "default"
            title = (getattr(dashboard, "config", None) or {}).get("title") or url_path
            source_id = f"dashboard:{url_path}"
            sources[source_id] = {
                "id": source_id, "kind": "dashboard", "title": f"Dashboard · {title}",
                "integration": "Home Assistant Lovelace", "config": config,
                "writer": dashboard, "automatic": True,
            }

        return sources, yaml_dashboards, unavailable_dashboards

    async def inspect(self, renames, *, reference_keys=REFERENCE_KEYS):
        """Return safe candidates and a content token without exposing config."""
        if len(renames) > MAX_REFERENCE_RENAMES:
            raise ReferenceLimit("too_many_reference_renames")
        sources, yaml_dashboards, unavailable_dashboards = await self._load_sources()
        self.sources = sources
        self.fingerprints = {key: fingerprint(row["config"]) for key, row in sources.items()}
        matches = []
        rename_key = sorted((op.object_id, op.before, op.after) for op in renames)
        for old_id, new_id in sorted({(op.before, op.after) for op in renames}):
            for source in sources.values():
                for path, category in find_references(source["config"], old_id, reference_keys):
                    automatic = source["automatic"] and category == "static"
                    match_id = hashlib.sha256(
                        f"{source['id']}\0{path}\0{old_id}\0{new_id}".encode()
                    ).hexdigest()[:24]
                    matches.append({
                        "id": match_id, "source_id": source["id"],
                        "source_kind": source["kind"], "source": source["title"],
                        "location": path, "old": old_id, "new": new_id,
                        "automatic": automatic,
                        "reason": category if category != "static" else (
                            "manual_source" if not source["automatic"] else ""),
                    })
                    if len(matches) > MAX_REFERENCE_MATCHES:
                        raise ReferenceLimit("too_many_references")
        matches.sort(key=lambda item: (not item["automatic"], item["source"], item["location"]))
        token_payload = {
            "sources": sorted(self.fingerprints.items()),
            "renames": rename_key,
        }
        token = hashlib.sha256(json.dumps(token_payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        return {
            "token": token,
            "matches": matches,
            "coverage": {
                "dashboards": sum(row["kind"] == "dashboard" for row in sources.values()),
                "automations": 0,
                "scripts": 0,
                "yaml_dashboards": yaml_dashboards,
                "unavailable_dashboards": unavailable_dashboards,
            },
        }

    async def refresh(self):
        """Refresh cached read-only source snapshots before staging or reverting."""
        self.sources, _, _ = await self._load_sources()
        self.fingerprints = {key: fingerprint(row["config"]) for key, row in self.sources.items()}

    def target(self, source_id, path):
        source = self.sources.get(source_id)
        if not source:
            return None
        try:
            value = get_pointer(source["config"], path)
        except (KeyError, IndexError, TypeError, ValueError):
            return None
        return {
            "kind": "reference", "id": source_id, "title": source["title"],
            "integration": source["integration"], "values": {path: value},
        }

    def is_static_reference(self, source_id, path, entity_id):
        source = self.sources.get(source_id)
        return bool(source and source["kind"] == "dashboard" and source["writer"] is not None
                    and (path, "static") in find_references(source["config"], entity_id))

    async def apply(self, op):
        """Apply one exact dashboard reference using Lovelace's save API."""
        source = self.sources.get(op.object_id)
        if not source or source["kind"] != "dashboard" or source["writer"] is None:
            raise ReferenceConflict("reference_source_unavailable")
        writer = source["writer"]
        config = deepcopy(await writer.async_load(True))
        if fingerprint(config) != self.fingerprints.get(op.object_id):
            raise ReferenceConflict("reference_source_changed")
        try:
            current = get_pointer(config, op.field)
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise ReferenceConflict("reference_changed") from error
        if current != op.before:
            raise ReferenceConflict("reference_changed")
        set_pointer(config, op.field, op.after)
        await writer.async_save(config)
        saved = deepcopy(await writer.async_load(True))
        if get_pointer(saved, op.field) != op.after:
            raise ReferenceConflict("reference_write_unverified")
        source["config"] = saved
        self.fingerprints[op.object_id] = fingerprint(saved)


def find_references(config, entity_id, reference_keys=REFERENCE_KEYS):
    """Find exact entity selector values and templated strings, with JSON paths."""
    found = []

    def visit(value, path="", key=None, custom=False):
        if isinstance(value, dict):
            custom = custom or str(value.get("type", "")).startswith("custom:")
            for child_key, child in value.items():
                visit(child, f"{path}/{escape_pointer(child_key)}", str(child_key), custom)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}/{index}", key, custom)
        elif isinstance(value, str):
            if key in reference_keys and value == entity_id:
                found.append((path or "/", "ambiguous" if custom else "static"))
            elif entity_id in value and any(marker in value for marker in TEMPLATE_MARKERS):
                found.append((path or "/", "dynamic"))

    visit(config)
    return found


def fingerprint(config):
    payload = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def escape_pointer(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def get_pointer(config, path):
    current = config
    for token in path.strip("/").split("/") if path else ():
        token = token.replace("~1", "/").replace("~0", "~")
        current = current[int(token)] if isinstance(current, list) else current[token]
    return current


def set_pointer(config, path, value):
    tokens = path.strip("/").split("/") if path else []
    if not tokens:
        raise ValueError("root replacement is unsupported")
    current = config
    for raw in tokens[:-1]:
        token = raw.replace("~1", "/").replace("~0", "~")
        current = current[int(token)] if isinstance(current, list) else current[token]
    final = tokens[-1].replace("~1", "/").replace("~0", "~")
    if isinstance(current, list):
        current[int(final)] = value
    else:
        current[final] = value

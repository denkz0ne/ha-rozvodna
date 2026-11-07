"""Build a read-only device replacement plan."""

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
    return {"old": old, "new": new, "pairs": rows, "unmatched_new": sorted(new_ids.keys() - set(targets)),
            "references": report["matches"] + device_report["matches"],
            "coverage": report["coverage"]}

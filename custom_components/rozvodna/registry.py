"""Home Assistant 2026.11 registry adapter. All calls run on the HA event loop."""

from itertools import chain

from homeassistant.helpers import area_registry as ar, device_registry as dr
from homeassistant.helpers import entity_registry as er, label_registry as lr


class Registry:
    def __init__(self, hass):
        self.hass = hass
        self.devices = dr.async_get(hass)
        self.entities = er.async_get(hass)
        self.areas = ar.async_get(hass)
        self.labels = lr.async_get(hass)

    def _device(self, object_id):
        return self.devices.async_get(object_id, include_composite_devices=False)

    def _ref(self, entry, fallback):
        config_id = entry.config_entry_id
        sub_id = entry.config_subentry_id
        config = self.hass.config_entries.async_get_entry(config_id) if config_id else None
        sub = config.subentries.get(sub_id) if config and sub_id else None
        return {
            "integration": config.domain if config else fallback,
            "config_entry": config_id,
            "config_title": config.title if config else None,
            "subentry": sub_id,
            "subentry_title": sub.title if sub else None,
        }

    def _describe_device(self, entry):
        title = entry.name_by_user or entry.name or entry.id
        return {
            "kind": "device", "id": entry.id, "title": title, "original_name": entry.name,
            "parent_device_id": getattr(entry, "parent_device_id", None),
            "via_device_id": getattr(entry, "via_device_id", None),
            "effective_area": dr.async_get_effective_area_id(self.hass, entry),
            "inherited_labels": self._device_ancestor_labels(entry),
            "values": {"name": entry.name_by_user, "area_id": entry.area_id,
                       "labels": sorted(entry.labels)},
            **self._ref(entry, "unknown"),
        }

    def _device_ancestor_labels(self, entry):
        if isinstance(entry, dr.ChildDeviceEntry) and (parent := self._device(entry.parent_device_id)):
            return sorted(parent.labels)
        return []

    def _describe_entity(self, entry):
        device = self._device(entry.device_id) if entry.device_id else None
        inherited = set(device.labels).union(self._device_ancestor_labels(device)) if device else set()
        return {
            "kind": "entity", "id": entry.id, "device_id": entry.device_id,
            "title": er.async_get_full_entity_name(self.hass, entry) or entry.entity_id,
            "original_name": entry.original_name, "original_icon": entry.original_icon,
            "has_entity_name": entry.has_entity_name,
            "effective_area": er.async_get_effective_area_id(self.hass, entry),
            "inherited_labels": sorted(inherited),
            "values": {"name": entry.name, "entity_id": entry.entity_id,
                       "area_id": entry.area_id, "labels": sorted(entry.labels),
                       "icon": entry.icon, "hidden_by": entry.hidden_by,
                       "disabled_by": entry.disabled_by},
            **self._ref(entry, entry.platform),
        }

    def snapshot(self):
        return {
            "devices": [self._describe_device(entry)
                        for entry in chain(self.devices.devices, self.devices.child_devices)],
            "entities": [self._describe_entity(entry) for entry in self.entities.entities.values()],
            "areas": [{"id": item.id, "name": item.name, "icon": item.icon}
                      for item in self.areas.areas.values()],
            "labels": [{"id": item.label_id, "name": item.name, "icon": item.icon, "color": item.color}
                       for item in self.labels.labels.values()],
        }

    def target(self, kind, object_id):
        if kind == "device" and (entry := self._device(object_id)):
            return self._describe_device(entry)
        if kind == "entity" and (entry := self.entities.async_get(object_id)) and entry.id == object_id:
            return self._describe_entity(entry)
        return None

    def exists(self, field, value):
        if field == "area_id":
            return self.areas.async_get_area(value) is not None
        return self.labels.async_get_label(value) is not None

    def occupied(self, entity_id):
        return (self.entities.async_is_registered(entity_id)
                or not self.hass.states.async_available(entity_id))

    def apply(self, op):
        field, value = op.field, op.after
        if field == "labels":
            value = set(value)
        if op.kind == "device":
            field = "name_by_user" if field == "name" else field
            entry = self._device(op.object_id)
            update = (self.devices.async_update_child_device if isinstance(entry, dr.ChildDeviceEntry)
                      else self.devices.async_update_device)
            update(entry.id, **{field: value})
            return
        entry = self.entities.async_get(op.object_id)
        if field == "entity_id":
            field = "new_entity_id"
        elif field == "disabled_by" and value is not None:
            value = er.RegistryEntryDisabler.USER
        elif field == "hidden_by" and value is not None:
            value = er.RegistryEntryHider.USER
        self.entities.async_update_entity(entry.entity_id, **{field: value})

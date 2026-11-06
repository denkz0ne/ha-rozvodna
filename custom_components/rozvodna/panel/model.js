export const fields = ["name", "entity_id", "area_id", "labels", "icon", "hidden_by", "disabled_by"];
export const key = (row, field) => JSON.stringify([row.kind, row.id ?? row.object_id, field ?? row.field]);
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const normalizeSearch = (value) => String(value ?? "").normalize("NFD")
  .replace(/\p{M}/gu, "").toLocaleLowerCase();

export function entityStatuses(row, states = {}) {
  const entity = states[row.values?.entity_id];
  const unavailable = entity?.state === "unavailable";
  const restored = entity?.attributes?.restored === true;
  const disabled = Boolean(row.values?.disabled_by);
  const hidden = Boolean(row.values?.hidden_by);
  const readonly = Boolean(row.readonly);
  return {
    available: Boolean(entity?.state) && !unavailable,
    unavailable,
    enabled: !disabled,
    disabled,
    visible: !hidden,
    hidden,
    readonly,
    restored,
    indicator: restored ? "restored" : unavailable ? "unavailable" : disabled ? "disabled" :
      hidden ? "hidden" : readonly ? "readonly" : null,
  };
}

export function canEdit(row, field) {
  if (!Object.hasOwn(row.values, field)) return false;
  return !field.endsWith("_by") || [null, "user"].includes(row.values[field]);
}

export function visibleRows(data, { integrations = [], stateFilters = [], hass, query, expanded, sort, integrationTitle }) {
  const compare = (a, b) => a.title.localeCompare(b.title) * sort;
  const selectedIntegrations = new Set(integrations);
  const selectedStates = new Set(stateFilters);
  const inScope = (row) => !selectedIntegrations.size || selectedIntegrations.has(row.integration);
  const areas = new Map(data.areas.map((item) => [item.id, item.name]));
  const labels = new Map(data.labels.map((item) => [item.id, item.name]));
  const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  const matches = (row) => {
    const text = normalizeSearch([row.title, row.values?.name, row.values?.entity_id, row.integration,
      integrationTitle?.(row.integration), row.config_title, row.subentry_title,
      row.values?.area_id, areas.get(row.values?.area_id), row.effective_area, areas.get(row.effective_area),
      ...(row.values?.labels ?? []).map((id) => labels.get(id) ?? id),
      ...(row.inherited_labels ?? []).map((id) => labels.get(id) ?? id)].join(" "));
    return words.every((word) => text.includes(word));
  };
  const matchesState = (row) => !selectedStates.size ||
    [...selectedStates].some((state) => entityStatuses(row, hass?.states)[state]);
  const devices = new Map(data.devices.map((row) => [row.id, row]));
  const entities = new Map();
  const counts = new Map();
  const orphans = [];
  for (const row of data.entities) {
    if (row.device_id) counts.set(row.device_id, (counts.get(row.device_id) ?? 0) + 1);
    if (!inScope(row) || !matchesState(row)) continue;
    const device = devices.get(row.device_id);
    if (!device) {
      if (matches(row)) orphans.push(row);
      continue;
    }
    if (!matches(row) && !matches(device)) continue;
    if (!entities.has(row.device_id)) entities.set(row.device_id, []);
    entities.get(row.device_id).push(row);
  }
  const result = [];
  for (const row of [...devices.values()].sort(compare)) {
    const children = entities.get(row.id) || [];
    if (selectedStates.size && !children.length) continue;
    if ((!inScope(row) || !matches(row)) && !children.length) continue;
    result.push({ ...row, children: children.length, entityCount: counts.get(row.id) ?? 0,
      editable: inScope(row) && !row.readonly });
    if (expanded.has(row.id) || words.length || selectedStates.size) result.push(...children.sort(compare).map((child) => ({
      ...child, editable: !child.readonly,
    })));
  }
  if (orphans.length) {
    result.push({ kind: "group", id: "orphans", children: orphans.length });
    if (expanded.has("orphans") || words.length || selectedStates.size) result.push(...orphans.sort(compare).map((row) => ({
      ...row, editable: !row.readonly,
    })));
  }
  return result;
}

export function nextCell(rows, index, field, horizontal, reverse) {
  const step = reverse ? -1 : 1;
  if (horizontal) {
    let position = index * fields.length + fields.indexOf(field) + step;
    while (position >= 0 && position < rows.length * fields.length) {
      const row = rows[Math.floor(position / fields.length)];
      const nextField = fields[position % fields.length];
      if (row.values && row.editable !== false && canEdit(row, nextField)) return [row, nextField];
      position += step;
    }
  } else {
    for (let i = index + step; i >= 0 && i < rows.length; i += step) {
      const row = rows[i];
      if (row.values && row.editable !== false && canEdit(row, field)) return [row, field];
    }
  }
  return null;
}

export function bulkPreview(rows, operation, current, input, replacement, option) {
  const field = operation === "area" ? "area_id" : operation.startsWith("label_") ? "labels" : "name";
  const regex = operation === "regex" ? new RegExp(input, "gu") : null;
  return rows.map((row, index) => {
    const before = current(row, field);
    const name = before ?? row.original_name ?? row.title;
    let after;
    switch (operation) {
      case "area": after = option || null; break;
      case "label_add": after = [...new Set([...before, option])].sort(); break;
      case "label_remove": after = before.filter((id) => id !== option); break;
      case "reset": after = null; break;
      case "prefix": after = input + name; break;
      case "suffix": after = name + input; break;
      case "replace": after = name.replaceAll(input, () => replacement); break;
      case "regex": after = name.replace(regex, replacement); break;
      case "number": after = name + " " + (Number(input) + index); break;
    }
    if (field === "name" && after === "") after = null;
    return { row, field, before, after };
  }).filter(({ before, after }) => !same(before, after));
}

export const fields = ["name", "entity_id", "area_id", "labels", "icon", "hidden_by", "disabled_by"];
export const key = (row, field) => JSON.stringify([row.kind, row.id ?? row.object_id, field ?? row.field]);
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function canEdit(row, field) {
  if (!Object.hasOwn(row.values, field)) return false;
  return !field.endsWith("_by") || [null, "user"].includes(row.values[field]);
}

export function visibleRows(data, { integration, query, expanded, sort }) {
  const compare = (a, b) => a.title.localeCompare(b.title) * sort;
  const inScope = (row) => !integration || row.integration === integration;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (row) => {
    const text = [row.title, row.values.name, row.values.entity_id, row.integration,
      row.config_title, row.subentry_title].join(" ").toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  };
  const devices = new Map(data.devices.map((row) => [row.id, row]));
  const entities = new Map();
  const counts = new Map();
  const orphans = [];
  for (const row of data.entities) {
    if (row.device_id) counts.set(row.device_id, (counts.get(row.device_id) ?? 0) + 1);
    if (!inScope(row)) continue;
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
    if ((!inScope(row) || !matches(row)) && !children.length) continue;
    result.push({ ...row, children: children.length, entityCount: counts.get(row.id) ?? 0, editable: inScope(row) });
    if (expanded.has(row.id) || words.length) result.push(...children.sort(compare));
  }
  if (orphans.length) {
    result.push({ kind: "group", id: "orphans", children: orphans.length });
    if (expanded.has("orphans") || words.length) result.push(...orphans.sort(compare));
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

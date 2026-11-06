import { bulkPreview, fields, key } from "./model.js";
import { rowKey, validate } from "./grid.js";
import { button, esc, option, table } from "./html.js";

export function review(panel) {
  const { t, workspace, objects, issues, errors } = panel;
  const rows = workspace.changes.map((op) => {
    const row = objects.get(rowKey(op));
    const issue = issues.get(key(op)) ?? errors.get(key(op));
    return `<tr><td><input type="checkbox" aria-label="${t.select}" data-key="${esc(key(op))}"></td>
      <td>${esc(row?.title ?? op.object_id)}</td><td>${t[op.field]}</td><td>${esc(panel.describe(op.field, op.before))}</td>
      <td>${esc(panel.describe(op.field, op.after))}</td><td>${esc(issue ? t[issue] ?? issue : t.staged)}</td></tr>`;
  });
  return `<section><h2>${t.review}</h2>${button("registry", t.back)} ${button("unstage", t.discard)}
    ${table(t, ["select", "object", "property", "original", "proposed", "result"], rows)}</section>`;
}

export function history(panel) {
  const { t, historyDetail: commit, historyRows: records, historyFilter: filter, baseline, historyOffset } = panel;
  const date = (value) => new Date(value).toLocaleString(panel.hass.language?.startsWith("en") ? "en" : "sk");
  if (baseline) {
    const { devices, entities } = baseline.snapshot;
    return `<section><h2>${t.baseline} · ${esc(date(baseline.created))}</h2>
      ${button("history-back", t.back)}<p>${devices.length} + ${entities.length} · ${t.rows}</p></section>`;
  }
  if (commit) {
    const rows = commit.operations.map((op) => {
      const current = panel.objects.get(rowKey(op))?.values[op.field];
      return `<tr><td><input type="checkbox" aria-label="${t.select}" data-position="${op.position}"
        ${op.status === "saved" ? "" : "disabled"}></td><td>${esc(op.title)}<br><small>${esc(op.integration)}</small></td>
        <td>${t[op.field]}</td><td>${esc(panel.describe(op.field, op.before))}</td>
        <td>${esc(panel.describe(op.field, op.after))}</td>
        <td>${esc(current === undefined ? t.missing_object : panel.describe(op.field, current))}</td>
        <td>${esc(t[op.status] ?? op.status)}${op.error ? " · " + esc(t[op.error] ?? op.error) : ""}
        ${op.source ? `<br>${t.source} <code>${esc(op.source)}</code>` : ""}</td></tr>`;
    });
    return `<section><h2>${esc(commit.message || date(commit.created))}</h2>
      <p><code>${esc(commit.id)}</code> · ${esc(t[commit.status] ?? commit.status)} · ${esc(commit.user_id)}</p>
      ${button("history-back", t.back)} ${button("revert", t.revert)} ${button("revert-selected", t.revert_selected)}
      ${table(t, ["select", "object", "property", "original", "proposed", "current", "result"], rows)}</section>`;
  }
  const rows = records.map((item) => `<tr><td>${esc(item.message || date(item.created))}</td><td>${item.count}</td>
    <td>${esc(t[item.status] ?? item.status)}</td>
    <td>${button("detail", t.details, `data-id="${esc(item.id)}"`)}</td></tr>`);
  const title = filter.object_id ? t.by_object + " · " + (panel.objects.get(rowKey(filter))?.title ?? filter.object_id) : t.history;
  const object = filter.object_id ? panel.objects.get(rowKey(filter)) : null;
  const propertyFilter = object ? `<label>${t.property}<select data-input="history-field">
    ${option("", t.all_fields)}${fields.filter((field) => Object.hasOwn(object.values, field))
      .map((field) => option(field, t[field], filter.field === field)).join("")}</select></label>` : "";
  return `<section><h2>${esc(title)}</h2>${button("baseline", t.baseline)}
    ${filter.object_id ? button("history", t.all_history) : ""}${propertyFilter}
    ${rows.length ? table(t, ["history", "fields", "result", "actions"], rows) : `<p>${t.no_history}</p>`}
    ${button("history-prev", t.prev, historyOffset > 0 ? "" : "disabled")}
    ${button("history-next", t.next, records.length === 50 ? "" : "disabled")}</section>`;
}

const variants = ["area", "label_add", "label_remove", "prefix", "suffix", "replace", "regex", "number", "reset"];
export function bulk(panel) {
  const { t, bulkOperation: op, bulkResult: result, bulkValues: values } = panel;
  const select = op === "area" || op.startsWith("label_");
  const choices = select ? (op === "area" ? panel.options.area_id : panel.options.labels) : null;
  const form = select ? `<label>${t[op === "area" ? "area_id" : "labels"]}<select data-bulk="choice">${option("", t.none)}
    ${[...choices].map(([id, name]) => option(id, name, id === values?.choice)).join("")}</select></label>` :
    op === "reset" ? "" : `<label>${t[op === "number" ? "start" : "text"]}<input data-bulk="input"
    type="${op === "number" ? "number" : "text"}" value="${esc(values?.input ?? (op === "number" ? "1" : ""))}"></label>`;
  const replacement = ["replace", "regex"].includes(op) ?
    `<label>${t.replacement}<input data-bulk="replacement" value="${esc(values?.replacement)}"></label>` : "";
  const rows = result?.map(({ row, field, before, after }) => `<tr><td>${esc(row.title)}</td>
    <td>${esc(panel.describe(field, before))}</td><td>${esc(panel.describe(field, after))}</td></tr>`);
  return `<section><h2>${t.bulk} (${panel.selected.size})</h2>${button("registry", t.back)}
    <div class="toolbar"><select data-input="bulk-operation" aria-label="${t.bulk}">
    ${variants.map((name) => option(name, t[name], name === op)).join("")}</select>
    ${form}${replacement}${button("preview", t.preview)}</div>
    ${rows ? button("apply-bulk", t.apply, rows.length ? "" : "disabled") + table(t, ["object", "original", "proposed"], rows) : ""}
    </section>`;
}

export function preview(panel) {
  const get = (name) => panel.body.querySelector(`[data-bulk="${name}"]`)?.value ?? "";
  const [input, replacement, choice] = ["input", "replacement", "choice"].map(get);
  const op = panel.bulkOperation;
  panel.bulkValues = { input, replacement, choice };
  panel.bulkResult = null;
  if ((["prefix", "suffix", "replace", "regex", "number"].includes(op) && !input) ||
      (op.startsWith("label_") && !choice)) return "required";
  if (op === "number" && !Number.isSafeInteger(Number(input))) return "invalid_value";
  const rows = [...panel.selected].map((id) => panel.objects.get(id)).filter(Boolean);
  try {
    const result = bulkPreview(rows, op, (row, field) => panel.value(row, field), input, replacement, choice);
    const error = result.map(({ row, field, after }) => validate(row, field, after)).find(Boolean);
    if (error) return error;
    panel.bulkResult = result;
  } catch {
    return "invalid_regex";
  }
  return null;
}

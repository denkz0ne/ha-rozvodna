import { fields, canEdit, key, same, nextCell, visibleRows } from "./model.js";
import { button, esc, icon, option, table } from "./html.js";

export const PAGE_SIZE = 100;
export const rowKey = (row) => key(row, "");

export function grid(panel) {
  const { data, t, expanded, selected, query } = panel;
  const all = visibleRows(data, panel);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  panel.page = Math.min(panel.page, pages - 1);
  panel.rows = all.slice(panel.page * PAGE_SIZE, (panel.page + 1) * PAGE_SIZE);
  const rows = panel.rows.map((row, index) => {
    const open = expanded.has(row.id) || !!query.trim();
    const toggle = row.children ? button("expand", open ? "▾" : "▸",
      `class="icon-button" aria-label="${t.expand}" aria-expanded="${open}"`) : "";
    if (!row.values) return `<tr class="group" data-row="${index}"><td>${toggle}</td>
      <td colspan="9">${t.orphans} (${row.children})</td></tr>`;
    const editable = row.editable !== false;
    const check = editable ? `<input type="checkbox" data-input="select" aria-label="${t.select} ${esc(row.title)}"
      ${selected.has(rowKey(row)) ? "checked" : ""}>` : "";
    const context = [row.integration, row.config_title, row.subentry_title].filter(Boolean).join(" · ");
    const storedIcon = row.values.icon ?? row.original_icon;
    const objectIcon = row.kind === "device" ? (row.parent_device_id ? "source-branch" : "devices") :
      /^mdi:[a-z0-9_-]+$/.test(storedIcon ?? "") ? storedIcon.slice(4) : "shape-outline";
    return `<tr class="${row.kind}" data-row="${index}"><td class="toggle">${check}${toggle}</td>
      <td class="object"><div>${icon(objectIcon)}<span title="${esc(row.title)}"><span class="row-title">${esc(row.title)}</span>
      <small title="${esc(context)}">${esc(context)}</small></span></div></td>
      ${fields.map((field) => cell(panel, row, field, editable)).join("")}<td>
      ${button("stage", "✓", `class="icon-button" aria-label="${t.stage}" title="${t.stage}" ${editable && isDirty(panel, row) ? "" : "disabled"}`)}
      ${button("object-history", icon("history"), `class="icon-button" aria-label="${t.by_object}" title="${t.by_object}"`)}</td></tr>`;
  });
  if (!rows.length) rows.push(`<tr><td colspan="10">${t.empty_rows}</td></tr>`);
  return table(t, ["", "object", ...fields, "actions"], rows) + (pages > 1 ? `<div class="toolbar">
    ${button("prev-page", t.prev, panel.page === 0 ? "disabled" : "")} ${panel.page + 1} / ${pages}
    ${button("next-page", t.next, panel.page + 1 === pages ? "disabled" : "")}</div>` : "");
}

const isDirty = (panel, row) => fields.some((field) => panel.working.has(key(row, field)));

function cell(panel, row, field, editable) {
  if (!Object.hasOwn(row.values, field)) return "<td></td>";
  const id = key(row, field);
  const draft = panel.working.get(id);
  const staged = panel.staged.get(id);
  const text = panel.describe(field, panel.value(row, field), draft || staged ? undefined : row);
  if (!editable || !canEdit(row, field)) return `<td class="muted">${esc(text)}</td>`;
  const issue = panel.issues.get(id) ?? panel.errors.get(id) ??
    (draft && !same(draft.before, row.values[field]) ? "changed" : null);
  const state = issue ? "conflict" : draft ? "dirty" : staged ? "staged" : "";
  const { t } = panel;
  const extra = field === "name" ? row.original_name : field === "icon" ? row.original_icon :
    field === "labels" ? row.inherited_labels.map((label) => panel.options.labels.get(label) ?? label).join(", ") : null;
  const hint = [t[field], text, state && t[state], issue && (t[issue] ?? issue),
    extra && ((field === "labels" ? t.inherited : t.original) + " " + extra)].filter(Boolean).join(" · ");
  const marker = state ? `<span aria-hidden="true">${{ dirty: "✎", staged: "✓", conflict: "!" }[state]}</span>` : "";
  return `<td class="editable" data-field="${field}">${button("edit", marker + `<span class="value">${esc(text)}</span>`,
    `class="cell ${state}" aria-label="${esc(hint)}" title="${esc(hint)}"`)}</td>`;
}

export function startEdit(panel, row, field) {
  const index = panel.rows.findIndex((item) => rowKey(item) === rowKey(row));
  const td = panel.body.querySelector(`[data-row="${index}"] [data-field="${field}"]`);
  if (!td) return;
  const value = panel.value(row, field);
  const { t } = panel;
  let control;
  if (field === "labels") {
    control = document.createElement("div");
    control.className = "editor-pop";
    control.tabIndex = -1;
    control.setAttribute("role", "group");
    const options = new Map(panel.options.labels);
    for (const id of value) if (!options.has(id)) options.set(id, id);
    for (const [id, name] of options) {
      const label = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.value = id;
      check.checked = value.includes(id);
      label.append(check, name);
      control.append(label);
    }
    const rect = td.getBoundingClientRect();
    control.style.left = Math.max(0, Math.min(rect.left, window.innerWidth - 220)) + "px";
    control.style.top = Math.max(0, Math.min(rect.bottom, window.innerHeight - 240)) + "px";
  } else if (field === "area_id" || field.endsWith("_by")) {
    control = document.createElement("select");
    control.className = "editor";
    const choices = new Map(field === "area_id" ? panel.options.area_id : [["user", t.yes]]);
    if (value !== null && !choices.has(value)) choices.set(value, value);
    control.size = Math.min(5, Math.max(2, choices.size + 1));
    control.innerHTML = option("", field === "area_id" ? t.none : t.no, value === null) +
      [...choices].map(([id, name]) => option(id, name, id === value)).join("");
  } else {
    control = document.createElement("input");
    control.className = "editor";
    control.type = "text";
    control.placeholder = field === "entity_id" ? "" : t.automatic;
    control.value = value ?? "";
  }
  control.setAttribute("aria-label", t[field]);
  panel.editor = { td, control, row, field, index };
  td.replaceChildren(control);
  control.focus();
  if (control instanceof HTMLInputElement) control.select();
}

export function finishEdit(panel, cancel = false, next = null) {
  if (!panel.editor) return true;
  const { row, field, control, td } = panel.editor;
  if (!cancel) {
    const value = field === "labels" ? [...control.querySelectorAll("input:checked")].map((item) => item.value).sort() :
      (control.value.trim() ? control.value : null);
    const error = validate(row, field, value);
    if (error) {
      control.classList.add("invalid");
      control.setAttribute("aria-invalid", "true");
      control.focus();
      panel.notice(error, true);
      return false;
    }
    panel.draft(row, field, value);
  }
  panel.editor = null;
  const template = document.createElement("template");
  template.innerHTML = "<table><tbody><tr>" + cell(panel, row, field, true) + "</tr></tbody></table>";
  td.replaceChildren(...template.content.querySelector("td").childNodes);
  td.closest("tr").querySelector('[data-action="stage"]').disabled = !isDirty(panel, row);
  panel.renderFooter();
  if (next) startEdit(panel, ...next);
  else if (cancel) td.querySelector("button").focus();
  if (panel.refreshPending) panel.requestRefresh();
  return true;
}

export function navigate(panel, event) {
  if (!panel.editor || event.isComposing) return;
  const { index, field, control } = panel.editor;
  if (!event.composedPath().includes(control)) return;
  if (field === "labels" && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    const checks = [...control.querySelectorAll("input")];
    if (!checks.length) return;
    const from = checks.indexOf(event.target);
    const next = from < 0 ? 0 : (from + (event.key === "ArrowDown" ? 1 : -1) + checks.length) % checks.length;
    event.preventDefault();
    checks[next].focus();
    return;
  }
  if (!["Escape", "Enter", "Tab"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Escape") finishEdit(panel, true);
  else finishEdit(panel, false, nextCell(panel.rows, index, field, event.key === "Tab", event.shiftKey));
}

export function validate(row, field, value) {
  if (field === "entity_id" && (!/^[a-z0-9_]+\.[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/.test(value ?? "") ||
      value.split(".")[0] !== row.values.entity_id.split(".")[0])) return "invalid_entity_id";
  if (field === "icon" && value !== null && !/^[a-z0-9_-]+:[a-z0-9_-]+$/.test(value)) return "invalid_icon";
  if (typeof value === "string" && (!value.trim() || value.length > 255)) return "invalid_value";
  return null;
}

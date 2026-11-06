import { fields, canEdit, entityStatuses, key, same, nextCell, visibleRows } from "./model.js";
import { button, esc, icon, option, registryIcon, table } from "./html.js";
import { labelChip, makePicker, navigatePicker, openPicker } from "./picker.js";

const ENTITY_ICONS = {
  binary_sensor: "checkbox-marked-circle-outline", button: "gesture-tap-button",
  light: "lightbulb", media_player: "speaker", sensor: "eye", switch: "toggle-switch-variant",
  update: "package-up", select: "format-list-bulleted", number: "numeric", fan: "fan",
  cover: "window-shutter", climate: "thermostat", camera: "camera", lock: "lock",
};
export const rowKey = (row) => key(row, "");
const isDirty = (panel, row) => fields.some((field) => panel.working.has(key(row, field)));

export function grid(panel) {
  const { data, t, expanded, selected, query } = panel;
  const all = visibleRows(data, { ...panel, hass: panel.hass, integrationTitle: (id) => panel.integrationTitle(id) });
  panel.rows = all;
  const rows = panel.rows.map((row, index) => {
    const open = expanded.has(row.id) || !!query.trim();
    const toggle = row.children ? button("expand", icon(open ? "chevron-up" : "chevron-down"),
      `class="icon-button" aria-label="${t.expand}" aria-expanded="${open}" ${query.trim() ? "disabled" : ""}`) : "";
    if (!row.values) return `<tr class="group" data-row="${index}"><td class="toggle">${toggle}</td>
      <th scope="row" colspan="8">${t.orphans} (${row.children})</th></tr>`;
    const editable = row.editable !== false;
    const checked = selected.has(rowKey(row));
    const check = editable ? `<input type="checkbox" data-input="select" aria-label="${t.select} ${esc(row.title)}"
      ${checked ? "checked" : ""}>` : "";
    return `<tr class="${row.kind}${row.device_id ? " nested" : ""}" data-row="${index}"
      data-object-id="${esc(row.id)}" aria-selected="${checked}"><td class="toggle">${check}${toggle}</td>
      ${fields.map((field) => cell(panel, row, field, editable)).join("")}<td class="actions">
      ${button("stage", icon("check"), `class="icon-button" aria-label="${t.stage}" title="${t.stage}" ${editable && isDirty(panel, row) ? "" : "disabled"}`)}
      ${button("object-history", icon("history"), `class="icon-button" aria-label="${t.by_object}" title="${t.by_object}"`)}</td></tr>`;
  });
  if (!rows.length) rows.push(`<tr><td colspan="9">${t.empty_rows}</td></tr>`);
  const headings = ["", "object", ...fields.slice(1), "actions"];
  const sort = panel.sort === 1 ? "ascending" : "descending";
  const orderIcon = icon(panel.sort === 1 ? "arrow-up" : "arrow-down");
  return table(t, headings, rows, {
    object: `<th scope="col" aria-sort="${sort}">${button("sort", orderIcon + t.object, 'class="sort-heading"')}</th>`,
  });
}

function nameContent(panel, row, title, editable = true, state = "") {
  const count = row.kind === "device" ? panel.t.entity_count(row.entityCount) : "";
  const integration = !panel.integrations.size ? panel.integrationTitle(row.integration) : "";
  const context = [count, integration].filter(Boolean).join(" · ");
  const domain = row.values.entity_id?.split(".")[0];
  const symbol = row.kind === "device" ? icon("devices") : registryIcon(panel.value(row, "icon") ?? row.original_icon ??
    panel.hass?.states?.[row.values.entity_id]?.attributes?.icon, ENTITY_ICONS[domain] ?? "shape-outline");
  const status = row.kind === "entity" ? entityStatuses(row, panel.hass?.states).indicator : null;
  const statusText = status ? panel.t["status_" + status] : "";
  const statusIcons = { restored: "restore-alert", unavailable: "alert-circle", disabled: "cancel",
    hidden: "eye-off", readonly: "pencil-off" };
  const statusId = `entity-status-${row.id}`;
  const statusMarker = status ? `<span id="${esc(statusId)}" class="entity-status status-${status}" role="img" tabindex="0"
    aria-label="${esc(statusText)}" title="${esc(statusText)}">${icon(statusIcons[status])}
    <ha-tooltip for="${esc(statusId)}">${esc(statusText)}</ha-tooltip></span>` : "";
  const iconAction = row.kind === "device" ? "device-icon" : "entity-icon";
  const iconLabel = row.kind === "device" ? panel.t.open_device : panel.t.more_info;
  const iconClass = row.kind === "device" ? "device-icon-button" : "entity-icon-button";
  const iconId = `object-icon-${row.kind}-${row.id}`;
  const iconButton = `<button id="${esc(iconId)}" type="button" data-action="${iconAction}" class="object-icon ${iconClass}"
    aria-label="${esc(iconLabel)}: ${esc(title)}" title="${esc(iconLabel)}">${symbol}</button>
    <ha-tooltip for="${esc(iconId)}">${esc(iconLabel)}</ha-tooltip>`;
  const marker = state ? `<span class="cell-state">${icon({ dirty: "pencil-outline", staged: "check", conflict: "alert-circle" }[state])}</span>` : "";
  return `<div class="object-content">${statusMarker}${iconButton}${button("edit", `<span class="object-text"><span class="row-title">${esc(title)}</span>
    ${context ? `<small class="object-meta">${esc(context)}</small>` : ""}</span>${marker}`,
    `class="object-name ${state}"
      aria-label="${esc(panel.t.rename_object)}: ${esc(title)}" title="${esc(title)}" ${editable ? "" : "disabled"}`)}</div>`;
}

export function cell(panel, row, field, editable = row.editable !== false) {
  if (!Object.hasOwn(row.values, field)) return "<td></td>";
  const id = key(row, field);
  const draft = panel.working.get(id);
  const staged = panel.staged.get(id);
  const value = panel.value(row, field);
  const text = field === "name" ? (draft || staged ? value ?? row.original_name ?? row.title : row.title) :
    panel.describe(field, value, draft || staged ? undefined : row);
  const area = field === "area_id" ? panel.metadata.area_id.get(value ?? (!draft && !staged ? row.effective_area : null)) : null;
  const issue = panel.issues.get(id) ?? panel.errors.get(id) ??
    (draft && !same(draft.before, row.values[field]) ? "changed" : null);
  const state = issue ? "conflict" : draft ? "dirty" : staged ? "staged" : "";
  const { t } = panel;
  const content = field === "labels" && value.length ? `<span class="labels">${value.map((id) =>
      labelChip(panel.metadata.labels.get(id) ?? { name: id })).join("")}</span>` :
    `<span class="value">${area ? registryIcon(area.icon, "floor-plan") : ""}${esc(text)}</span>`;
  const css = field === "name" ? "object " : "";
  if (field === "hidden_by") {
    const locked = !editable || !canEdit(row, field) || row.readonly;
    const checked = value !== null;
    const state = issue ? "conflict" : draft ? "dirty" : staged ? "staged" : "";
    const label = `${t.hidden_by}: ${panel.describe(field, value, row)}`;
    const tooltip = locked && value !== null ? ` title="${esc(t.managed_state)}"` : "";
    return `<td class="${css}switch-cell ${state}" data-field="${field}">
      <ha-switch data-input="hidden-switch" aria-label="${esc(label)}" aria-checked="${checked}"
        ${checked ? "checked" : ""} ${locked ? "disabled" : ""}${tooltip}></ha-switch></td>`;
  }
  if (field === "name") return `<td class="object editable" data-field="${field}">
    ${nameContent(panel, row, text, editable, state)}</td>`;
  if (!editable || !canEdit(row, field)) return `<td class="${css}muted">${content}</td>`;
  const extra = field === "name" ? row.original_name : field === "icon" ? row.original_icon :
    field === "labels" ? row.inherited_labels.map((label) => panel.options.labels.get(label) ?? label).join(", ") : null;
  const hint = [t[field], text, state && t[state], issue && (t[issue] ?? issue),
    extra && ((field === "labels" ? t.inherited : t.original) + " " + extra)].filter(Boolean).join(" · ");
  const marker = state ? `<span class="cell-state">${icon({ dirty: "pencil-outline", staged: "check", conflict: "alert-circle" }[state])}</span>` : "";
  const picker = field === "area_id" || field === "labels";
  return `<td class="${css}editable" data-field="${field}">${button("edit", content + marker,
    `class="cell ${state}" aria-label="${esc(hint)}" title="${esc(hint)}" ${picker ? 'aria-expanded="false"' : ""}`)}</td>`;
}

export function startEdit(panel, row, field) {
  const index = panel.rows.findIndex((item) => rowKey(item) === rowKey(row));
  const td = panel.body.querySelector(`[data-row="${index}"] [data-field="${field}"]`);
  if (!td) return;
  const value = panel.value(row, field);
  const { t } = panel;
  const picker = field === "area_id" || field === "labels";
  let control;
  if (picker) {
    control = makePicker(panel, field, value, (choice) => {
      control.value = choice;
      finishEdit(panel, false, null, true);
    });
  } else if (field.endsWith("_by")) {
    control = document.createElement("select");
    control.className = "editor";
    control.innerHTML = option("", t.no, value === null) + option("user", t.yes, value === "user");
  } else {
    control = document.createElement("input");
    control.className = "editor";
    control.type = "text";
    control.placeholder = field === "entity_id" ? "" : t.automatic;
    control.value = value ?? (field === "name" ? row.title : "");
  }
  control.setAttribute("aria-label", t[field]);
  panel.editor = { td, control, row, field, index, value, initial: control.value };
  if (picker) {
    const anchor = td.querySelector("button");
    anchor.setAttribute("aria-expanded", "true");
    td.append(control);
    panel.editor.dispose = openPicker(control, anchor);
  } else {
    td.replaceChildren(control);
    control.focus();
    if (control instanceof HTMLInputElement) control.select();
  }
}

export function finishEdit(panel, cancel = false, next = null, restore = false) {
  if (!panel.editor) return true;
  const { row, field, control, td, initial, dispose } = panel.editor;
  if (!cancel) {
    const value = field === "labels" ?
      [...control.querySelectorAll('input[type="checkbox"]:checked')].map((item) => item.value).sort() :
      field === "name" && control.value === initial ? panel.editor.value :
      (control.value?.trim() ? control.value : null);
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
  dispose?.();
  panel.editor = null;
  const template = document.createElement("template");
  template.innerHTML = "<table><tbody><tr>" + cell(panel, row, field, true) + "</tr></tbody></table>";
  td.replaceChildren(...template.content.querySelector("td").childNodes);
  td.closest("tr").querySelector('[data-action="stage"]').disabled = !isDirty(panel, row);
  panel.renderFooter();
  if (next) startEdit(panel, ...next);
  else if (cancel || restore) (td.querySelector(field === "name" ? "button.object-name" : "button.cell") ??
    td.querySelector("button"))?.focus({ preventScroll: true });
  if (panel.stateRenderPending && !next) {
    panel.stateRenderPending = false;
    panel.renderBody();
  }
  if (panel.refreshPending) panel.requestRefresh();
  return true;
}

export function navigate(panel, event) {
  if (!panel.editor || event.isComposing) return;
  const { index, field, control } = panel.editor;
  if (!event.composedPath().includes(control)) return;
  if (control.matches("[popover]") && navigatePicker(control, event)) return;
  if (!["Escape", "Enter", "Tab"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Escape") finishEdit(panel, true);
  else {
    if (field === "area_id" && event.key === "Enter") {
      const choice = event.target.closest("[data-choice]") ??
        control.querySelector("[data-option]:not([hidden])");
      if (choice && (event.target.matches("[data-choice]") || event.target.value.trim())) {
        control.value = choice.dataset.choice || null;
      }
    }
    finishEdit(panel, false, nextCell(panel.rows, index, field, event.key === "Tab", event.shiftKey), true);
  }
}

export function validate(row, field, value) {
  if (field === "entity_id" && (!/^[a-z0-9_]+\.[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/.test(value ?? "") ||
      value.split(".")[0] !== row.values.entity_id.split(".")[0])) return "invalid_entity_id";
  if (field === "icon" && value !== null && !/^[a-z0-9_-]+:[a-z0-9_-]+$/.test(value)) return "invalid_icon";
  if (typeof value === "string" && (!value.trim() || value.length > 255)) return "invalid_value";
  return null;
}

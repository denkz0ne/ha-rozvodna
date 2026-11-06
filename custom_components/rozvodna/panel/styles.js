export default `
:host {
  display: block;
  height: calc(100dvh - var(--safe-area-inset-top, 0px) - var(--safe-area-inset-bottom, 0px));
  color: var(--primary-text-color, #212121);
  background: var(--primary-background-color, #fafafa);
  font: var(--ha-font-weight-normal, 400) var(--ha-font-size-m, 14px) var(--ha-font-family, Roboto, Arial, sans-serif);
  --surface: var(--card-background-color, #fff);
  --line: var(--divider-color, #ddd);
  --outline: var(--outline-color, var(--line));
  --accent: var(--primary-color, #009ac7);
  --muted: var(--secondary-text-color, #606060);
  --row-hover: color-mix(in srgb, var(--primary-text-color, #212121) 4%, var(--surface));
  --group-surface: var(--ha-data-table-background, var(--row-hover));
  --selected-surface: color-mix(in srgb, var(--accent) 12%, var(--surface));
  --filter-width: 248px;
  --control-radius: var(--ha-border-radius-md, 8px);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
main { display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; height: 100%; }
header, .selection-bar, footer { display: flex; align-items: center; gap: 12px; padding: 0 16px; background: var(--surface); }
header { grid-row: 1; min-height: 56px; border-bottom: 1px solid var(--line); }
header strong { font-size: var(--ha-font-size-xl, 20px); font-weight: var(--ha-font-weight-medium, 500); }
.pane-tabs { display: flex; align-self: stretch; margin-inline-start: 8px; }
.pane-tabs button { min-width: 72px; background: transparent; border: 0; border-radius: 0; border-bottom: 2px solid transparent; }
.pane-tabs button[aria-current="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.selection-bar { grid-row: 2; background: var(--selected-surface); min-height: 52px; border-bottom: 1px solid var(--line); }
.registry-toolbar { grid-row: 3; background: var(--surface); border-bottom: 1px solid var(--line); display: flex; min-width: 0; }
.filter-heading, .table-toolbar { display: flex; align-items: center; padding: 8px 12px; gap: 8px; }
.registry-toolbar.has-filters .filter-heading { width: var(--filter-width); flex: none; border-inline-end: 1px solid var(--line); background: var(--group-surface); }
.table-toolbar { flex: 1; min-width: 0; }
.table-toolbar .search-field { flex: 1; min-width: 100px; }
.content { grid-row: 4; display: flex; min-height: 0; min-width: 0; position: relative; }
aside { width: var(--filter-width); flex: none; background: var(--group-surface); overflow-y: auto; border-inline-end: 1px solid var(--line); }
.filter-resizer { width: 6px; flex: none; margin-inline: -3px; z-index: 2; cursor: col-resize; touch-action: none; }
.filter-resizer:hover, .filter-resizer:focus-visible { background: color-mix(in srgb, var(--accent) 30%, transparent); }
.filter-resizer:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
aside details { border-bottom: 1px solid var(--line); }
aside summary { min-height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 16px; cursor: pointer; }
aside summary::-webkit-details-marker { display: none; }
aside details[open] summary > ha-icon { transform: rotate(180deg); }
.filter-count { background: var(--accent); color: var(--text-primary-color, #fff); border-radius: 50%; min-width: 18px; height: 18px; line-height: 18px; text-align: center; font-size: 12px; }
.filter-button[aria-expanded="true"] { background: var(--selected-surface); }
.filter-search { margin: 0 8px 8px; }
.filter-options { max-height: min(50vh, 420px); overflow-y: auto; }
.filter-all-row { padding: 0 8px 8px; }
.filter-all-row .filter-option { min-height: 40px; }
.status-options { max-height: none; }
.filter-option { min-height: 44px; padding: 0 12px; gap: 10px; display: flex; align-items: center; cursor: pointer; }
.filter-option span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filter-option:hover { background: var(--row-hover); }
.filter-option:has(:checked) { background: var(--selected-surface); }
.body { flex: 1; min-width: 0; overflow: auto; background: var(--surface); }
ha-icon { --mdc-icon-size: 20px; width: var(--mdc-icon-size); height: var(--mdc-icon-size); color: var(--muted); display: inline-flex; flex: none; vertical-align: middle; }
button, input, select { font: inherit; color: inherit; }
button, select, input:not([type=checkbox]):not([type=radio]) {
  min-height: 32px; border: 1px solid var(--outline); border-radius: var(--control-radius);
  background: var(--surface); padding: 0 10px;
}
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
button:disabled { opacity: .38; cursor: default; }
button:hover:not(:disabled) { background: var(--row-hover); }
button.primary { background: var(--accent); color: var(--text-primary-color, #fff); border-color: transparent; }
button.primary:hover:not(:disabled) { background: var(--dark-primary-color, #007c9d); }
input[type=checkbox], input[type=radio] { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); cursor: pointer; vertical-align: middle; }
:focus-visible { outline: var(--ha-border-width-md, 2px) solid var(--accent); outline-offset: -2px; }
.search-field, .sort-control { display: flex; align-items: center; gap: 6px; min-height: 32px; border: 1px solid var(--outline); border-radius: 10px; background: var(--surface); padding-inline: 8px; }
.search-field:focus-within, .sort-control:focus-within { border-color: var(--accent); }
.search-field > ha-icon, .sort-control > ha-icon { --mdc-icon-size: 16px; }
.search-field input:not([type=checkbox]), .sort-control select { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; min-height: 30px; outline: none; }
.sort-control select { appearance: none; cursor: pointer; }
.spacer { flex: 1; }
table { width: 100%; border-collapse: separate; border-spacing: 0; }
thead th { text-align: start; position: sticky; top: 0; z-index: 1; background: var(--surface); font-weight: var(--ha-font-weight-medium, 500); height: 48px; }
th, td { padding: 0 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
td { height: var(--data-table-row-height, 52px); }
th[scope=row] { text-align: start; font-weight: var(--ha-font-weight-medium, 500); }
tbody tr:hover { background: var(--row-hover); }
tr[aria-selected=true] { background: var(--selected-surface); }
tr.group, tr.nested { background: var(--group-surface); }
tr.nested:hover { background: color-mix(in srgb, var(--primary-text-color, #212121) 4%, var(--group-surface)); }
tr.nested[aria-selected=true] { background: var(--selected-surface); }
tr.nested td { height: 40px; }
tr.nested .object { padding-inline-start: 26px; }
td.object { min-width: 218px; max-width: 340px; }
td.object .object-content { display: flex; align-items: center; gap: 2px; width: 100%; min-width: 0; }
td.object .object-name { width: auto; min-width: 0; flex: 1; min-height: 34px; justify-content: flex-start;
  text-align: start; border-color: transparent; background: transparent; padding: 2px 5px; border-radius: var(--control-radius); }
td.object .object-name:hover:not(:disabled) { background: var(--row-hover); }
td.object .object-name.dirty { border-color: var(--warning-color, #e88713); }
td.object .object-name.staged { border-color: var(--success-color, #388e3c); }
td.object .object-icon { width: 24px; min-width: 24px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: transparent; }
td.object .object-icon:hover:not(:disabled) { background: var(--row-hover); }
.object-text { min-width: 0; flex: 1; text-align: start; }
.object-text span, .object-meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.object-meta { margin-top: 2px; color: var(--muted); font-size: var(--ha-font-size-s, 12px); }
.entity-status { display: inline-flex; align-items: center; justify-content: center; width: 22px; min-width: 22px;
  color: var(--muted); cursor: help; }
.entity-status ha-icon { --mdc-icon-size: 18px; }
.entity-status.status-unavailable { color: var(--error-color, #db4437); }
.entity-status.status-disabled, .entity-status.status-hidden { color: var(--warning-color, #e88713); }
.entity-status.status-restored { color: var(--primary-color, #03a9f4); }
td.object.muted { white-space: normal; }
td.object.muted .object-text { display: inline-block; vertical-align: middle; margin-inline-start: 6px; }
td.toggle { width: 72px; white-space: nowrap; }
td.toggle button { margin-inline-start: 3px; }
td.actions { width: 76px; }
td.editable { padding: 0 8px; min-width: 78px; }
td.editable[data-field=entity_id] { min-width: 154px; }
td.editable[data-field=labels] { min-width: 100px; }
.switch-cell { min-width: 78px; text-align: center; }
.switch-cell ha-switch { display: inline-block; width: 36px; height: 20px; --mdc-theme-secondary: var(--accent); }
button.cell { width: 100%; justify-content: flex-start; gap: 10px; text-align: start; border-color: transparent;
  background: transparent; min-height: 30px; padding: 2px 4px; }
.cell .value { display: inline-flex; align-items: center; gap: 5px; max-width: 210px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cell .value ha-icon { --mdc-icon-size: 16px; }
.cell-state { margin-inline-start: auto; display: inline-flex; }
.cell-state ha-icon { --mdc-icon-size: 16px; color: inherit; }
.cell.dirty { border-color: var(--warning-color, #e88713); }
.cell.staged { border-color: var(--success-color, #388e3c); }
.cell.conflict, .invalid { border-color: var(--error-color, #b00020) !important; }
.cell.dirty .cell-state { color: var(--warning-color, #a75500); }
.cell.staged .cell-state { color: var(--success-color, #2e7d32); }
.cell.conflict .cell-state { color: var(--error-color, #b00020); }
.muted { color: var(--muted); }
.editor { width: 100%; min-width: 72px; }
.editor-pop { position: fixed; inset: auto; margin: 0; padding: 0; flex-direction: column; color: inherit;
  border: 1px solid var(--outline); border-radius: var(--control-radius); background: var(--surface);
  box-shadow: var(--ha-card-box-shadow, 0 4px 12px #0003); overflow: hidden; }
.editor-pop:popover-open { display: flex; }
.picker-search { flex: none; margin: 8px; }
.picker-options { overflow: auto; }
.picker-option, button.picker-option { width: 100%; display: flex; gap: 10px; justify-content: flex-start; align-items: center;
  min-height: 40px; padding: 0 12px; cursor: pointer; border: 0; border-radius: 0; }
.picker-option:hover, .picker-option:focus-within { background: var(--row-hover); }
.picker-option[aria-pressed=true], .picker-option:has(:checked) { background: var(--selected-surface); }
.picker-name { flex: 1; text-align: start; }
.picker-empty { padding: 0 12px; color: var(--muted); }
.color-dot { width: 16px; height: 16px; border: 1px solid var(--outline); background: var(--chip-color); border-radius: var(--ha-border-radius-sm, 6px); }
.labels { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 240px; padding: 2px 0; }
.label-chip { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 6px; white-space: nowrap;
  font-size: var(--ha-font-size-s, 12px); font-weight: var(--ha-font-weight-medium, 500);
  border-radius: var(--control-radius); background: var(--chip-color, var(--row-hover)); color: var(--chip-text, var(--primary-text-color)); }
.label-chip ha-icon { --mdc-icon-size: 12px; color: inherit; }
button.icon-button, button.sort-heading { background: transparent; border: 0; }
button.icon-button { width: 32px; height: 32px; padding: 0; border-radius: 50%; }
button.sort-heading { padding: 0 4px; }
button.sort-heading ha-icon { --mdc-icon-size: 16px; }
footer { grid-row: 5; min-height: 52px; padding-block: 6px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.notice { margin: 8px 16px; color: var(--error-color, #b00020); }
section { padding: 12px 16px; }
section h2 { margin: 0 0 8px; font-size: var(--ha-font-size-l, 18px); font-weight: var(--ha-font-weight-medium, 500); }
section table { margin-top: 8px; }
section td { padding-block: 6px; }
section label { display: inline-flex; align-items: center; gap: 5px; margin: 4px; }
section .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 6px 0; }
code { overflow-wrap: anywhere; }
@media (max-width: 870px) {
  .registry-toolbar.has-filters .filter-heading { width: auto; background: var(--surface); border: 0; }
  aside { position: absolute; z-index: 2; inset-inline-start: 0; top: 0; bottom: 0; box-shadow: 0 2px 8px #0002; }
  .filter-resizer { display: none; }
}
@media (max-width: 600px) {
  header, .selection-bar, footer, section { padding-inline: 8px; gap: 8px; }
  .table-toolbar, .filter-heading { padding-inline: 6px; }
  .sort-control { max-width: 112px; }
}
`;

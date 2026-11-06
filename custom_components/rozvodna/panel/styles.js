export default `
:host {
  display:block; height:100%; color:var(--primary-text-color,#212121);
  font:var(--ha-font-weight-normal,400) 14px var(--ha-font-family,Roboto,Arial,sans-serif);
  background:var(--primary-background-color,#fafafa);
}
* { box-sizing:border-box; }
main { display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; height:100%; }
header,.toolbar,footer { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:8px 16px;
  background:var(--card-background-color,#fff); border-bottom:1px solid var(--divider-color,#ddd); }
header { min-height:56px; font-size:16px; }
header strong { font-size:20px; font-weight:500; margin-right:14px; }
ha-icon { --mdc-icon-size:20px; color:var(--secondary-text-color,#606060); flex:none; }
button,input,select { font:inherit; color:inherit; }
button,select,input:not([type=checkbox]) { min-height:34px; border:1px solid var(--divider-color,#ddd);
  border-radius:6px; background:var(--card-background-color,#fff); padding:4px 9px; }
button { cursor:pointer; }
button:disabled { opacity:.48; cursor:default; }
button:hover:not(:disabled) { background:var(--secondary-background-color,#eee); }
button.primary { background:var(--primary-color,#0288d1); color:var(--text-primary-color,#fff); border-color:transparent; }
button.primary:hover:not(:disabled) { background:var(--dark-primary-color,#0277bd); }
button[aria-current=true] { color:var(--primary-color,#0288d1); border-color:currentColor; }
:focus-visible { outline:2px solid var(--primary-color,#0288d1); outline-offset:-2px; }
.toolbar label { display:flex; align-items:center; gap:6px; }
.toolbar input[type=search] { width:min(28vw,360px); min-width:175px; }
.spacer { flex:1; }
.body { overflow:auto; position:relative; }
table { width:100%; border-collapse:separate; border-spacing:0; }
th { text-align:left; position:sticky; top:0; z-index:1; background:var(--card-background-color,#fff);
  padding:8px; border-bottom:1px solid var(--divider-color,#ddd); white-space:nowrap; }
td { border-bottom:1px solid var(--divider-color,#ddd); height:42px; padding:0 8px; }
tr.device, tr.group { background:var(--secondary-background-color,#f4f4f4); }
tr.entity td.object { padding-left:28px; }
td.object { min-width:225px; max-width:360px; }
td.object > div { display:flex; align-items:center; gap:6px; }
td.object span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
td.object small { display:block; color:var(--secondary-text-color,#606060); font-size:11px; }
td.toggle { width:62px; white-space:nowrap; }
td.editable { padding:3px 4px; min-width:90px; }
td.editable[data-field=entity_id] { min-width:158px; }
button.cell { width:100%; display:flex; align-items:center; gap:4px; text-align:left; border:1px solid transparent;
  background:transparent; max-width:240px; min-height:33px; padding:4px 6px; }
.cell .value { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.muted { color:var(--secondary-text-color,#606060); }
button.cell.dirty { border-color:var(--warning-color,#e88713); }
button.cell.staged { border-color:var(--success-color,#388e3c); }
button.cell.conflict,.invalid { border-color:var(--error-color,#b00020) !important; }
.editor { width:100%; min-width:100px; }
.editor-pop { position:fixed; z-index:4; display:grid; gap:4px; min-width:180px; max-height:230px; overflow:auto;
  border:1px solid var(--divider-color,#ddd); border-radius:8px; padding:8px; background:var(--card-background-color,#fff);
  box-shadow:var(--ha-card-box-shadow,0 3px 12px #0004); }
.editor-pop label { display:flex; align-items:center; gap:6px; }
.icon-button { padding:0 5px; min-width:27px; min-height:27px; background:transparent; border-color:transparent; }
footer { border-bottom:0; border-top:1px solid var(--divider-color,#ddd); min-height:52px; }
.notice { margin:8px 16px; color:var(--error-color,#b00020); }
section { padding:12px 16px; }
section td { padding:6px 8px; }
section h2 { margin:0 0 10px; font-size:18px; }
section label { display:inline-flex; align-items:center; gap:5px; margin:4px; }
section .toolbar { padding:6px 0; }
code { overflow-wrap:anywhere; }
@media (max-width:720px) { header, .toolbar, footer, section { padding:6px 8px; } }
`;

import { fields, key, normalizeSearch, same } from "./model.js";
import { grid, cell, finishEdit, navigate, rowKey, startEdit } from "./grid.js";
import { bulk, history, preview, review } from "./views.js";
import { button, esc, icon } from "./html.js";
import { filters, toolbar } from "./toolbar.js";
import { language } from "./strings.js";
import styles from "./styles.js";
import { openReplacer } from "./replacer.js";
import { referencePaths } from "./references.js";

const EVENTS = ["device_registry_updated", "entity_registry_updated", "area_registry_updated", "label_registry_updated"];
const blank = () => ({ revision: 0, changes: [], issues: [] });
const MAX_REFERENCE_MATCHES = 5000;

async function addManualReferences(panel, report, renames) {
  const sources = (panel.data?.entities ?? []).filter((row) => ["automation", "script"].includes(
    row.values?.entity_id?.split(".")[0]));
  let sequence = 0;
  const limit = 500;
  const inspected = sources.slice(0, limit);
  const results = [];
  for (let start = 0; start < inspected.length; start += 16) {
    results.push(...await Promise.all(inspected.slice(start, start + 16).map(async (row) => {
      const domain = row.values.entity_id.split(".")[0];
      try {
        const { config } = await panel.hass.callWS({ type: `${domain}/config`, entity_id: row.values.entity_id });
        return { row, domain, config };
      } catch {
        return { row, domain, unavailable: true };
      }
    })));
  }
  report.coverage.automations = results.filter((item) => item.domain === "automation" && !item.unavailable).length;
  report.coverage.scripts = results.filter((item) => item.domain === "script" && !item.unavailable).length;
  report.coverage.unavailable_sources = results.filter((item) => item.unavailable).length + sources.length - inspected.length;
  report.coverage.truncated_matches = false;
  for (const result of results) {
    if (result.unavailable) continue;
    for (const rename of renames) {
      const remaining = MAX_REFERENCE_MATCHES - report.matches.length;
      const found = referencePaths(result.config, rename.before, remaining);
      for (const match of found.matches) {
        report.matches.push({
          id: `manual-${sequence++}`, source_id: `${result.domain}:${result.row.values.entity_id}`,
          source_kind: result.domain, source: `${result.domain === "automation" ? panel.t.automation : panel.t.script} · ${result.row.title}`,
          location: match.path, old: rename.before, new: rename.after, automatic: false, reason: match.reason,
        });
      }
      if (found.truncated) report.coverage.truncated_matches = true;
      if (report.coverage.truncated_matches) break;
    }
    if (report.coverage.truncated_matches) break;
  }
  return report;
}

class RozvodnaPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    Object.assign(this, {
      view: "registry", integrations: new Set(), stateFilters: new Set(), query: "", sort: 1, filterWidth: 248, generation: 0,
      expanded: new Set(), selected: new Set(), selectionAnchor: null, selectionShift: false,
      working: new Map(), errors: new Map(),
      filtersOpen: window.matchMedia("(min-width: 871px)").matches, filterQuery: "",
      objects: new Map(), unsubscribers: [], t: language(),
      historyRows: [], historyFilter: {}, historyOffset: 0,
    });
    this.setWorkspace(blank());
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `<style>${styles}</style><main><header></header><div class="selection-bar" hidden></div>
      <div class="toolbar registry-toolbar"></div><div class="content"><aside id="registry-filters" hidden></aside>
      <div class="filter-resizer" role="separator" aria-orientation="vertical" tabindex="0"
        aria-label="${this.t.resize_filters}" aria-valuemin="192" aria-valuemax="480" aria-valuenow="248"></div>
      <div class="body"></div></div><footer></footer></main>`;
    const root = this.shadowRoot;
    this.header = root.querySelector("header");
    this.toolbar = root.querySelector(".toolbar");
    this.body = root.querySelector(".body");
    this.sidebar = root.querySelector("aside");
    this.selectionBar = root.querySelector(".selection-bar");
    this.footer = root.querySelector("footer");
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    this.mobileQuery = window.matchMedia("(max-width: 870px)");
    this.mobileQuery.addEventListener("change", (event) => {
      this.filtersOpen = !event.matches;
      this.renderToolbar();
    }, options);
    root.addEventListener("click", (event) => this.click(event), options);
    root.addEventListener("change", (event) => this.change(event), options);
    root.addEventListener("input", (event) => this.input(event), options);
    root.addEventListener("keydown", (event) => navigate(this, event), options);
    root.addEventListener("keydown", (event) => this.resizeKeydown(event), options);
    root.addEventListener("pointerdown", (event) => this.resizeStart(event), options);
    root.addEventListener("pointermove", (event) => this.resizeMove(event), options);
    document.addEventListener("pointerup", () => this.resizeEnd(), options);
    this.outside = (event) => {
      if (!this.editor || event.composedPath().includes(this.editor.td)) return;
      if (!finishEdit(this)) {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.button === 0 && event.composedPath().includes(this)) {
        const suppress = (click) => {
          document.removeEventListener("click", suppress, true);
          document.removeEventListener("pointerup", clear, true);
          document.removeEventListener("pointercancel", clear, true);
          if (!click.composedPath().includes(this)) return;
          click.preventDefault();
          click.stopImmediatePropagation();
        };
        const clear = () => setTimeout(() => {
          document.removeEventListener("click", suppress, true);
          document.removeEventListener("pointerup", clear, true);
          document.removeEventListener("pointercancel", clear, true);
        }, 0);
        document.addEventListener("click", suppress, true);
        document.addEventListener("pointerup", clear, { capture: true, once: true });
        document.addEventListener("pointercancel", clear, { capture: true, once: true });
      }
    };
    document.addEventListener("pointerdown", this.outside, true);
    this.render();
    if (this.hass?.user?.is_admin) this.connect();
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.outside, true);
    this.listeners.abort();
    this.editor?.dispose?.();
    this.generation++;
    this.editor = null;
    this.unsubscribe();
  }

  set hass(value) {
    const previous = this._hass;
    this._hass = value;
    this.t = language(value.language);
    if (!this.isConnected) return;
    if (previous?.states !== value.states && this.view === "registry" && this.data) {
      if (this.editor) this.stateRenderPending = true;
      else this.renderBody();
    }
    const identityChanged = previous?.user?.id !== value.user?.id || previous?.user?.is_admin !== value.user?.is_admin;
    if (identityChanged) {
      this.unsubscribe();
      this.generation++;
      this.editor?.dispose?.();
      this.data = this.editor = this.historyDetail = this.baseline = null;
      this.view = "registry";
      this.working.clear();
      this.errors.clear();
      this.selected.clear();
      this.selectionAnchor = null;
      this.selectionShift = false;
      this.setWorkspace(blank());
      this.render();
    }
    if (!value.user?.is_admin) return;
    if (identityChanged || previous?.connection !== value.connection) this.connect();
    else if (previous?.connected === false && value.connected) this.requestRefresh();
  }

  get hass() { return this._hass; }

  set narrow(value) {
    if (value === this._narrow) return;
    this._narrow = value;
    if (value) this.filtersOpen = false;
    if (this.header) this.renderHeader();
    if (this.toolbar) this.renderToolbar();
  }

  connect() {
    this.unsubscribe();
    this.requestRefresh(0);
    const generation = this.generation;
    const connection = this.hass.connection;
    if (!connection?.subscribeEvents) return;
    for (const type of EVENTS) {
      connection.subscribeEvents(() => this.requestRefresh(), type).then((stop) => {
        if (generation === this.generation && this.isConnected) this.unsubscribers.push(stop);
        else stop();
      }).catch(() => {});
    }
  }

  unsubscribe() {
    for (const stop of this.unsubscribers.splice(0)) Promise.resolve(stop()).catch(() => {});
    clearTimeout(this.refreshTimer);
    this.refreshPending = false;
  }

  requestRefresh(delay = 400) {
    clearTimeout(this.refreshTimer);
    this.refreshPending = true;
    this.refreshTimer = setTimeout(() => {
      if (!this.isConnected || this.busy || this.editor) return;
      this.refreshPending = false;
      this.run(() => this.load(), true);
    }, delay);
  }

  ws(type, data = {}) { return this.hass.callWS({ type: "rozvodna/" + type, ...data }); }

  setWorkspace(state) {
    this.workspace = state;
    this.staged = new Map(state.changes.map((op) => [key(op), op]));
    this.issues = new Map(state.issues.map((op) => [key(op), op.code]));
  }

  async load() {
    const generation = this.generation;
    const [data, state] = await Promise.all([this.ws("snapshot"), this.ws("state")]);
    if (generation !== this.generation) return;
    this.data = data;
    this.setWorkspace(state);
    this.objects = new Map([...data.devices, ...data.entities].map((row) => [rowKey(row), row]));
    this.metadata = {
      area_id: new Map(data.areas.map((item) => [item.id, item])),
      labels: new Map(data.labels.map((item) => [item.id, item])),
    };
    this.options = {
      area_id: new Map(data.areas.map(({ id, name }) => [id, name])),
      labels: new Map(data.labels.map(({ id, name }) => [id, name])),
    };
  }

  async run(task, quiet = false) {
    if (this.busy) return;
    this.busy = true;
    if (!quiet) this.notice("");
    try {
      await task();
    } catch (error) {
      this.notice(error.code || "network", true);
    } finally {
      this.busy = false;
      if (this.isConnected && !this.editor) this.render(quiet);
      if (this.refreshPending) this.requestRefresh();
    }
  }

  value(row, field) {
    const id = key(row, field);
    return this.working.has(id) ? this.working.get(id).after :
      this.staged.has(id) ? this.staged.get(id).after : row.values[field];
  }

  draft(row, field, after) {
    const id = key(row, field);
    const draft = this.working.get(id);
    const staged = this.staged.get(id);
    const before = draft ? draft.before : row.values[field];
    this.errors.delete(id);
    if (same(after, staged ? staged.after : before)) this.working.delete(id);
    else this.working.set(id, { kind: row.kind, object_id: row.id, field, before, after });
  }

  describe(field, value, row) {
    const { t, options } = this;
    if (value === null) {
      if (field === "area_id" && row?.effective_area) {
        return (options.area_id.get(row.effective_area) ?? row.effective_area) + " · " + t.inherited;
      }
      if (field === "name" || field === "icon") return t.automatic;
      return field.endsWith("_by") ? t.no : "—";
    }
    if (field.endsWith("_by")) return value === "user" ? t.yes : t.managed + " (" + value + ")";
    if (field === "area_id") return options?.area_id.get(value) ?? value;
    if (field === "labels") return value.map((id) => options?.labels.get(id) ?? id).join(", ") || "—";
    return value;
  }

  integrationTitle(domain) {
    return this.hass?.localize?.("component." + domain + ".title") || domain;
  }

  render(quiet = false) {
    this.renderHeader();
    if (!quiet || this.shadowRoot.activeElement?.type !== "search") this.renderToolbar();
    this.renderSelection();
    this.renderBody();
    this.renderFooter();
  }

  renderHeader() {
    const { t, view } = this;
    this.header.innerHTML = (this._narrow ? "<ha-menu-button></ha-menu-button>" : "") +
      "<strong>Rozvodňa</strong>" + '<nav class="pane-tabs">' +
      button("registry", t.registry, `aria-current="${view !== "history"}"`) +
      button("history", t.history, `aria-current="${view === "history"}"`) +
      '</nav><span class="spacer"></span>' +
      button("refresh", icon("refresh"), `class="icon-button" aria-label="${t.refresh}" title="${t.refresh}"`);
    const menu = this.header.querySelector("ha-menu-button");
    if (menu) { menu.hass = this.hass; menu.narrow = this._narrow; }
  }

  renderToolbar() {
    const visible = this.view === "registry" && Boolean(this.data);
    this.toolbar.hidden = !visible;
    this.sidebar.hidden = !visible || !this.filtersOpen;
    this.shadowRoot.querySelector(".content").classList.toggle("filters-open", visible && this.filtersOpen);
    const resizer = this.shadowRoot.querySelector(".filter-resizer");
    resizer.hidden = !visible || !this.filtersOpen || window.matchMedia("(max-width: 870px)").matches;
    this.applyFilterWidth();
    this.toolbar.classList.toggle("has-filters", visible && this.filtersOpen);
    this.toolbar.innerHTML = visible ? toolbar(this) : "";
    this.sidebar.innerHTML = visible && this.filtersOpen ? filters(this) : "";
  }

  applyFilterWidth() {
    const content = this.shadowRoot.querySelector(".content");
    const resizer = this.shadowRoot.querySelector(".filter-resizer");
    content.style.setProperty("--filter-width", `${this.filterWidth}px`);
    resizer.setAttribute("aria-valuenow", String(this.filterWidth));
  }

  setFilterWidth(value) {
    const maximum = Math.max(192, Math.min(480, Math.floor(this.clientWidth * 0.45)));
    this.filterWidth = Math.max(192, Math.min(maximum, Math.round(value)));
    this.applyFilterWidth();
    this.shadowRoot.querySelector(".filter-resizer").setAttribute("aria-valuemax", String(maximum));
  }

  resizeStart(event) {
    const resizer = event.target.closest?.(".filter-resizer");
    if (!resizer || resizer.hidden) return;
    event.preventDefault();
    this.resizePointer = { x: event.clientX, width: this.filterWidth, id: event.pointerId };
    resizer.setPointerCapture?.(event.pointerId);
  }

  resizeMove(event) {
    if (!this.resizePointer || this.resizePointer.id !== event.pointerId) return;
    this.setFilterWidth(this.resizePointer.width + event.clientX - this.resizePointer.x);
  }

  resizeEnd() { this.resizePointer = null; }

  resizeKeydown(event) {
    if (!event.target.matches?.(".filter-resizer")) return;
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "ArrowRight") this.setFilterWidth(this.filterWidth + step);
    else if (event.key === "ArrowLeft") this.setFilterWidth(this.filterWidth - step);
    else if (event.key === "Home") this.setFilterWidth(192);
    else if (event.key === "End") this.setFilterWidth(480);
    else return;
    event.preventDefault();
  }

  renderSelection() {
    const { t, selected } = this;
    this.selectionBar.hidden = this.view !== "registry" || !selected.size;
    this.selectionBar.innerHTML = this.selectionBar.hidden ? "" :
      button("clear-selection", icon("close"), `class="icon-button" aria-label="${t.clear_selection}"`) +
      `<span>${t.selected} ${selected.size}</span><span class="spacer"></span>` +
      button("bulk", icon("playlist-edit") + t.bulk + " (" + selected.size + ")");
  }

  renderBody() {
    if (!this.hass?.user?.is_admin) this.body.innerHTML = `<p class="notice">${this.t.forbidden}</p>`;
    else if (this.view === "history") this.body.innerHTML = history(this);
    else if (this.view === "bulk") this.body.innerHTML = bulk(this);
    else if (this.view === "review") this.body.innerHTML = review(this);
    else this.body.innerHTML = this.data ? grid(this) : `<p class="notice">${this.t.saving}</p>`;
  }

  renderFooter() {
    if (!this.hass?.user?.is_admin) { this.footer.innerHTML = ""; return; }
    const { t } = this;
    if (!this.footer.firstChild) {
      this.footer.innerHTML = '<span class="counts"></span><span role="status"></span><span class="spacer"></span>' +
        button("review", "") + button("save", "", 'class="primary"');
    }
    const rows = new Set(this.workspace.changes.map(rowKey)).size;
    this.footer.querySelector(".counts").textContent =
      `${t.draft_fields} ${this.working.size} · ${t.staged_rows} ${rows} / ${t.fields.toLocaleLowerCase()} ${this.staged.size}`;
    const status = this.footer.querySelector("[role=status]");
    status.textContent = this.busy ? t.saving : this.message || "";
    status.className = !this.busy && this.messageError ? "notice" : "muted";
    for (const [action, label] of [["review", t.review], ["save", t.save]]) {
      const control = this.footer.querySelector(`[data-action="${action}"]`);
      control.textContent = label;
      control.disabled = !this.staged.size || this.busy;
    }
  }

  notice(code, error = false) {
    this.message = this.t[code] ?? (error ? this.t.network : code);
    this.messageError = error;
    this.renderFooter();
  }

  input(event) {
    if (event.target.dataset.input === "filter-search") {
      this.filterQuery = event.target.value;
      const query = normalizeSearch(this.filterQuery.trim());
      for (const item of this.sidebar.querySelectorAll("[data-filter-item]")) {
        item.hidden = !item.dataset.filterItem.includes(query);
      }
    } else if (event.target.dataset.input === "search") {
      this.query = event.target.value;
      this.body.scrollTop = 0;
      this.renderBody();
    }
  }

  updateSelection(input) {
    const index = Number(input.closest("tr").dataset.row);
    const row = this.rows[index];
    if (!row) return;
    const checked = input.checked;
    const anchorIndex = this.selectionAnchor ? this.rows.findIndex((item) => item.values &&
      rowKey(item) === this.selectionAnchor) : -1;
    if (this.selectionShift && anchorIndex >= 0) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      for (let i = start; i <= end; i++) {
        const item = this.rows[i];
        if (!item?.values || item.editable === false) continue;
        const id = rowKey(item);
        if (checked) this.selected.add(id);
        else this.selected.delete(id);
        const tr = this.body.querySelector(`tr[data-row="${i}"]`);
        const checkbox = tr?.querySelector('input[data-input="select"]');
        if (checkbox) checkbox.checked = checked;
        tr?.setAttribute("aria-selected", String(checked));
      }
    } else {
      const id = rowKey(row);
      if (checked) this.selected.add(id);
      else this.selected.delete(id);
      input.closest("tr").setAttribute("aria-selected", String(checked));
      this.selectionAnchor = id;
    }
    this.selectionShift = false;
    this.renderSelection();
  }

  change(event) {
    const input = event.target;
    switch (input.dataset.input) {
      case "sort":
        this.sort = Number(input.value);
        this.body.scrollTop = 0;
        this.renderBody();
        break;
      case "integration":
        if (input.checked) this.integrations.add(input.value);
        else this.integrations.delete(input.value);
        this.selected.clear();
        this.selectionAnchor = null;
        this.selectionShift = false;
        this.body.scrollTop = 0;
        this.render();
        break;
      case "all-integrations":
        this.integrations.clear();
        this.selected.clear();
        this.selectionAnchor = null;
        this.selectionShift = false;
        this.body.scrollTop = 0;
        this.render();
        break;
      case "state-filter":
        if (input.checked) this.stateFilters.add(input.value);
        else this.stateFilters.delete(input.value);
        this.selected.clear();
        this.selectionAnchor = null;
        this.selectionShift = false;
        this.body.scrollTop = 0;
        this.render();
        break;
      case "hidden-switch": {
        const row = this.rows[Number(input.closest("tr").dataset.row)];
        if (!row || input.disabled) return;
        this.draft(row, "hidden_by", input.checked ? "user" : null);
        const td = input.closest("td");
        const template = document.createElement("template");
        template.innerHTML = "<table><tbody><tr>" + cell(this, row, "hidden_by") + "</tr></tbody></table>";
        td.replaceChildren(...template.content.querySelector("td").childNodes);
        td.closest("tr").querySelector('[data-action="stage"]').disabled = !fields.some((field) => this.working.has(key(row, field)));
        this.renderFooter();
        break;
      }
      case "select": {
        this.updateSelection(input);
        break;
      }
      case "history-field":
        if (input.value) this.historyFilter.field = input.value;
        else delete this.historyFilter.field;
        this.historyOffset = 0;
        this.loadHistory();
        break;
      case "bulk-operation":
        this.bulkOperation = input.value;
        this.bulkValues = this.bulkResult = null;
        this.bulkSkipped = 0;
        this.renderBody();
        break;
    }
  }

  show(view) {
    this.view = view;
    this.body.scrollTop = 0;
    this.render();
  }

  async click(event) {
    const selectionInput = event.target.closest?.('input[data-input="select"]');
    if (selectionInput) {
      this.selectionShift = event.shiftKey;
      return;
    }
    const target = event.target.closest("button[data-action]");
    if (!target || target.disabled || this.busy || !this.hass?.user?.is_admin) return;
    const field = target.closest("td")?.dataset.field;
    const row = this.rows?.[Number(target.closest("tr")?.dataset.row)];
    const action = target.dataset.action;
    const closePicker = action === "edit" && this.editor?.td === target.closest("td") &&
      this.editor.control.matches("[popover]");
    if (this.editor && !finishEdit(this, false, null, closePicker)) return;
    if (closePicker) return;
    switch (action) {
      case "edit": startEdit(this, row, field); break;
      case "replace-device": openReplacer(this, row); break;
      case "entity-icon":
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true,
          detail: { entityId: row.values.entity_id } }));
        break;
      case "device-icon":
        window.open(`/config/devices/device/${encodeURIComponent(row.id)}`, "_blank", "noopener");
        window.focus();
        break;
      case "expand":
        if (this.expanded.has(row.id)) this.expanded.delete(row.id);
        else this.expanded.add(row.id);
        this.renderBody();
        break;
      case "filters":
        this.filtersOpen = !this.filtersOpen;
        this.renderToolbar();
        this.toolbar.querySelector('[data-action="filters"]').focus();
        break;
      case "clear-selection":
        this.selected.clear();
        this.selectionAnchor = null;
        this.selectionShift = false;
        this.renderSelection();
        this.renderBody();
        break;
      case "sort":
        this.sort *= -1;
        this.body.scrollTop = 0;
        this.render();
        break;
      case "stage": await this.run(() => this.stageRow(row)); break;
      case "save": await this.save(); break;
      case "refresh": await this.run(() => this.load()); break;
      case "registry": this.show("registry"); break;
      case "review": this.show("review"); break;
      case "bulk":
        this.bulkOperation = "area";
        this.bulkValues = this.bulkResult = null;
        this.bulkSkipped = 0;
        this.show("bulk");
        break;
      case "preview": {
        const error = preview(this);
        this.notice(error ?? "", !!error);
        this.renderBody();
        break;
      }
      case "apply-bulk":
        for (const { row, field, after } of this.bulkResult) this.draft(row, field, after);
        this.show("registry");
        break;
      case "unstage": await this.run(() => this.unstage()); break;
      case "history": await this.openHistory(); break;
      case "object-history": await this.openHistory({ kind: row.kind, object_id: row.id }); break;
      case "history-prev": case "history-next":
        this.historyOffset += action === "history-next" ? 50 : -50;
        await this.loadHistory();
        break;
      case "history-back":
        this.historyDetail = this.baseline = null;
        this.renderBody();
        break;
      case "detail":
        await this.run(async () => { this.historyDetail = await this.ws("detail", { commit_id: target.dataset.id }); });
        break;
      case "baseline":
        await this.run(async () => { this.baseline = await this.ws("baseline"); });
        break;
      case "revert": case "revert-selected": await this.revert(action === "revert-selected"); break;
    }
  }

  async stageRow(row) {
    const changes = fields.map((field) => this.working.get(key(row, field))).filter(Boolean);
    this.setWorkspace(await this.ws("stage", { revision: this.workspace.revision, changes }));
    for (const op of changes) this.working.delete(key(op));
  }

  async save() {
    const renames = this.workspace.changes.filter((op) => op.field === "entity_id");
    const rename = renames.length > 0;
    if (rename && !window.confirm(this.t.rename)) return;
    await this.run(async () => {
      let referenceReview = null;
      if (rename) {
        const report = await this.ws("references", { revision: this.workspace.revision });
        await addManualReferences(this, report, renames);
        referenceReview = await this.reviewReferences(report);
        if (!referenceReview) return;
      }
      const result = await this.ws("commit", {
        revision: this.workspace.revision, acknowledge_rename: rename,
        ...(referenceReview ? { reference_token: referenceReview.token, reference_ids: referenceReview.ids } : {}),
      });
      if (result.status === "conflict") {
        this.issues = new Map(result.issues.map((op) => [key(op), op.code]));
      } else {
        this.errors = new Map(result.operations.filter((op) => op.error).map((op) => [key(op), op.error]));
        for (const op of result.operations.filter((item) => item.status === "saved")) {
          const draft = this.working.get(key(op));
          if (!draft || !same(draft.before, op.before)) continue;
          if (same(draft.after, op.after)) this.working.delete(key(op));
          else draft.before = op.after;
        }
        await this.load();
      }
      this.notice(result.status, result.status !== "saved");
      if (result.operations?.some((op) => op.status === "saved" && op.field === "disabled_by" && op.after === null)) {
        this.message += " · " + this.t.enabled_note;
      }
    });
  }

  reviewReferences(report) {
    const dialog = document.createElement("dialog");
    dialog.className = "reference-dialog";
    const automatic = report.matches.filter((item) => item.automatic);
    const manual = report.matches.filter((item) => !item.automatic);
    const { t } = this;
    const autoRows = automatic.map((item) => `<label class="reference-match">
      <input type="checkbox" data-reference-id="${esc(item.id)}" checked>
      <span><strong>${esc(item.source)}</strong><small>${esc(item.location)} · ${esc(item.old)} → ${esc(item.new)}</small></span>
    </label>`).join("");
    const manualRows = manual.map((item) => `<li><strong>${esc(item.source)}</strong>
      <code>${esc(item.location)}</code> · ${esc(item.old)} → ${esc(item.new)}
      <small>${esc(t[item.reason] ?? t.reference_manual)}</small></li>`).join("");
    const unknownYaml = report.coverage.yaml_dashboards;
    dialog.innerHTML = `<section role="document">
      <h2>${esc(t.reference_title)}</h2><p>${esc(t.reference_scope)}</p>
      <h3>${esc(t.reference_auto)} (${automatic.length})</h3>
      ${autoRows || `<p class="muted">${esc(t.reference_none_auto)}</p>`}
      ${manual.length ? `<h3>${esc(t.reference_manual_heading)} (${manual.length})</h3><ul class="reference-list">${manualRows}</ul>` : ""}
      <p class="reference-coverage">${esc(t.reference_coverage(unknownYaml, report.coverage.automations ?? 0,
        report.coverage.scripts ?? 0, report.coverage.unavailable_sources ?? 0,
        report.coverage.unavailable_dashboards ?? 0, report.coverage.truncated_matches ?? false))}</p>
      <div class="reference-actions">
        <button type="button" data-choice="cancel">${esc(t.cancel)}</button>
        <button type="button" data-choice="skip">${esc(t.save_without_repairs)}</button>
        <button type="button" class="primary" data-choice="apply" ${automatic.length ? "" : "disabled"}>${esc(t.apply_repairs)}</button>
      </div>
    </section>`;
    this.shadowRoot.append(dialog);
    return new Promise((resolve) => {
      let finished = false;
      const finish = (choice) => {
        if (finished) return;
        finished = true;
        dialog.close();
        dialog.remove();
        resolve(choice);
      };
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
      dialog.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
        if (button.dataset.choice === "cancel") return finish(null);
        const ids = button.dataset.choice === "apply" ? [...dialog.querySelectorAll("[data-reference-id]:checked")]
          .map((input) => input.dataset.referenceId) : [];
        finish({ token: report.token, ids });
      }));
      dialog.showModal();
      dialog.querySelector("[data-choice=apply]:not(:disabled)")?.focus();
    });
  }

  async unstage() {
    const drop = [...this.body.querySelectorAll("input[data-key]:checked")].map((check) =>
      JSON.parse(check.dataset.key)).map(([kind, object_id, field]) => ({ kind, object_id, field }));
    if (!drop.length) return;
    this.setWorkspace(await this.ws("stage", { revision: this.workspace.revision, changes: [], drop }));
    for (const item of drop) this.errors.delete(key(item));
  }

  async openHistory(filter = {}) {
    this.historyFilter = filter;
    this.historyDetail = this.baseline = null;
    this.historyRows = [];
    this.historyOffset = 0;
    this.show("history");
    await this.loadHistory();
  }

  async loadHistory() {
    await this.run(async () => {
      this.historyRows = await this.ws("history", { ...this.historyFilter, offset: this.historyOffset });
    });
  }

  async revert(selected) {
    const positions = selected ? [...this.body.querySelectorAll("input[data-position]:checked")].map((item) =>
      Number(item.dataset.position)) : null;
    const args = { revision: this.workspace.revision, commit_id: this.historyDetail.id };
    if (positions) args.positions = positions;
    const ops = this.historyDetail.operations.filter((op) => op.status === "saved" &&
      (!positions || positions.includes(op.position)));
    if (ops.some((op) => this.working.has(key(op)))) {
      this.notice("already_staged", true);
      return;
    }
    await this.run(async () => {
      this.setWorkspace(await this.ws("revert", args));
      this.show("review");
    });
  }
}

if (!customElements.get("rozvodna-panel")) customElements.define("rozvodna-panel", RozvodnaPanel);

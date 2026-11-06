import { fields, key, same } from "./model.js";
import { grid, finishEdit, navigate, rowKey, startEdit } from "./grid.js";
import { bulk, history, preview, review } from "./views.js";
import { button, esc, option } from "./html.js";
import { language } from "./strings.js";
import styles from "./styles.js";

const EVENTS = ["device_registry_updated", "entity_registry_updated", "area_registry_updated", "label_registry_updated"];
const blank = () => ({ revision: 0, changes: [], issues: [] });

class RozvodnaPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    Object.assign(this, {
      view: "registry", integration: "", query: "", sort: 1, page: 0, generation: 0,
      expanded: new Set(), selected: new Set(), working: new Map(), errors: new Map(),
      objects: new Map(), unsubscribers: [], t: language(),
      historyRows: [], historyFilter: {}, historyOffset: 0,
    });
    this.setWorkspace(blank());
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `<style>${styles}</style><main><header></header><div class="toolbar"></div>
      <div class="body"></div><footer></footer></main>`;
    const root = this.shadowRoot;
    this.header = root.querySelector("header");
    this.toolbar = root.querySelector(".toolbar");
    this.body = root.querySelector(".body");
    this.footer = root.querySelector("footer");
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    root.addEventListener("click", (event) => this.click(event), options);
    root.addEventListener("change", (event) => this.change(event), options);
    root.addEventListener("input", (event) => this.input(event), options);
    root.addEventListener("keydown", (event) => navigate(this, event), options);
    this.outside = (event) => {
      if (this.editor && !event.composedPath().includes(this.editor.td) && !finishEdit(this)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", this.outside, true);
    this.render();
    if (this.hass?.user?.is_admin) this.connect();
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.outside, true);
    this.listeners.abort();
    this.generation++;
    this.editor = null;
    this.unsubscribe();
  }

  set hass(value) {
    const previous = this._hass;
    this._hass = value;
    this.t = language(value.language);
    if (!this.isConnected) return;
    const identityChanged = previous?.user?.id !== value.user?.id || previous?.user?.is_admin !== value.user?.is_admin;
    if (identityChanged) {
      this.unsubscribe();
      this.generation++;
      this.data = this.editor = this.historyDetail = this.baseline = null;
      this.view = "registry";
      this.working.clear();
      this.errors.clear();
      this.selected.clear();
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
    if (this.header) this.renderHeader();
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

  render(quiet = false) {
    this.renderHeader();
    if (!quiet || !this.toolbar.querySelector("select")) this.renderToolbar();
    this.renderBody();
    this.renderFooter();
  }

  renderHeader() {
    const { t, view } = this;
    this.header.innerHTML = (this._narrow ? "<ha-menu-button></ha-menu-button>" : "") +
      `<img src="${new URL("./mark.svg", import.meta.url)}" alt="" width="26" height="26"><strong>Rozvodňa</strong>` +
      button("registry", t.registry, `aria-current="${view === "registry"}"`) +
      button("history", t.history, `aria-current="${view === "history"}"`) +
      '<span class="spacer"></span>' + button("refresh", t.refresh);
    const menu = this.header.querySelector("ha-menu-button");
    if (menu) { menu.hass = this.hass; menu.narrow = this._narrow; }
  }

  renderToolbar() {
    const { t, data, selected } = this;
    this.toolbar.hidden = this.view !== "registry" || !data;
    if (this.toolbar.hidden) { this.toolbar.innerHTML = ""; return; }
    const integrations = [...new Set([...data.devices, ...data.entities].map((row) => row.integration))].sort();
    this.toolbar.innerHTML = `<label>${t.integration}<select data-input="integration">${option("", t.all)}
      ${integrations.map((name) => option(name, name, this.integration === name)).join("")}</select></label>
      <input type="search" data-input="search" aria-label="${t.search}" placeholder="${t.search}" value="${esc(this.query)}">
      ${button("sort", this.sort === 1 ? t.up : t.down)}<span class="spacer"></span>
      ${button("bulk", t.bulk + " (" + selected.size + ")", selected.size ? "" : "disabled")}`;
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
    if (event.target.dataset.input === "search") {
      this.query = event.target.value;
      this.page = this.body.scrollTop = 0;
      this.renderBody();
    }
  }

  change(event) {
    const input = event.target;
    switch (input.dataset.input) {
      case "integration":
        if (this.working.size && !window.confirm(this.t.discard_dirty)) {
          input.value = this.integration;
          return;
        }
        this.working.clear();
        this.selected.clear();
        this.integration = input.value;
        this.page = this.body.scrollTop = 0;
        this.render();
        break;
      case "select": {
        const row = this.rows[Number(input.closest("tr").dataset.row)];
        if (input.checked) this.selected.add(rowKey(row));
        else this.selected.delete(rowKey(row));
        const control = this.toolbar.querySelector('[data-action="bulk"]');
        control.textContent = this.t.bulk + " (" + this.selected.size + ")";
        control.disabled = !this.selected.size;
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
    const target = event.target.closest("button[data-action]");
    if (!target || target.disabled || this.busy || !this.hass?.user?.is_admin) return;
    const field = target.closest("td")?.dataset.field;
    const row = this.rows?.[Number(target.closest("tr")?.dataset.row)];
    if (this.editor && !finishEdit(this)) return;
    const action = target.dataset.action;
    switch (action) {
      case "edit": startEdit(this, row, field); break;
      case "expand":
        if (this.expanded.has(row.id)) this.expanded.delete(row.id);
        else this.expanded.add(row.id);
        this.renderBody();
        break;
      case "sort":
        this.sort *= -1;
        this.page = this.body.scrollTop = 0;
        this.render();
        break;
      case "prev-page": case "next-page":
        this.page += action === "next-page" ? 1 : -1;
        this.body.scrollTop = 0;
        this.renderBody();
        break;
      case "stage": await this.run(() => this.stageRow(row)); break;
      case "save": await this.save(); break;
      case "refresh": await this.run(() => this.load()); break;
      case "registry": this.show("registry"); break;
      case "review": this.show("review"); break;
      case "bulk":
        this.bulkOperation = "area";
        this.bulkValues = this.bulkResult = null;
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
    const rename = this.workspace.changes.some((op) => op.field === "entity_id");
    if (rename && !window.confirm(this.t.rename)) return;
    await this.run(async () => {
      const result = await this.ws("commit", { revision: this.workspace.revision, acknowledge_rename: rename });
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

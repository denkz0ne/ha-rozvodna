import { normalizeSearch } from "./model.js";
import { button, esc, icon, option } from "./html.js";

const STATUS_FILTERS = ["available", "unavailable", "enabled", "disabled", "visible", "hidden", "readonly", "restored"];

export function toolbar(panel) {
  const { t, query, sort, integrations, stateFilters, filtersOpen } = panel;
  const count = integrations.size + stateFilters.size;
  const filter = icon("filter-variant") + t.filters + (count ? `<span class="filter-count">${count}</span>` : "");
  return `<div class="filter-heading">
    ${button("filters", filter, `class="filter-button" aria-controls="registry-filters" aria-expanded="${filtersOpen}"`)}
  </div><div class="table-toolbar">
    <label class="search-field">${icon("magnify")}<input type="search" data-input="search"
      aria-label="${t.search}" placeholder="${t.search}" value="${esc(query)}"></label>
    <label class="sort-control"><select data-input="sort" aria-label="${t.sort}">
      ${option("1", t.up, sort === 1)}${option("-1", t.down, sort === -1)}</select>${icon("chevron-down")}</label>
  </div>`;
}

export function filters(panel) {
  const { t, data, integrations: selectedIntegrations, stateFilters, filterQuery } = panel;
  const allIntegrations = [...new Set([...data.devices, ...data.entities].map((row) => row.integration))]
    .map((id) => ({ id, title: panel.integrationTitle(id) }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const query = normalizeSearch(filterQuery.trim());
  const integrationChoices = allIntegrations.map(({ id, title }) => {
    const searchValue = normalizeSearch(id + " " + title);
    return `<label class="filter-option" data-filter-item="${esc(searchValue)}" ${query && !searchValue.includes(query) ? "hidden" : ""}>
      ${icon("puzzle-outline")}<span>${esc(title)}</span>
      <input type="checkbox" data-input="integration" aria-label="${esc(title)}" value="${esc(id)}"
        ${selectedIntegrations.has(id) ? "checked" : ""}>
    </label>`;
  }).join("");
  const statusIcons = { available: "check-circle-outline", unavailable: "alert-circle-outline", enabled: "check",
    disabled: "cancel", visible: "eye", hidden: "eye-off", readonly: "pencil-off", restored: "restore-alert" };
  const statusChoices = STATUS_FILTERS.map((status) => `<label class="filter-option status-filter-option">
    ${icon(statusIcons[status])}<span>${esc(t["status_" + status])}</span>
    <input type="checkbox" data-input="state-filter" aria-label="${esc(t["status_" + status])}"
      value="${status}" ${stateFilters.has(status) ? "checked" : ""}>
  </label>`).join("");
  return `<details open><summary>${icon("chevron-down")}${t.integrations}
    ${selectedIntegrations.size ? `<span class="filter-count">${selectedIntegrations.size}</span>` : ""}
    </summary><div class="filter-all-row"><label class="filter-option">
      ${icon("filter-off-outline")}<span>${esc(t.all)}</span>
      <input type="checkbox" data-input="all-integrations" aria-label="${esc(t.all)}"
        ${selectedIntegrations.size ? "" : "checked"}>
    </label></div>
    <label class="search-field filter-search">${icon("magnify")}
      <input type="search" data-input="filter-search" aria-label="${t.find_integration}"
        placeholder="${t.find}" value="${esc(filterQuery)}"></label>
    <div class="filter-options">${integrationChoices}</div></details>
    <details ${stateFilters.size ? "open" : ""}><summary>${icon("chevron-down")}${t.status}
      ${stateFilters.size ? `<span class="filter-count">${stateFilters.size}</span>` : ""}
    </summary><div class="filter-options status-options">${statusChoices}</div></details>`;
}

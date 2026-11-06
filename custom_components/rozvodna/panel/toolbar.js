import { button, esc, icon, option } from "./html.js";

export function toolbar(panel) {
  const { t, query, sort, integration, filtersOpen } = panel;
  const filter = icon("filter-variant") + t.filters + (integration ? '<span class="filter-count">1</span>' : "");
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
  const { t, data, integration, filterQuery } = panel;
  const integrations = [...new Set([...data.devices, ...data.entities].map((row) => row.integration))]
    .map((id) => ({ id, title: panel.integrationTitle(id) }))
    .sort((a, b) => a.title.localeCompare(b.title));
  integrations.unshift({ id: "", title: t.all });
  return `<details open><summary>${icon("chevron-down")}${t.integrations}
    ${integration ? '<span class="filter-count">1</span>' : ""}
    </summary><label class="search-field filter-search">${icon("magnify")}
      <input type="search" data-input="filter-search" aria-label="${t.find_integration}"
        placeholder="${t.find}" value="${esc(filterQuery)}"></label>
    <div class="filter-options">${integrations.map(({ id, title }) =>
      `<label class="filter-option" data-filter-item="${esc([id, title].join(" ").toLocaleLowerCase())}"
        ${filterQuery && id && ![id, title].join(" ").toLocaleLowerCase().includes(filterQuery.toLocaleLowerCase().trim()) ? "hidden" : ""}>
        ${icon(id ? "puzzle-outline" : "filter-off-outline")}<span>${esc(title)}</span>
        <input type="radio" name="integration" data-input="integration" aria-label="${esc(title)}"
          value="${esc(id)}" ${integration === id ? "checked" : ""}>
      </label>`).join("")}</div></details>`;
}

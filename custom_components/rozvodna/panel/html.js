export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
export const icon = (name) => `<ha-icon icon="mdi:${name}" aria-hidden="true"></ha-icon>`;
export const registryIcon = (value, fallback) => /^mdi:[a-z0-9_-]+$/.test(value ?? "") ?
  icon(value.slice(4)) : icon(fallback);
export const button = (action, text, attrs = "") =>
  `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
export const option = (id, name, selected = false) =>
  `<option value="${esc(id)}"${selected ? " selected" : ""}>${esc(name)}</option>`;
export function table(t, headings, rows, overrides = {}) {
  return `<table><thead><tr>${headings.map((field) =>
    overrides[field] ?? `<th scope="col">${t[field] ?? ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
}

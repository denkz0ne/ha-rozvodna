import { esc, icon, registryIcon } from "./html.js";
import { normalizeSearch } from "./model.js";

export function labelColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : null;
}

export function labelChip(label) {
  const color = labelColor(label.color);
  const channels = color && color.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
  const luminance = channels?.map((channel) => channel <= 0.04045 ? channel / 12.92 :
    ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) =>
    sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const style = color ? `style="--chip-color:${color};--chip-text:${luminance > 0.179 ? "#000" : "#fff"}"` : "";
  const symbol = registryIcon(label.icon, "label");
  return `<span class="label-chip" ${style}>${symbol}<span>${esc(label.name)}</span></span>`;
}

export function makePicker(panel, field, value, onSelect) {
  const { t } = panel;
  const multi = field === "labels";
  const options = new Map(panel.metadata[field]);
  if (!multi) options.set("", { id: "", name: t.none, icon: "mdi:close" });
  for (const id of multi ? value : value ? [value] : []) {
    if (!options.has(id)) options.set(id, { id, name: id });
  }
  const selected = new Set(multi ? value : value ? [value] : []);
  const entries = [...options.values()].sort((a, b) => {
    if (multi && selected.has(a.id) !== selected.has(b.id)) return selected.has(a.id) ? -1 : 1;
    return a.id && b.id ? a.name.localeCompare(b.name) : a.id ? 1 : -1;
  });
  const popup = document.createElement("div");
  popup.setAttribute("popover", "manual");
  popup.setAttribute("role", "group");
  popup.setAttribute("aria-label", t[field]);
  popup.className = "editor-pop";
  popup.value = value;
  popup.innerHTML = `<label class="search-field picker-search">${icon("magnify")}
    <input type="search" aria-label="${t.find}" placeholder="${t.find}"></label>
    <div class="picker-options">${entries.map((item) => {
      const symbol = registryIcon(item.icon, multi ? "label" : "floor-plan");
      if (multi) {
        const color = labelColor(item.color);
        return `<label class="picker-option" data-option>
          ${symbol}<span class="picker-name">${esc(item.name)}</span>
          ${color ? `<span class="color-dot" style="--chip-color:${color}"></span>` : ""}
          <input type="checkbox" aria-label="${esc(item.name)}" value="${esc(item.id)}" ${value.includes(item.id) ? "checked" : ""}>
        </label>`;
      }
      return `<button type="button" class="picker-option" data-option data-choice="${esc(item.id)}"
        aria-label="${esc(item.name)}" aria-pressed="${(value ?? "") === item.id}">
        ${symbol}<span class="picker-name">${esc(item.name)}</span>${(value ?? "") === item.id ? icon("check") : ""}
      </button>`;
    }).join("")}</div><p class="picker-empty" hidden>${t.empty_rows}</p>`;
  const search = popup.querySelector("input[type=search]");
  const items = [...popup.querySelectorAll("[data-option]")];
  search.addEventListener("input", () => {
    const query = normalizeSearch(search.value.trim());
    items.forEach((item, index) => {
      item.hidden = !normalizeSearch(entries[index].name).includes(query);
    });
    popup.querySelector(".picker-empty").hidden = items.some((item) => !item.hidden);
  });
  if (!multi) popup.addEventListener("click", (event) => {
    const choice = event.target.closest("button[data-choice]");
    if (choice) onSelect(choice.dataset.choice || null);
  });
  return popup;
}

export function openPicker(popup, anchor) {
  const listener = new AbortController();
  const place = () => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 256), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const opensAbove = below < 224 && above > below;
    const height = Math.max(80, Math.min(320, opensAbove ? above : below));
    Object.assign(popup.style, {
      width: width + "px",
      maxHeight: height + "px",
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px",
    });
    popup.style.top = (opensAbove ? Math.max(8, rect.top - 4 - popup.offsetHeight) : rect.bottom + 4) + "px";
  };
  popup.showPopover();
  place();
  window.addEventListener("resize", place, { signal: listener.signal });
  anchor.closest(".body").addEventListener("scroll", place, { signal: listener.signal, passive: true });
  popup.querySelector("input[type=search]").focus({ preventScroll: true });
  return () => listener.abort();
}

export function navigatePicker(popup, event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  if (event.target.type === "search" && ["Home", "End"].includes(event.key)) return false;
  const controls = [...popup.querySelectorAll("[data-option]:not([hidden])")].map((item) =>
    item.matches("button") ? item : item.querySelector("input"));
  if (!controls.length) return false;
  const current = controls.indexOf(event.target);
  const last = controls.length - 1;
  const next = event.key === "Home" ? 0 : event.key === "End" ? last :
    event.key === "ArrowDown" ? Math.min(current + 1, last) : current < 0 ? last : current - 1;
  event.preventDefault();
  (controls[next] ?? popup.querySelector("input[type=search]")).focus();
  return true;
}

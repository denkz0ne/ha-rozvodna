import { esc } from "./html.js";

export function openReplacer(panel, source) {
  const sk = panel.hass.language?.startsWith("sk");
  const t = (skText, enText) => sk ? skText : enText;
  const dialog = document.createElement("dialog");
  dialog.className = "reference-dialog";
  dialog.setAttribute("aria-labelledby", "replacer-title");
  const devices = panel.data.devices.filter((device) => device.id !== source.id && device.editable !== false);
  dialog.innerHTML = `<section>
    <h2 id="replacer-title">${t("Nahradiť zariadenie", "Replace device")}</h2>
    <p>${esc(source.title)}</p>
    <label>${t("Nové zariadenie", "New device")}
      <select data-replacement-device><option value="">${t("Vyber zariadenie", "Select a device")}</option>
      ${devices.map((device) => `<option value="${esc(device.id)}">${esc(device.title)} · ${esc(device.integration)}</option>`).join("")}</select>
    </label>
    <p class="reference-coverage">${t("Náhľad párovania entít", "Entity mapping preview")}</p>
    <div data-replacement-plan aria-live="polite"></div>
    <form method="dialog" class="reference-actions"><button>${esc(panel.t.close)}</button></form>
  </section>`;
  const picker = dialog.querySelector("[data-replacement-device]");
  const result = dialog.querySelector("[data-replacement-plan]");
  let generation = 0;
  let mapping = {};
  let suggested = {};
  async function refresh() {
    const current = ++generation;
    if (!picker.value) {
      result.textContent = "";
      return;
    }
    const target = picker.value;
    result.textContent = t("Načítavam…", "Loading…");
    try {
      const plan = await panel.hass.callWS({
        type: "rozvodna/replacement_preview", old: source.id, new: target, mapping,
      });
      if (current !== generation || !dialog.open) return;
      const entities = panel.data.entities.filter((row) => row.device_id === target);
      result.innerHTML = plan.pairs.map((pair) => `<label class="reference-match"><span>
        <strong>${esc(pair.source)}</strong>
        <select data-replacement-source="${esc(pair.source)}">
          <option value="">${t("Bez náhrady", "Unmatched")}</option>
          ${entities.filter((row) => row.values.entity_id.split(".")[0] === pair.source.split(".")[0])
            .map((row) => `<option value="${esc(row.values.entity_id)}" ${row.values.entity_id === pair.target ? "selected" : ""}>${esc(row.values.entity_id)}</option>`).join("")}
        </select>
        ${pair.uncertain ? `<small>${t("Skontroluj zhodu", "Review this match")}</small>` : ""}
        ${pair.differences.map((item) => `<small>${esc(item.field)} · ${esc(JSON.stringify(item.before ?? null))} → ${esc(JSON.stringify(item.after ?? null))}</small>`).join("")}
        </span></label>`).join("") || t("Zariadenie nemá entity v registri.", "The device has no registered entities.");
      suggested = Object.fromEntries(plan.pairs.map(({ source, target }) => [source, target]));
      if (plan.references.length) {
        result.insertAdjacentHTML("beforeend", `<h3>${t("Odkazy v dashboardoch", "Dashboard references")}</h3>
          <ul class="reference-list">${plan.references.map((item) =>
            `<li>${esc(item.source)} · ${esc(item.location)}<small>${esc(item.old)} → ${esc(item.new)}</small></li>`).join("")}</ul>`);
      }
      if (plan.settings.length) {
        const settings = plan.settings.map(({ title, ...change }) => change);
        result.insertAdjacentHTML("beforeend", `<h3>${t("Prenos nastavení", "Copy settings")}</h3>
          <ul class="reference-list">${plan.settings.map((item) =>
            `<li>${esc(item.title)} · ${esc(panel.t[item.field] ?? item.field)}
            <small>${esc(JSON.stringify(item.before))} → ${esc(JSON.stringify(item.after))}</small></li>`).join("")}</ul>
          <button type="button" data-stage-settings>${t("Pripraviť prenos nastavení", "Stage settings transfer")}</button>`);
        const stage = result.querySelector("[data-stage-settings]");
        stage.addEventListener("click", async () => {
          stage.disabled = true;
          picker.disabled = true;
          try {
            if (panel.workspace.changes.length || panel.working.size) {
              throw new Error(t("Najprv dokonči rozpracované zmeny v registri.", "Finish the pending registry edits first."));
            }
            panel.setWorkspace(await panel.ws("stage", { revision: panel.workspace.revision, changes: settings }));
            dialog.close();
            panel.render();
          } catch (error) {
            const message = document.createElement("p");
            message.setAttribute("role", "alert");
            message.textContent = error.message || panel.t.error;
            stage.after(message);
            stage.disabled = false;
            picker.disabled = false;
          }
        });
      }
      if (plan.unmatched_new.length) {
        result.insertAdjacentHTML("beforeend", `<h3>${t("Nové entity bez dvojice", "Unmatched new entities")}</h3>
          <ul class="reference-list">${plan.unmatched_new.map((id) => `<li>${esc(id)}</li>`).join("")}</ul>`);
      }
    } catch (error) {
      if (current === generation && dialog.open) result.textContent = error.message || panel.t.error;
    }
  }
  picker.addEventListener("change", () => { mapping = {}; void refresh(); });
  result.addEventListener("change", (event) => {
    const input = event.target.closest("[data-replacement-source]");
    if (!input) return;
    const sourceId = input.dataset.replacementSource;
    const chosen = input.value || null;
    for (const [id, target] of Object.entries(suggested)) {
      if (chosen && id !== sourceId && target === chosen) mapping[id] = null;
    }
    mapping[sourceId] = chosen;
    void refresh();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  panel.shadowRoot.append(dialog);
  dialog.showModal();
}

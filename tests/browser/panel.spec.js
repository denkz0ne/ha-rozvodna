import { expect, test } from "@playwright/test";

const row = (page, name) => page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
const cell = (row, field) => row.locator(`td[data-field="${field}"] button`);
const requests = (page, type) => page.evaluate((type) =>
  window.requests.filter((req) => req.type === "rozvodna/" + type), type);

test("filter, expand, Enter, Tab, Escape, row staging and integration switching", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  const filter = page.getByRole("combobox", { name: "Integrácia", exact: true });
  await filter.selectOption("zha");
  await expect(page.locator("rozvodna-panel")).toHaveCSS("background-color", "rgb(250, 250, 250)");
  const device = row(page, "ZB50 Predsieň");
  await expect(row(page, "ESP80 Meteo")).toHaveCount(0);
  await expect(row(page, "Svetlo")).toHaveCount(0);
  await device.getByRole("button", { name: "Rozbaliť alebo zbaliť" }).click();
  await cell(device, "name").click();
  await device.getByRole("textbox", { name: "Vlastný názov" }).fill("Predsieň");
  await page.keyboard.press("Enter");
  const link = row(page, "Kvalita spojenia");
  await expect(link.getByRole("textbox", { name: "Vlastný názov" })).toBeFocused();
  await page.keyboard.press("Shift+Enter");
  await expect(device.getByRole("textbox", { name: "Vlastný názov" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Spojenie");
  await page.keyboard.press("Tab");
  await expect(link.getByRole("textbox", { name: "ID entity" })).toBeFocused();
  await page.keyboard.type("sensor.discard");
  await page.keyboard.press("Escape");
  await expect(cell(link, "entity_id")).toContainText("sensor.link");
  expect(await requests(page, "stage")).toHaveLength(0);
  await device.getByRole("button", { name: "Potvrdiť tento riadok" }).click();
  await expect(cell(device, "name")).toHaveClass(/staged/);
  await expect(cell(link, "name")).toHaveClass(/dirty/);
  page.once("dialog", (dialog) => dialog.accept());
  await filter.selectOption("esphome");
  await expect(row(page, "ZB50 Predsieň")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Uložiť", exact: true })).toBeEnabled();
  await page.reload();
  await expect(cell(row(page, "ZB50 Predsieň"), "name")).toHaveClass(/staged/);
  await expect(page.locator(".counts")).toContainText("Rozpracované polia 0");
});

test("invalid input stays focused and stage re-edit can return to HA value", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await row(page, "ZB50 Predsieň").getByRole("button", { name: "Rozbaliť alebo zbaliť" }).click();
  const entity = row(page, "Svetlo");
  await cell(entity, "entity_id").click();
  const editor = entity.getByRole("textbox", { name: "ID entity" });
  await editor.fill("invalid id");
  await editor.press("Tab");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("invalid id");
  await editor.press("Escape");
  await cell(entity, "name").click();
  await entity.getByRole("textbox").fill("Svetielko");
  await page.locator("rozvodna-panel").getByText("Rozvodňa", { exact: true }).click();
  await entity.getByRole("button", { name: "Potvrdiť tento riadok" }).click();
  await expect(cell(entity, "name")).toHaveClass(/staged/);
  await cell(entity, "name").click();
  await entity.getByRole("textbox").fill("Iný návrh");
  await page.keyboard.press("Escape");
  await expect(cell(entity, "name")).toContainText("Svetielko");
  await cell(entity, "name").click();
  await entity.getByRole("textbox").fill("");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await entity.getByRole("button", { name: "Potvrdiť tento riadok" }).click();
  await expect(page.getByRole("button", { name: "Uložiť", exact: true })).toBeDisabled();
});

test("bulk preview goes through draft, commit history and selected revert", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  await page.getByRole("checkbox", { name: "Vybrať ZB50 Predsieň" }).check();
  await page.getByRole("button", { name: "Hromadná úprava (1)" }).click();
  await page.getByRole("combobox", { name: "Oblasť", exact: true }).selectOption("hall");
  await page.getByRole("button", { name: "Náhľad", exact: true }).click();
  await page.getByRole("button", { name: "Pridať medzi rozpracované" }).click();
  const device = row(page, "ZB50 Predsieň");
  await expect(cell(device, "area_id")).toHaveClass(/dirty/);
  await device.getByRole("button", { name: "Potvrdiť tento riadok" }).click();
  await page.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Uložené");
  await page.getByRole("button", { name: "História", exact: true }).click();
  await page.getByRole("button", { name: "Detail", exact: true }).click();
  await expect(page.getByText("test-commit", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Vybrať", exact: true }).check();
  await page.getByRole("button", { name: "Pripraviť vybrané" }).click();
  await expect(page.getByRole("heading", { name: "Skontrolovať potvrdené" })).toBeVisible();
  expect(await requests(page, "commit")).toHaveLength(1);
});

test("large dataset, orphan grouping and dark theme", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html?large&dark");
  await expect(page.locator("rozvodna-panel")).toHaveCSS("background-color", "rgb(21, 21, 21)");
  await expect(page.locator("tbody tr")).toHaveCount(100);
  await page.getByRole("searchbox").fill("Počasie");
  await expect(page.getByText("Entity bez zariadenia (1)")).toBeVisible();
  await expect(row(page, "Počasie")).toBeVisible();
  await expect(page.locator("input.editor")).toHaveCount(0);
});

test("non-admin panel does not request registry data", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html?nonadmin");
  await expect(page.getByText("Vyžadujú sa práva správcu.")).toBeVisible();
  expect(await page.evaluate(() => window.requests)).toEqual([]);
});

test("Save includes staged changes across integration filters", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  const filter = page.getByRole("combobox", { name: "Integrácia", exact: true });
  for (const [integration, title] of [["zha", "ZB50 Predsieň"], ["esphome", "ESP80 Meteo"]]) {
    await filter.selectOption(integration);
    const device = row(page, title);
    await cell(device, "area_id").click();
    const area = device.getByRole("listbox", { name: "Oblasť" });
    await area.selectOption("hall");
    await area.press("Enter");
    await device.getByRole("button", { name: "Potvrdiť tento riadok" }).click();
    await expect(cell(device, "area_id")).toHaveClass(/staged/);
  }
  await expect(page.locator(".counts")).toContainText("Potvrdené riadky 2 / polia 2");
  await page.getByRole("button", { name: "Uložiť", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Uložené");
  await filter.selectOption("zha");
  await expect(cell(row(page, "ZB50 Predsieň"), "area_id")).toContainText("Predsieň");
  await expect(cell(row(page, "ZB50 Predsieň"), "area_id")).not.toHaveClass(/staged/);
});
test("registry panel renders staged and draft names", async ({ page }) => {
  await page.goto("/tests/browser/fixture.html");
  const device = row(page, "ZB50 Predsieň");
  await device.getByRole("button", { name: "Rozbaliť alebo zbaliť" }).click();
  await cell(device, "name").click();
  await device.getByRole("textbox").fill("Vstupná chodba");
  await page.keyboard.press("Enter");
  const link = row(page, "Kvalita spojenia");
  await link.getByRole("textbox").fill("Spojenie");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await device.getByRole("button", { name: "Potvrdiť tento riadok" }).click();
  await expect(cell(device, "name")).toHaveClass(/staged/);
  await expect(cell(link, "name")).toHaveClass(/dirty/);
  if (process.env.ROZVODNA_FIXTURE_SCREENSHOT) {
    await page.screenshot({ path: process.env.ROZVODNA_FIXTURE_SCREENSHOT });
  }
});

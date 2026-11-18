import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { qualityKeys, qualityPresets, qualitySnapshot } from "../src/quality-settings.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: { project: { type: "string" }, url: { type: "string" } } });
const require = process.env.WORKSPACE_NODE_MODULES
  ? createRequire(path.resolve(process.env.WORKSPACE_NODE_MODULES, "package.json"))
  : createRequire(import.meta.url);
const { chromium } = require("playwright");
const catalog = JSON.parse(await fs.readFile(`${root}public/projects/catalog.json`, "utf8"));
const projectId = values.project ?? catalog[0].id;
if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error("Invalid project id");
const server = values.url ? { url: values.url } : JSON.parse(await fs.readFile(`${root}reports/server.json`, "utf8"));
const out = `${root}reports/${projectId}`;
await fs.mkdir(out, { recursive: true });
const launch = { headless: true };
if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launch);
const report = { projectId, startedAt: new Date().toISOString(), checks: [], errors: [], qualityJudgment: "requires human review" };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", item => { if (item.type() === "error") report.errors.push(item.text()); });
  const target = new URL(server.url); target.searchParams.set("project", projectId);
  await page.goto(target.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__WAREHOUSE_PREVIEW?.ready || document.getElementById("error")?.textContent, null, { timeout: 180000 });
  assert.equal(await page.locator("#error").textContent(), "");
  async function settle() { await page.evaluate(() => window.__WAREHOUSE_PREVIEW.finishFrame()); }
  async function capture(name) {
    await settle();
    const data = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.capture());
    await fs.writeFile(`${out}/${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  }
  await page.evaluate(() => window.__WAREHOUSE_PREVIEW.setQuality("high"));
  await capture("high-interior");
  report.scene = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.verifyScene());
  report.pixels = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.pixelSummary());
  assert(report.pixels.variedFraction > .05, "Canvas has little or no scene content");
  assert(report.scene.configuredFloors.every(node => node.found && !node.visible), "A configured source floor is still visible");
  const cameraBefore = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.cameraState());
  await page.evaluate(() => window.__WAREHOUSE_PREVIEW.setOption("roof", false));
  for (const preset of ["low", "medium", "high"]) {
    await page.evaluate(name => window.__WAREHOUSE_PREVIEW.setQuality(name), preset);
    const state = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.state);
    assert.deepEqual(qualitySnapshot(state), qualityPresets[preset]);
    assert.equal(state.roof, false);
    assert.deepEqual(await page.evaluate(() => window.__WAREHOUSE_PREVIEW.cameraState()), cameraBefore);
    const controls = await page.evaluate(keys => Object.fromEntries(keys.map(key => {
      const control = document.getElementById(key);
      return [key, control.type === "checkbox" ? control.checked : control.value];
    })), qualityKeys);
    for (const key of qualityKeys) assert.equal(String(controls[key]), String(qualityPresets[preset][key]));
  }
  report.checks.push("Presets and individual controls agree; scene visibility and camera remain independent");
  await capture("cutaway");
  await page.evaluate(() => {
    const api = window.__WAREHOUSE_PREVIEW;
    api.setOption("roof", true); api.setLook("original");
  });
  await capture("original-materials");
  await page.evaluate(() => {
    const api = window.__WAREHOUSE_PREVIEW;
    api.setLook("realistic"); api.setOption("ao", false);
  });
  await capture("ao-off");
  await page.evaluate(() => {
    const api = window.__WAREHOUSE_PREVIEW;
    api.setOption("ao", true); api.setOption("microDetail", false);
  });
  await capture("procedural-off");
  const custom = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.state);
  assert.equal(custom.quality, "custom");
  await page.evaluate(() => {
    window.__WAREHOUSE_PREVIEW.setQuality("high");
    window.__WAREHOUSE_PREVIEW.setQuality("custom");
  });
  assert.deepEqual(qualitySnapshot(await page.evaluate(() => window.__WAREHOUSE_PREVIEW.state)), qualitySnapshot(custom));
  await page.evaluate(() => window.__WAREHOUSE_PREVIEW.setQuality("high")); await settle();
  const bounds = await page.locator("#scene").boundingBox();
  const movingCameraBefore = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.cameraState());
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .55);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(bounds.x + bounds.width * (.5 + i * .012), bounds.y + bounds.height * .56, { steps: 3 });
    const data = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.capture());
    await fs.writeFile(`${out}/moving-${i}.png`, Buffer.from(data.split(",")[1], "base64"));
  }
  const moving = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.stats());
  assert(moving.interacting && !moving.aaEnabled && moving.aoEnabled);
  assert.notDeepEqual(await page.evaluate(() => window.__WAREHOUSE_PREVIEW.cameraState()), movingCameraBefore);
  await page.mouse.up(); await settle();
  const still = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.stats());
  assert(still.aaComplete && still.aoCacheHits > 0);
  report.motion = { moving, still };
  report.checks.push("Camera moves, moving AO remains active, idle TAA settles and AO cache is reused");
  await page.evaluate(() => window.__WAREHOUSE_PREVIEW.setView("overview"));
  await capture("overview");
  await page.screenshot({ path: `${out}/desktop-ui.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.__WAREHOUSE_PREVIEW.setView("interior");
    window.__WAREHOUSE_PREVIEW.setSettings(false);
  });
  await capture("mobile-scene");
  await page.evaluate(() => window.__WAREHOUSE_PREVIEW.setSettings(true)); await settle();
  await page.screenshot({ path: `${out}/mobile-ui.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const final = await page.evaluate(() => window.__WAREHOUSE_PREVIEW.verifyScene());
  assert.equal(final.ao.width, final.ao.renderWidth);
  assert.equal(final.ao.height, final.ao.renderHeight);
  report.checks.push("Mobile layout fits and AO buffers match the configured resolution budget");
  assert.equal(report.errors.length, 0, report.errors.join("\n").slice(0, 2000));
  report.success = true;
} catch (error) {
  report.failure = String(error.stack || error);
  if (page) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ success: report.success, projectId, checks: report.checks, errors: report.errors, output: out }));

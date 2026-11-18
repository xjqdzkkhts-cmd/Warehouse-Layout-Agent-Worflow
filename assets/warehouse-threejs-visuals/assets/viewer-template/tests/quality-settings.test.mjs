import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { qualitySchema, qualityKeys, qualityPresets, qualitySnapshot, selectQuality, editQuality,
  restoreQuality, serializeQuality, aoConfiguration } from "../src/quality-settings.mjs";
import { WarehouseAOPass } from "../src/warehouse-ao.mjs";
import { attachSurface, proceduralUniforms } from "../src/surfaces.mjs";
import { proceduralRole, proceduralGLSL } from "../src/procedural-surface.mjs";

const scene = { roof: false, building: false, walls: false, lamps: false, lampPower: .4,
  lighting: "warm", exposure: 1.3, environment: .9, roughness: .8, wear: .2, look: "original", view: "floor" };
for (const preset of ["high", "medium", "low"]) test(`${preset} is complete, valid and excludes scene operations`, () => {
  const values = qualityPresets[preset];
  assert.deepEqual(Object.keys(values).sort(), [...qualityKeys].sort());
  assert.deepEqual(qualitySnapshot(values), values);
  const result = selectQuality({ ...qualityPresets.high, ...scene }, preset);
  for (const key of Object.keys(scene)) assert.equal(result[key], scene[key]);
  assert.equal(result.quality, preset);
});
test("high enables all supported boolean graphics options", () => {
  for (const [key, rule] of Object.entries(qualitySchema)) if (rule.type === "boolean") assert.equal(qualityPresets.high[key], true);
});
test("first custom selection preserves the current graphics values", () => {
  const high = { ...qualityPresets.high, ...scene, quality: "high" };
  const result = selectQuality(high, "custom");
  assert.deepEqual(qualitySnapshot(result), qualitySnapshot(high));
  assert.equal(result.quality, "custom");
});
test("manual changes become custom without resetting other settings", () => {
  const low = { ...qualityPresets.low, ...scene, quality: "low" };
  const custom = editQuality(low, "ao", true);
  assert.equal(custom.ao, true); assert.equal(custom.quality, "custom");
  for (const key of qualityKeys.filter(k => k !== "ao")) assert.equal(custom[key], low[key]);
  for (const key of Object.keys(scene)) assert.equal(custom[key], low[key]);
});
test("custom values survive switching through other presets and serialization", () => {
  const initial = { ...qualityPresets.low, quality: "low" };
  const custom = editQuality(editQuality(initial, "ao", true), "aoRadius", .3);
  const snapshot = qualitySnapshot(custom);
  const high = selectQuality(custom, "high", snapshot);
  const restored = restoreQuality(serializeQuality(high, snapshot), "medium");
  assert.equal(restored.state.quality, "high");
  assert.deepEqual(qualitySnapshot(selectQuality(restored.state, "custom", restored.custom)), snapshot);
});
test("corrupt preferences and unsafe numeric values fall back or reject", () => {
  assert.equal(restoreQuality("not json", "medium").state.quality, "medium");
  assert.equal(restoreQuality('{"version":1,"selected":"custom"}', "low").state.quality, "low");
  assert.throws(() => editQuality(qualityPresets.high, "aoRadius", NaN));
  assert.throws(() => editQuality(qualityPresets.high, "pixelRatio", 20));
  assert.throws(() => editQuality(qualityPresets.high, "shadows", "true"));
  assert.throws(() => editQuality(qualityPresets.high, "roof", false));
  assert.throws(() => selectQuality(qualityPresets.high, "ultra"));
});
test("AO keeps its physical scale and strength during movement", () => {
  const state = { ...qualityPresets.high, look: "realistic" };
  const still = aoConfiguration(state, false, 1400, 900);
  const moving = aoConfiguration(state, true, 1400, 900);
  assert(moving.enabled && still.enabled);
  assert.equal(still.radius, moving.radius); assert.equal(still.intensity, moving.intensity);
  assert(moving.samples < still.samples); assert(moving.width < still.width);
  assert(!aoConfiguration({ ...state, aoMoving: false }, true, 1400, 900).enabled);
  assert(!aoConfiguration({ ...state, look: "original" }, false, 1400, 900).enabled);
});
test("custom AO is not silently disabled by the previous low preset", () => {
  const state = editQuality({ ...qualityPresets.low, look: "realistic", quality: "low" }, "ao", true);
  assert(aoConfiguration(state, false, 1400, 900).enabled);
});
test("AO excludes reflection helpers and transparent surfaces without reviving hidden meshes", () => {
  const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry();
  const clear = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true }));
  const overlay = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); overlay.isReflector = true;
  const hidden = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); hidden.visible = false;
  const solid = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  scene.add(clear, overlay, hidden, solid);
  const pass = new WarehouseAOPass(scene, new THREE.PerspectiveCamera());
  pass._overrideVisibility();
  assert(!clear.visible && !overlay.visible && !hidden.visible && solid.visible);
  pass._restoreVisibility();
  assert(clear.visible && overlay.visible && solid.visible && !hidden.visible);
  pass.dispose();
});
test("AO resize invalidates cache without reallocating on identical dimensions", () => {
  const pass = new WarehouseAOPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  pass.dirty = false; pass.setSize(512, 512); assert(!pass.dirty);
  pass.setSize(320, 200); assert(pass.dirty);
  pass.dispose();
});
test("procedural materials share controls and include minification filtering", () => {
  const material = new THREE.MeshPhysicalMaterial();
  material.userData.preview = { role: "stainless" };
  assert.equal(proceduralRole(material, "metal"), 2);
  const texture = new THREE.Texture();
  attachSurface(material, "metal", { metal: { color: texture, normal: texture, arm: texture } });
  const shader = { uniforms: {},
    vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader: "#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>" };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uProceduralEnabled, proceduralUniforms.uProceduralEnabled);
  assert(shader.vertexShader.includes("modelMatrix*instanceMatrix"));
  assert(shader.fragmentShader.includes("#define WAREHOUSE_ROLE 2"));
  assert(proceduralGLSL.includes("fwidth(phase)"));
  assert(proceduralGLSL.includes("dFdx(p)"));
  assert(material.customProgramCacheKey().endsWith("-metal-2"));
});

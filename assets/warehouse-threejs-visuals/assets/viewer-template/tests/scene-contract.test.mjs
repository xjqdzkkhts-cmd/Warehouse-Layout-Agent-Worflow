import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { validateProject } from "../src/project.mjs";
import { warehouseLayout } from "../src/warehouse-layout.mjs";
import { createFixture } from "../src/fixtures.mjs";
import { resolveMaterial } from "../src/material-profiles.mjs";
import { buildWearData } from "../src/wear-atlas.mjs";
import { batchRepeatedGeometry } from "../src/batching.mjs";
const load = id => validateProject(JSON.parse(fs.readFileSync(new URL(`../public/projects/${id}.json`, import.meta.url))));

test("both samples use the same pipeline at different sizes", () => {
  const heights = ["compact-test", "tall-test"].map(id => {
    const project = load(id), { model } = createFixture(project.source);
    const bounds = new THREE.Box3().setFromObject(model);
    const layout = warehouseLayout({ min: bounds.min.toArray(), max: bounds.max.toArray() },
      project.floorY, project.building, project.lighting);
    assert(layout.lightGrid.fixtures.length <= project.lighting.maxLights);
    assert(layout.lightGrid.fixtures.every(f => f.position[1] > layout.equipmentTop));
    const result = batchRepeatedGeometry(model);
    assert(result.maxTransformDeviation < .0001 && result.boundsDeviation < .0003);
    return layout.height;
  });
  assert(heights[1] > heights[0]);
});
test("unknown materials and authored textures remain untouched", () => {
  const material = new THREE.MeshPhysicalMaterial({ color: "red" });
  material.name = "unknown"; assert.equal(resolveMaterial(material).source, "unassigned");
  material.map = new THREE.Texture();
  assert.equal(resolveMaterial(material, { unknown: "stainless" }).source, "preserved");
});
test("units and drawing axis must be explicit and supported", () => {
  const project = load("compact-test");
  assert.throws(() => validateProject({ ...project, units: "mm" }));
  assert.throws(() => validateProject({ ...project, upAxis: "Z" }));
});
test("wear generation is deterministic and does not invent traffic", () => {
  const layout = { minX: 0, minZ: 0, width: 12, length: 18 };
  const a = buildWearData(layout, [], 173, 2), b = buildWearData(layout, [], 173, 2);
  assert.deepEqual(a.data, b.data);
  assert(a.data.every((value, index) => index % 4 !== 0 || value === 0));
});

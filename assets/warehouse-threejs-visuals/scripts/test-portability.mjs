import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectGlb } from "./inspect-glb.mjs";
import { createPreview } from "./create-preview.mjs";

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "warehouse-skill-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
async function glb(directory, patch = {}) {
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: "Equipment", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { componentType: 5126, type: "VEC3", count: 8 },
      { componentType: 5123, type: "SCALAR", count: 36 },
    ], ...patch,
  };
  const text = JSON.stringify(json), length = Math.ceil(Buffer.byteLength(text) / 4) * 4;
  const file = Buffer.alloc(20 + length, 32);
  file.write("glTF", 0); file.writeUInt32LE(2, 4); file.writeUInt32LE(file.length, 8);
  file.writeUInt32LE(length, 12); file.writeUInt32LE(0x4e4f534a, 16); file.write(text, 20);
  const filename = path.join(directory, "source.glb"); await fs.writeFile(filename, file);
  return filename;
}
test("inspector counts active GPU instances rather than mesh definitions", async t => {
  const directory = await temporary(t);
  const model = await glb(directory, {
    nodes: [{ name: "Instances", mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 2 } } } }, { mesh: 0 }],
    accessors: [{ count: 8 }, { count: 36 }, { count: 5 }],
    extensionsUsed: ["EXT_mesh_gpu_instancing"],
  });
  const report = await inspectGlb(model);
  assert.equal(report.sourceTriangles, 60); assert.equal(report.gpuInstanceNodes, 1);
  assert.equal(report.meshNodes, 1); assert.equal(report.uniqueMeshDefinitions, 1);
});
test("preview creation refuses existing outputs", async t => {
  const directory = await temporary(t), out = path.join(directory, "existing");
  await fs.mkdir(out); await fs.writeFile(path.join(out, "keep.txt"), "keep");
  await assert.rejects(createPreview({ out }), /already exists/);
  assert.equal(await fs.readFile(path.join(out, "keep.txt"), "utf8"), "keep");
});
test("real model creation requires explicit scene and ground decisions", async t => {
  const directory = await temporary(t), model = await glb(directory), out = path.join(directory, "preview");
  await assert.rejects(createPreview({ out, model, "floor-y": "0" }), /Confirm/);
  await assert.rejects(createPreview({ out, model, "floor-y": "0", "confirm-equipment-scene": true }), /floor nodes/);
  await assert.rejects(fs.access(out));
});
test("external resources and decoder requirements are not silently ignored", async t => {
  const directory = await temporary(t);
  let model = await glb(directory, { images: [{ uri: "../external.png" }] });
  const options = { out: path.join(directory, "preview"), model, "floor-y": "0",
    "confirm-equipment-scene": true, "no-source-floor": true };
  await assert.rejects(createPreview(options), /self-contained/);
  model = await glb(directory, { extensionsUsed: ["KHR_draco_mesh_compression"] });
  await assert.rejects(createPreview({ ...options, model }), /decoders/);
});
test("new output copies a model without changing its data", async t => {
  const directory = await temporary(t), model = await glb(directory), out = path.join(directory, "preview");
  const original = await fs.readFile(model);
  await createPreview({ out, model, "floor-y": "0", "confirm-equipment-scene": true, "no-source-floor": true });
  await fs.access(path.join(out, "public/main.js"));
  assert.deepEqual(await fs.readFile(path.join(out, "public/assets/models/input.glb")), original);
  assert.deepEqual(await fs.readFile(model), original);
  const catalog = JSON.parse(await fs.readFile(path.join(out, "public/projects/catalog.json"), "utf8"));
  assert.equal(catalog[0].id, "scene-test");
});
test("floor names resolve against original glTF identity", async t => {
  const directory = await temporary(t), model = await glb(directory, { nodes: [{ name: "Floor.001", mesh: 0 }] }), config = path.join(directory, "config.json");
  await fs.writeFile(config, JSON.stringify({ floorY: 0, source: { floorNodes: ["Floor.001"] } }));
  const out = path.join(directory, "preview");
  await createPreview({ out, model, config, "confirm-equipment-scene": true });
  const project = JSON.parse(await fs.readFile(path.join(out, "public/projects/scene-test.json"), "utf8"));
  assert.deepEqual(project.source.floorNodes, ["Floor.001"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { hideConfiguredFloorNodes } from "../src/source-visibility.mjs";
import { batchRepeatedGeometry } from "../src/batching.mjs";

async function load(nodes) {
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes,
  }), "");
  return { model: gltf.scene, source: { associations: gltf.parser.associations, nodes: gltf.parser.json.nodes } };
}

test("original glTF floor name resolves after loader sanitization", async () => {
  const { model, source } = await load([{ name: "floor.001" }]);
  assert.equal(model.children[0].name, "floor001");
  const result = hideConfiguredFloorNodes(model, ["floor.001"], source);
  assert.equal(result.hiddenCount, 1);
  assert.equal(result.nodes[0].runtimeName, "floor001");
  assert(!model.children[0].visible);
});

test("source identity distinguishes names that sanitize to the same string", async () => {
  const { model, source } = await load([{ name: "floor.001" }, { name: "floor001" }]);
  hideConfiguredFloorNodes(model, ["floor.001"], source);
  assert(!model.children[0].visible);
  assert(model.children[1].visible);
});

test("node index wins over extras that overwrite userData.name", async () => {
  const { model, source } = await load([{ name: "floor.001", extras: { name: "custom-label" } }]);
  assert.equal(model.children[0].userData.name, "custom-label");
  hideConfiguredFloorNodes(model, ["floor.001"], source);
  assert(!model.children[0].visible);
});

test("missing or ambiguous floor selectors fail before hiding any node", async () => {
  const { model, source } = await load([{ name: "floor.001" }, { name: "duplicate" }, { name: "duplicate" }]);
  assert.throws(() => hideConfiguredFloorNodes(model, ["floor.001", "missing"], source), /matched 0/);
  assert(model.children.every(o => o.visible));
  assert.throws(() => hideConfiguredFloorNodes(model, ["floor.001", "duplicate"], source), /matched 2/);
  assert(model.children.every(o => o.visible));
});

test("empty floor configuration does not hide unknown objects", async () => {
  const { model, source } = await load([{ name: "floor.001" }]);
  assert.equal(hideConfiguredFloorNodes(model, [], source).hiddenCount, 0);
  assert(model.children[0].visible);
});

test("hidden source floor remains hidden after geometry batching", () => {
  const root = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  for (let i = 0; i < 4; i++) {
    const mesh = new Mesh(geometry, material);
    mesh.name = `mesh-${i}`; mesh.position.x = i * 3; root.add(mesh);
  }
  root.children[0].userData.name = "floor.001";
  const floor = root.children[0];
  hideConfiguredFloorNodes(root, ["floor.001"]);
  assert.equal(batchRepeatedGeometry(root).batchedObjects, 3);
  assert(!floor.visible);
  assert.equal(floor.parent, root);
});

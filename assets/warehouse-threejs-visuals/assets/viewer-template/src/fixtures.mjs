import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function createFixture(source) {
  const { rows, bays, levels, origin } = source;
  if (![rows, bays, levels].every(v => Number.isInteger(v) && v >= 1 && v <= 12)
    || !Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) throw new Error("Invalid fixture parameters");
  const root = new THREE.Group(); root.name = "synthetic-validation-fixture";
  root.position.fromArray(origin);
  const material = (name, role, color) => {
    const m = new THREE.MeshStandardMaterial({ name, color, roughness: .45 });
    m.userData.materialRole = role; return m;
  };
  const steel = material("fixture-steel", "powderCoat", 0x456777);
  const beam = material("fixture-beam", "powderCoat", 0xc46126);
  const metal = material("fixture-rollers", "stainless", 0xaeb6b9);
  const box = material("fixture-cardboard", "cardboard", 0xb99258);
  const pallet = material("fixture-pallet", "plastic", 0x315d88);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const rounded = new RoundedBoxGeometry(1, 1, 1, 1, .01);
  let serial = 0;
  function add(mat, dims, position, smooth = false) {
    const m = new THREE.Mesh(smooth ? rounded : unit, mat);
    m.name = `fixture-part-${serial++}`;
    m.scale.set(...dims); m.position.set(...position);
    m.userData.assetId = `test-${mat.name}`; root.add(m); return m;
  }
  const length = bays * 2.8, height = levels * 1.8 + .3;
  for (let r = 0; r < rows; r++) {
    const x = r * 5.2;
    for (let b = 0; b <= bays; b++) for (const side of [-1, 1]) {
      add(steel, [.1, height, .1], [x + side * .65, height / 2, b * 2.8]);
      add(metal, [.23, .04, .23], [x + side * .65, .02, b * 2.8]);
    }
    for (let b = 0; b < bays; b++) for (let l = 0; l < levels; l++) {
      const y = l * 1.8 + .28;
      for (const side of [-1, 1]) add(beam, [.08, .14, 2.7], [x + side * .65, y, b * 2.8 + 1.4]);
      add(metal, [1.28, .04, 2.66], [x, y + .08, b * 2.8 + 1.4]);
      if ((r * 17 + b * 5 + l) % 4 !== 0) {
        for (const dz of [.73, 2.03]) {
          add(pallet, [1.12, .12, 1.14], [x, y + .17, b * 2.8 + dz], true);
          for (const dx of [-.28, .28]) add(box, [.53, 1.04, .9], [x + dx, y + .75, b * 2.8 + dz], true);
        }
      }
    }
  }
  const conveyorX = (rows - 1) * 5.2 + 3.2;
  const conveyorLength = length * .7;
  for (const side of [-1, 1]) add(steel, [.09, .2, conveyorLength], [conveyorX + side * .56, .8, length / 2]);
  const rollerGeometry = new THREE.CylinderGeometry(.05, .05, 1, 12);
  for (let z = (length - conveyorLength) / 2; z <= (length + conveyorLength) / 2; z += .17) {
    const m = new THREE.Mesh(rollerGeometry, metal); m.rotation.z = Math.PI / 2;
    m.position.set(conveyorX, .9, z); m.name = `roller-${serial++}`; root.add(m);
  }
  for (let z = length * .2; z <= length * .8; z += 2.3) for (const side of [-1, 1]) {
    add(steel, [.07, .72, .07], [conveyorX + side * .5, .36, z]);
  }
  root.updateMatrixWorld(true);
  return { model: root, equipmentCount: rows * bays + 1, synthetic: true };
}

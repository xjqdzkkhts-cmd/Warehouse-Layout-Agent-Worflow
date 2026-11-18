import * as THREE from "three";
import { attachSurface } from "./surfaces.mjs";
import { gridLights, lightingTemplates } from "./project.mjs";

const up = new THREE.Vector3(0, 1, 0);
class Parts {
  constructor(group) { this.group = group; this.batches = new Map(); }
  box(material, size, position, rotation = new THREE.Quaternion()) {
    this.add("box", material, size, position, rotation);
  }
  add(shape, material, size, position, rotation) {
    const key = `${shape}:${material.uuid}`;
    if (!this.batches.has(key)) this.batches.set(key, { shape, material, matrices: [] });
    this.batches.get(key).matrices.push(new THREE.Matrix4().compose(
      new THREE.Vector3(...position), rotation, new THREE.Vector3(...size)));
  }
  beam(material, a, b, depth, width = depth) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from), length = direction.length();
    const q = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
    this.box(material, [depth, length, width], from.add(to).multiplyScalar(.5).toArray(), q);
  }
  rod(material, a, b, radius) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from), length = direction.length();
    this.add("rod", material, [radius, length, radius], from.add(to).multiplyScalar(.5).toArray(),
      new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
  }
  iBeam(material, a, b, depth = .5, width = .28) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const direction = to.clone().sub(from), length = direction.length();
    const q = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
    const center = from.add(to).multiplyScalar(.5);
    this.box(material, [depth - .05, length, .024], center.toArray(), q);
    for (const side of [-1, 1]) {
      const offset = new THREE.Vector3(side * (depth - .025) / 2, 0, 0).applyQuaternion(q).add(center);
      this.box(material, [.025, length, width], offset.toArray(), q);
    }
  }
  finish() {
    let count = 0;
    for (const batch of this.batches.values()) {
      const geometry = batch.shape === "rod" ? new THREE.CylinderGeometry(1, 1, 1, 8) : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(geometry, batch.material, batch.matrices.length);
      batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      mesh.castShadow = !batch.material.transparent && !batch.material.userData.luminous;
      mesh.receiveShadow = !batch.material.userData.luminous;
      mesh.name = `${this.group.name}-${batch.material.name}`;
      this.group.add(mesh); count += batch.matrices.length;
    }
    return count;
  }
}

export function createWarehouse(layout, floorMaterial, library, lighting = {
  spacingX: 10, spacingZ: 12, maxLights: 12, maxShadowLights: 2, fixtureLuminance: 65,
}) {
  const { minX, maxX, minZ, maxZ, width, length, centerX: cx, floorY, eave, ridge } = layout;
  const root = new THREE.Group(); root.name = "warehouse-building";
  const walls = new THREE.Group(); walls.name = "building-walls-and-columns";
  const roof = new THREE.Group(); roof.name = "building-roof-and-lights";
  root.add(walls, roof);
  const wallParts = new Parts(walls), roofParts = new Parts(roof);
  const material = (name, color, roughness, metalness, kind) => {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness });
    m.name = name; attachSurface(m, kind, library); return m;
  };
  const cladding = material("warehouse-wall-cladding", 0xcbd1d0, .62, .18, "paint");
  const roofSkin = material("warehouse-roof-sheet", 0xa9b4b7, .56, .3, "metal");
  const steel = material("warehouse-structural-steel", 0x526166, .38, .48, "paint");
  const galvanized = material("warehouse-galvanized-fittings", 0x9aa5a8, .3, .88, "metal");
  const plinth = material("warehouse-concrete-plinth", 0x8d9493, .88, 0, "wall");
  const dark = material("warehouse-lamp-housing", 0x303b3d, .36, .48, "paint");
  const door = material("warehouse-personnel-door", 0x557a82, .48, .1, "paint");
  const glass = new THREE.MeshPhysicalMaterial({
    name: "warehouse-daylight-panels", color: 0xc5d9de, roughness: .18, metalness: .08,
    transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide,
  });
  const emitter = new THREE.MeshStandardMaterial({
    name: "warehouse-LED-diffusers", color: 0x85908e, emissive: 0xf4f8ff,
    emissiveIntensity: 5, roughness: .3,
  });
  emitter.userData.luminous = true;
  const bay = length / (layout.frameCount - 1);
  const roofHeight = x => ridge - Math.abs(x - cx) / (width / 2) * (ridge - eave);
  const tieY = eave - .75;
  const wallBottom = floorY + 1.35;

  // Portal columns, baseplates and wall girts stay with the wall visibility group.
  for (let frame = 0; frame < layout.frameCount; frame++) {
    const z = minZ + bay * frame;
    for (const x of [minX + .32, maxX - .32]) {
      wallParts.iBeam(steel, [x, floorY, z], [x, eave, z], .54, .34);
      wallParts.box(galvanized, [.75, .055, .72], [x, floorY + .028, z]);
      for (const dx of [-.27, .27]) for (const dz of [-.24, .24]) {
        wallParts.rod(galvanized, [x + dx, floorY + .055, z + dz], [x + dx, floorY + .12, z + dz], .022);
      }
      wallParts.box(galvanized, [.62, .5, .038], [x, eave - .35, z + .18]);
    }
    roofParts.iBeam(steel, [minX + .32, eave - .15, z], [cx, ridge - .15, z], .55, .31);
    roofParts.iBeam(steel, [cx, ridge - .15, z], [maxX - .32, eave - .15, z], .55, .31);
    roofParts.iBeam(steel, [minX + .32, tieY, z], [maxX - .32, tieY, z], .3, .22);
    const trussPanels = 8;
    for (let panel = 0; panel < trussPanels; panel++) {
      const a = minX + .32 + (width - .64) * panel / trussPanels;
      const b = minX + .32 + (width - .64) * (panel + 1) / trussPanels;
      roofParts.beam(galvanized, [a, panel % 2 ? tieY : roofHeight(a) - .4, z],
        [b, panel % 2 ? roofHeight(b) - .4 : tieY, z], .09, .09);
      if (panel > 0) roofParts.beam(steel, [a, tieY, z], [a, roofHeight(a) - .35, z], .08, .08);
    }
  }
  for (const x of [minX + .16, maxX - .16]) {
    for (let y = floorY + 2.6; y < eave - .5; y += 3.6) {
      wallParts.beam(galvanized, [x, y, minZ], [x, y, maxZ], .14, .1);
    }
    for (const frame of [0, layout.frameCount - 2]) {
      const z = minZ + frame * bay;
      wallParts.rod(galvanized, [x, floorY + 1.5, z + .35], [x, layout.windowBottom - .35, z + bay - .35], .026);
      wallParts.rod(galvanized, [x, layout.windowBottom - .35, z + .35], [x, floorY + 1.5, z + bay - .35], .026);
    }
  }
  // Corrugated long walls with continuous clerestory windows, divided by mullions.
  for (const x of [minX, maxX]) {
    wallParts.box(plinth, [.25, 1.35, length], [x, floorY + .675, layout.centerZ]);
    for (const [bottom, top] of [[wallBottom, layout.windowBottom], [layout.windowTop, eave]]) {
      wallParts.box(cladding, [.13, top - bottom, length], [x, (bottom + top) / 2, layout.centerZ]);
      for (let z = minZ; z <= maxZ; z += .65) {
        wallParts.box(cladding, [.2, top - bottom, .045], [x, (bottom + top) / 2, z]);
      }
    }
    wallParts.box(layout.daylightOpenings ? glass : cladding, [.05, layout.windowTop - layout.windowBottom, length],
      [x, (layout.windowTop + layout.windowBottom) / 2, layout.centerZ]);
    for (const y of [layout.windowBottom, layout.windowTop]) {
      wallParts.box(galvanized, [.2, .07, length], [x, y, layout.centerZ]);
    }
    for (let z = minZ; z <= maxZ + .01; z += bay / 3) {
      wallParts.box(galvanized, [.19, layout.windowTop - layout.windowBottom, .06],
        [x, (layout.windowTop + layout.windowBottom) / 2, z]);
    }
  }
  const endPanel = (x1, x2, y1, y2, z) => {
    if (x2 <= x1 || y2 <= y1) return;
    wallParts.box(cladding, [x2 - x1, y2 - y1, .14], [(x1 + x2) / 2, (y1 + y2) / 2, z]);
    for (let x = x1; x < x2; x += .65) wallParts.box(cladding, [.045, y2 - y1, .2], [x, (y1 + y2) / 2, z]);
  };
  for (const z of [minZ, maxZ]) {
    if (z === minZ) endPanel(minX, maxX, floorY, eave, z);
    else {
      const dw = layout.doorWidth, dh = layout.doorHeight;
      const opening1 = cx - dw / 2, opening2 = cx + dw / 2;
      endPanel(minX, opening1, floorY, floorY + dh, z);
      endPanel(opening2, maxX, floorY, floorY + dh, z);
      endPanel(minX, maxX, floorY + dh, eave, z);
      wallParts.box(galvanized, [dw + .3, .3, .36], [cx, floorY + dh, z]);
      for (const x of [opening1, opening2]) wallParts.box(steel, [.18, dh, .3], [x, floorY + dh / 2, z]);
      wallParts.box(roofSkin, [dw - .2, 1.4, .06], [cx, floorY + dh - .75, z + .05]);
      for (let y = floorY + dh - 1.45; y <= floorY + dh - .1; y += .16) {
        wallParts.box(galvanized, [dw - .2, .025, .085], [cx, y, z + .06]);
      }
      const px = maxX - 1.0;
      wallParts.box(door, [1.3, 2.55, .07], [px, floorY + 1.275, z - .13]);
      wallParts.box(galvanized, [.04, .28, .07], [px - .45, floorY + 1.18, z - .19]);
      for (const side of [-1, 1]) wallParts.box(steel, [.055, 2.62, .14], [px + side * .69, floorY + 1.31, z - .13]);
    }
    const gableGeometry = new THREE.BufferGeometry();
    gableGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      minX, eave, z, cx, ridge, z, maxX, eave, z,
      maxX, eave, z + .12, cx, ridge, z + .12, minX, eave, z + .12,
    ], 3));
    gableGeometry.computeVertexNormals();
    const gable = new THREE.Mesh(gableGeometry, cladding);
    gable.name = "roof-gable"; gable.castShadow = gable.receiveShadow = true;
    roof.add(gable);
    for (let x = minX + .7; x < maxX; x += 1.3) {
      roofParts.box(galvanized, [.05, roofHeight(x) - eave, .18],
        [x, (roofHeight(x) + eave) / 2, z]);
    }
  }

  // Longitudinal purlins, roof braces and two real openings for translucent skylight bands.
  for (let x = minX + .65; x < maxX; x += 2.65) {
    roofParts.beam(galvanized, [x, roofHeight(x) - .31, minZ], [x, roofHeight(x) - .31, maxZ], .18, .12);
  }
  for (const frame of [0, layout.frameCount - 2]) {
    const z = minZ + frame * bay;
    for (const [x1, x2] of [[minX + .7, cx], [cx, maxX - .7]]) {
      roofParts.rod(galvanized, [x1, roofHeight(x1) - .38, z], [x2, roofHeight(x2) - .38, z + bay], .026);
      roofParts.rod(galvanized, [x2, roofHeight(x2) - .38, z], [x1, roofHeight(x1) - .38, z + bay], .026);
    }
  }
  for (const [start, end] of [[minX - .45, cx], [cx, maxX + .45]]) {
    const skylight1 = start + (end - start) * .38, skylight2 = skylight1 + 1.65;
    for (const [a, b, mat] of [[start, skylight1, roofSkin], [skylight1, skylight2, layout.daylightOpenings ? glass : roofSkin], [skylight2, end, roofSkin]]) {
      roofParts.beam(mat, [a, roofHeight(a), layout.centerZ], [b, roofHeight(b), layout.centerZ], .09, length + .8);
    }
    for (let x = start; x <= end; x += .72) {
      if (x > skylight1 && x < skylight2) continue;
      roofParts.beam(roofSkin, [x, roofHeight(x) + .06, minZ - .4], [x, roofHeight(x) + .06, maxZ + .4], .045, .035);
    }
    for (const x of [skylight1, skylight2]) {
      roofParts.beam(galvanized, [x, roofHeight(x) + .05, minZ - .4], [x, roofHeight(x) + .05, maxZ + .4], .07, .08);
    }
    for (let z = minZ; z <= maxZ; z += bay) {
      roofParts.beam(galvanized, [skylight1, roofHeight(skylight1), z], [skylight2, roofHeight(skylight2), z], .08, .06);
    }
  }
  roofParts.beam(galvanized, [cx, ridge + .08, minZ - .4], [cx, ridge + .08, maxZ + .4], .15, .45);
  const lights = [], keyLights = [];
  const grid = layout.lightGrid ?? gridLights(layout, lighting);
  for (const fixture of grid.fixtures) {
      const [x, y, z] = fixture.position;
      roofParts.box(dark, [.47, .16, 2.85], [x, y, z]);
      roofParts.box(galvanized, [.48, .025, 2.9], [x, y + .08, z]);
      roofParts.box(emitter, [.34, .028, 2.65], [x, y - .09, z]);
      for (const dz of [-1.08, 1.08]) {
        roofParts.rod(dark, [x, y + .08, z + dz], [x, roofHeight(x) - .3, z + dz], .009);
      }
      const light = new THREE.RectAreaLight(0xf4f8ff, fixture.luminance, .34, 2.65);
      light.userData.baseIntensity = fixture.luminance;
      light.name = `warehouse-ceiling-light-${lights.length + 1}`;
      light.position.set(x, y - .115, z); light.lookAt(x, floorY, z);
      roof.add(light); lights.push(light);
  }
  for (let i = 0; i < Math.min(lighting.maxShadowLights, lights.length); i++) {
    const key = new THREE.SpotLight(0xf4f8ff, 1, layout.height * 2.5, .72, .6, 2);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -.00008; key.shadow.normalBias = .015;
    key.shadow.camera.near = .15; key.shadow.camera.far = layout.height * 2.5;
    key.name = `indoor-shadow-light-${i}`;
    roof.add(key, key.target); keyLights.push(key);
  }
  // Illumination is fixed to the project, never relocated when the camera moves.
  const focus = lighting.shadowFocus ?? [.75, .5];
  const fx = minX + width * focus[0], fz = minZ + length * focus[1];
  const candidates = [...lights].sort((a, b) =>
    Math.hypot(a.position.x - fx, a.position.z - fz) - Math.hypot(b.position.x - fx, b.position.z - fz));
  keyLights.forEach((key, i) => {
    key.position.copy(candidates[i].position).add(new THREE.Vector3(0, -.1, 0));
    key.target.position.set(key.position.x, floorY + .8, key.position.z);
  });
  const wallPieceCount = wallParts.finish(), roofPieceCount = roofParts.finish();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width + .5, .36, length + .5), floorMaterial);
  floor.name = "continuous-concrete-floor"; floor.position.set(cx, floorY - .18, layout.centerZ);
  floor.receiveShadow = true;
  const bounds = new THREE.Box3(new THREE.Vector3(minX - .5, floorY - .36, minZ - .5),
    new THREE.Vector3(maxX + .5, ridge + .2, maxZ + .5));
  const metrics = { wallPieces: wallPieceCount, roofPieces: roofPieceCount, fixtures: lights.length,
    frames: layout.frameCount, modelClearance: tieY - layout.equipmentTop, dimensions: [width, length, ridge - floorY],
    requestedFixtures: grid.requestedCount, budgetLimited: grid.budgetLimited, shadowLightBudget: keyLights.length };
  return {
    root, walls, roof, floor, bounds, layout, lights, keyLights, emitter, metrics,
    update(state) {
      root.visible = state.building;
      walls.visible = state.walls; roof.visible = state.roof;
      const power = state.lamps ? state.lampPower * lightingTemplates[state.lighting].lamps : 0;
      emitter.emissiveIntensity = 5 * power;
      lights.forEach(light => { light.intensity = light.userData.baseIntensity * power; });
      keyLights.forEach(light => {
        light.intensity = .65 * (layout.height - 2) ** 2 * power;
        light.castShadow = state.shadows;
        light.visible = state.shadows && state.indoorShadows;
      });
    },
    diagnostics() {
      return {
        buildingVisible: root.visible, wallsVisible: root.visible && walls.visible, roofVisible: root.visible && roof.visible,
        luminousFixtures: root.visible && roof.visible && emitter.emissiveIntensity > 0 ? lights.length : 0,
        activeAreaLights: root.visible && roof.visible ? lights.filter(light => light.intensity > 0).length : 0,
        activeShadowLights: root.visible && roof.visible ? keyLights.filter(light => light.visible && light.intensity > 0).length : 0,
        fixturePositions: lights.map(light => light.position.toArray()),
        ...metrics,
      };
    },
  };
}

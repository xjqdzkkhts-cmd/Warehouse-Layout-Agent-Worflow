import * as THREE from "three";
import { clamp } from "./project.mjs";

function hash(x, y, seed) {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + 917, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
const smooth = x => x * x * (3 - 2 * x);
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], squared = dx * dx + dz * dz;
  const t = squared > 0 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / squared, 0, 1) : 0;
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
export function buildWearData(layout, lanes = [], seed = 173, density = 24) {
  const width = clamp(Math.ceil(layout.width * density), 128, 1024);
  const height = clamp(Math.ceil(layout.length * density), 128, 2048);
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = (col + .5) / width * layout.width, z = (row + .5) / height * layout.length;
    const variation = noise(x * .22, z * .22, seed) * .55
      + noise(x * .8, z * .8, seed) * .3 + noise(x * 3.6, z * 3.6, seed) * .15;
    let polish = 0;
    for (const lane of lanes) for (let i = 1; i < lane.points.length; i++) {
      const d = segmentDistance(x + layout.minX, z + layout.minZ, lane.points[i - 1], lane.points[i]);
      polish = Math.max(polish, Math.exp(-((d / (lane.width * .5)) ** 2)) * (lane.strength ?? .7));
    }
    const i = (row * width + col) * 4;
    data[i] = Math.round(clamp(polish * (.5 + variation * .65), 0, 1) * 255);
    data[i + 1] = Math.round(clamp(.12 + variation * .85, 0, 1) * 255);
    data[i + 2] = Math.round(polish * Math.max(0, noise(x * 6, z * .5, seed) - .65) * 60);
    data[i + 3] = 255;
  }
  return { width, height, data };
}
export function createWearTexture(layout, project) {
  const result = buildWearData(layout, project.traffic, project.surfaceSeed);
  const texture = new THREE.DataTexture(result.data, result.width, result.height);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

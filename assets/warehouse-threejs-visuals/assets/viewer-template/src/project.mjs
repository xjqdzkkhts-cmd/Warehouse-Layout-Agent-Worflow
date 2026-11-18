export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const number = (v, name, min, max) => {
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid ${name}: ${v}`);
  return v;
};
const vector = (v, name, count = 3) => {
  if (!Array.isArray(v) || v.length !== count || !v.every(Number.isFinite)) throw new Error(`Invalid ${name}`);
  return [...v];
};
export function validateProject(input) {
  const p = structuredClone(input);
  if (p.schemaVersion !== 1 || typeof p.id !== "string" || typeof p.title !== "string") throw new Error("Unsupported project configuration");
  if (p.units !== "meter" || p.upAxis !== "Y") throw new Error("Project input must use meters and Y-up");
  if (!["glb", "fixture"].includes(p.source?.type)) throw new Error("Unknown model source");
  number(p.floorY, "floorY", -10000, 10000);
  p.building = { margin: 1.5, clearance: 2.5, roofRise: 2.2, frameSpacing: 6.5,
    daylightOpenings: true, ...p.building };
  for (const key of ["margin", "clearance", "roofRise"]) number(p.building[key], key, .1, 20);
  number(p.building.frameSpacing, "frameSpacing", 2, 12);
  if (typeof p.building.daylightOpenings !== "boolean") throw new Error("Invalid daylightOpenings");
  if (p.building.bounds) {
    vector(p.building.bounds.min, "building.min"); vector(p.building.bounds.max, "building.max");
  }
  p.lighting = { template: "daylight", spacingX: 10, spacingZ: 12, maxLights: 12,
    fixtureLuminance: 65, maxShadowLights: 2, shadowFocus: [.75, .5], ...p.lighting };
  if (!["daylight", "soft", "warm"].includes(p.lighting.template)) throw new Error("Unknown lighting template");
  for (const key of ["spacingX", "spacingZ"]) number(p.lighting[key], key, 3, 25);
  number(p.lighting.maxLights, "maxLights", 1, 24);
  number(p.lighting.maxShadowLights, "maxShadowLights", 0, 2);
  number(p.lighting.fixtureLuminance, "fixtureLuminance", 1, 200);
  if (!Number.isInteger(p.lighting.maxLights) || !Number.isInteger(p.lighting.maxShadowLights)) throw new Error("Light budgets must be integers");
  vector(p.lighting.shadowFocus, "shadow focus", 2).forEach(v => number(v, "shadow focus coordinate", 0, 1));
  p.materialBindings ??= {};
  p.materialColors ??= {};
  for (const [name, color] of Object.entries(p.materialColors)) {
    vector(color, `material color ${name}`);
    color.forEach(v => number(v, "linear color channel", 0, 1));
  }
  p.cameras ??= {};
  for (const [id, camera] of Object.entries(p.cameras)) {
    vector(camera.position, `${id}.position`); vector(camera.target, `${id}.target`);
    number(camera.fov ?? 43, `${id}.fov`, 20, 85);
  }
  p.traffic ??= [];
  for (const lane of p.traffic) {
    if (!Array.isArray(lane.points) || lane.points.length < 2) throw new Error("Traffic lane needs at least two points");
    lane.points.forEach(point => vector(point, "lane point", 2));
    number(lane.width, "lane width", .3, 20);
    number(lane.strength ?? .7, "lane strength", 0, 1);
  }
  p.surfaceSeed = number(p.surfaceSeed ?? 173, "surfaceSeed", 0, 2147483647);
  p.source.floorNodes ??= [];
  if (!Array.isArray(p.source.floorNodes) || !p.source.floorNodes.every(v => typeof v === "string")) throw new Error("Invalid floor node list");
  if (p.source.type === "glb" && (typeof p.source.url !== "string" || !p.source.url.startsWith("./assets/"))) {
    throw new Error("GLB must be a local project asset");
  }
  if (p.source.infoUrl !== undefined && (typeof p.source.infoUrl !== "string" || !p.source.infoUrl.startsWith("./assets/"))) {
    throw new Error("Model record must be a local project asset");
  }
  return p;
}

export function gridLights(layout, settings) {
  let cols = Math.max(1, Math.ceil(layout.width / settings.spacingX));
  let rows = Math.max(1, Math.ceil(layout.length / settings.spacingZ));
  const requestedCount = cols * rows;
  if (requestedCount > settings.maxLights) {
    let best = Infinity, bestGrid = [1, 1];
    for (let c = 1; c <= cols; c++) for (let r = 1; r <= rows; r++) {
      const count = c * r;
      if (count > settings.maxLights) continue;
      const score = Math.abs(Math.log((layout.width / c) / (layout.length / r)))
        + (settings.maxLights - count) / settings.maxLights * .5;
      if (score < best) { best = score; bestGrid = [c, r]; }
    }
    [cols, rows] = bestGrid;
  }
  const height = layout.eave - layout.floorY;
  const y = layout.eave - Math.min(1.7, height * .22);
  const luminance = settings.fixtureLuminance * clamp((height / 17.2) ** 1.15, .4, 1.5)
    * clamp((layout.width * layout.length / (cols * rows)) / 128, .6, 1.6);
  const fixtures = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) fixtures.push({
    position: [layout.minX + layout.width * (c + .5) / cols, y, layout.minZ + layout.length * (r + .5) / rows],
    luminance,
  });
  return { fixtures, cols, rows, requestedCount, budgetLimited: requestedCount > fixtures.length };
}

export const lightingTemplates = {
  daylight: { direction: [1.7, 2.4, 1.2], color: 0xfff1dd, power: 3.0, fill: .14, area: .72, environment: .62, lamps: 1 },
  soft: { direction: [.7, 2.6, .8], color: 0xf3f7ff, power: 1.3, fill: .23, area: 1.1, environment: .72, lamps: 1.1 },
  warm: { direction: [1.8, 1.3, .7], color: 0xffd4a4, power: 2.7, fill: .12, area: .65, environment: .58, lamps: .9 },
};

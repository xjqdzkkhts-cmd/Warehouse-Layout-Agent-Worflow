import { clamp, gridLights } from "./project.mjs";
export function warehouseLayout(bounds, floorY = .25, options = {}, lighting) {
  const config = { margin: 1.5, clearance: 2.5, roofRise: 2.2, frameSpacing: 6.5, daylightOpenings: true, ...options };
  const minX = config.bounds?.min[0] ?? bounds.min[0] - config.margin;
  const maxX = config.bounds?.max[0] ?? bounds.max[0] + config.margin;
  const minZ = config.bounds?.min[2] ?? bounds.min[2] - config.margin;
  const maxZ = config.bounds?.max[2] ?? bounds.max[2] + config.margin;
  const eave = config.bounds?.max[1] ?? Math.max(floorY + 6, bounds.max[1] + config.clearance);
  if (![minX, maxX, minZ, maxZ, eave, floorY].every(Number.isFinite)
    || maxX - minX < 8 || maxZ - minZ < 8 || eave - floorY < 5) throw new Error("Preview envelope is too small or invalid");
  if (maxX - minX > 160 || maxZ - minZ > 240 || eave - floorY > 40) throw new Error("Preview envelope exceeds the configured size limits");
  if ([minX, maxX, minZ, maxZ].some(v => Math.abs(v) > 10000)) throw new Error("Use project-local coordinates before loading");
  if (minX > bounds.min[0] || maxX < bounds.max[0] || minZ > bounds.min[2] || maxZ < bounds.max[2]
    || eave - 1.2 < bounds.max[1]) throw new Error("Building envelope intersects the equipment bounds");
  const ridge = eave + config.roofRise;
  const height = eave - floorY;
  const layout = {
    minX, maxX, minZ, maxZ, floorY, eave, ridge,
    centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2,
    width: maxX - minX, length: maxZ - minZ, height,
    frameCount: Math.max(2, Math.ceil((maxZ - minZ) / config.frameSpacing) + 1),
    windowBottom: eave - Math.min(4, height * .3),
    windowTop: eave - Math.min(2.15, height * .13),
    daylightOpenings: config.daylightOpenings,
    equipmentTop: bounds.max[1],
    doorWidth: clamp((maxX - minX) * .21, 3, 6.4),
    doorHeight: Math.min(5.4, height * .68),
    envelopeSource: config.bounds ? "project-envelope" : "preview-assumption",
  };
  if (lighting) layout.lightGrid = gridLights(layout, lighting);
  return layout;
}

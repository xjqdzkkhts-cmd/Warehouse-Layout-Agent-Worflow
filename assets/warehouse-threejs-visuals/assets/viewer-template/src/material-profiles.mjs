export const materialProfiles = {
  galvanized: { kind: "metal", metalness: .92, roughness: .33, clearcoat: 0, specularIntensity: 1 },
  stainless: { kind: "metal", metalness: .96, roughness: .22, clearcoat: 0, specularIntensity: 1 },
  powderCoat: { kind: "paint", metalness: 0, roughness: .38, clearcoat: .16, clearcoatRoughness: .32, specularIntensity: 1 },
  enamel: { kind: "paint", metalness: 0, roughness: .29, clearcoat: .32, clearcoatRoughness: .2, specularIntensity: 1 },
  plastic: { kind: "rubber", metalness: 0, roughness: .42, clearcoat: .05, specularIntensity: .8 },
  rubber: { kind: "rubber", metalness: 0, roughness: .68, clearcoat: 0, specularIntensity: .5 },
  cardboard: { kind: "paper", metalness: 0, roughness: .86, clearcoat: 0, specularIntensity: .35 },
  concrete: { kind: "floor", metalness: 0, roughness: .72, clearcoat: 0, specularIntensity: 1 },
  wall: { kind: "wall", metalness: 0, roughness: .8, clearcoat: 0, specularIntensity: .8 },
};
export function resolveMaterial(material, bindings = {}) {
  const explicit = Object.hasOwn(bindings, material.name) ? bindings[material.name] : material.userData?.materialRole;
  // Authored textures and special optical materials remain authoritative.
  const authored = material.map || material.normalMap || material.roughnessMap || material.metalnessMap
    || material.transmission > 0 || material.transparent || material.emissive?.getHex() > 0;
  if (authored || explicit === "preserve") return { role: null, kind: "other", source: "preserved" };
  if (explicit !== undefined) {
    if (!Object.hasOwn(materialProfiles, explicit)) throw new Error(`Unknown material role: ${explicit}`);
    return { role: explicit, kind: materialProfiles[explicit].kind, source: Object.hasOwn(bindings, material.name) ? "project" : "asset" };
  }
  return { role: null, kind: "other", source: "unassigned" };
}
export function applyProfile(material, role) {
  const profile = materialProfiles[role];
  if (!profile) return;
  for (const [key, value] of Object.entries(profile)) if (key !== "kind") material[key] = value;
}

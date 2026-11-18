export const qualitySchema = {
  pixelRatio: { values: [.75, 1, 1.5] },
  shadows: { type: "boolean" },
  shadowResolution: { values: [1024, 2048, 4096] },
  indoorShadows: { type: "boolean" },
  detail: { type: "boolean" },
  microDetail: { type: "boolean" },
  microStrength: { min: 0, max: 1.5 },
  ao: { type: "boolean" },
  aoQuality: { values: ["low", "medium", "high"] },
  aoMoving: { type: "boolean" },
  aoRadius: { min: .1, max: 1 },
  occlusion: { min: 0, max: 1.2 },
  reflections: { type: "boolean" },
  reflectionQuality: { values: ["low", "medium", "high"] },
  reflection: { min: 0, max: 1 },
  antialias: { type: "boolean" },
  bloom: { type: "boolean" },
  bloomStrength: { min: 0, max: .5 },
};
export const qualityKeys = Object.keys(qualitySchema);
export const qualityPresets = Object.freeze({
  high: Object.freeze({
    pixelRatio: 1.5, shadows: true, shadowResolution: 4096, indoorShadows: true,
    detail: true, microDetail: true, microStrength: 1,
    ao: true, aoQuality: "high", aoMoving: true, aoRadius: .45, occlusion: .65,
    reflections: true, reflectionQuality: "high", reflection: .75,
    antialias: true, bloom: true, bloomStrength: .16,
  }),
  medium: Object.freeze({
    pixelRatio: 1, shadows: true, shadowResolution: 2048, indoorShadows: false,
    detail: true, microDetail: true, microStrength: .7,
    ao: true, aoQuality: "medium", aoMoving: true, aoRadius: .45, occlusion: .6,
    reflections: true, reflectionQuality: "medium", reflection: .65,
    antialias: true, bloom: false, bloomStrength: .12,
  }),
  low: Object.freeze({
    pixelRatio: .75, shadows: true, shadowResolution: 1024, indoorShadows: false,
    detail: true, microDetail: false, microStrength: .7,
    ao: false, aoQuality: "low", aoMoving: false, aoRadius: .45, occlusion: .55,
    reflections: false, reflectionQuality: "low", reflection: .55,
    antialias: false, bloom: false, bloomStrength: .1,
  }),
});
export function validateQualityValue(key, value) {
  const rule = qualitySchema[key];
  if (!rule) throw new Error(`Unknown graphics setting: ${key}`);
  const valid = rule.type === "boolean" ? typeof value === "boolean"
    : rule.values ? rule.values.includes(value)
      : Number.isFinite(value) && value >= rule.min && value <= rule.max;
  if (!valid) throw new Error(`Invalid graphics setting: ${key}`);
  return value;
}
export function qualitySnapshot(state) {
  return Object.fromEntries(qualityKeys.map(key => [key, validateQualityValue(key, state[key])]));
}
export function selectQuality(state, preset, previousCustom = null) {
  if (!["high", "medium", "low", "custom"].includes(preset)) throw new Error("Unknown graphics preset");
  const values = preset === "custom" ? qualitySnapshot(previousCustom ?? state) : qualityPresets[preset];
  return { ...state, ...values, quality: preset };
}
export function editQuality(state, key, value) {
  validateQualityValue(key, value);
  return { ...state, [key]: value, quality: "custom" };
}
export const qualityStorageKey = "warehouse.graphics.v1";
export function restoreQuality(serialized, fallback = "high") {
  const initial = { ...qualityPresets[fallback], quality: fallback };
  try {
    const saved = JSON.parse(serialized);
    if (saved?.version !== 1 || !["low", "medium", "high", "custom"].includes(saved.selected)) throw new Error("Invalid preferences");
    const custom = saved.custom ? qualitySnapshot(saved.custom) : null;
    if (saved.selected === "custom" && !custom) throw new Error("Missing custom settings");
    return { state: selectQuality(initial, saved.selected, custom), custom };
  } catch {
    return { state: initial, custom: null };
  }
}
export function serializeQuality(state, custom) {
  return JSON.stringify({ version: 1, selected: state.quality,
    custom: custom ? qualitySnapshot(custom) : null });
}

export function aoConfiguration(state, interacting, width, height) {
  const levels = {
    low: { scale: .4, samples: 8, denoise: 8 },
    medium: { scale: .55, samples: 12, denoise: 12 },
    high: { scale: .8, samples: 24, denoise: 16 },
  };
  const level = levels[state.aoQuality];
  const scale = interacting ? Math.min(level.scale, .4) : level.scale;
  return {
    enabled: state.look === "realistic" && state.ao && (!interacting || state.aoMoving),
    width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)),
    radius: state.aoRadius, thickness: Math.min(.5, Math.max(.08, state.aoRadius * .55)),
    samples: interacting ? 8 : level.samples, denoise: interacting ? 8 : level.denoise,
    denoiseRadius: Math.max(2.5, 6 * scale), intensity: state.occlusion,
  };
}

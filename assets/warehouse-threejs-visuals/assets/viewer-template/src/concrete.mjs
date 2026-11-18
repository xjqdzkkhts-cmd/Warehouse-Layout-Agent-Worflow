import * as THREE from "three";

export const concreteUniforms = {
  uWearAtlas: { value: null },
  uFloorBounds: { value: new THREE.Vector4() },
  uWearStrength: { value: 1 },
  uConcreteRoughness: { value: .72 },
};
export function configureConcrete(layout, texture) {
  concreteUniforms.uWearAtlas.value = texture;
  concreteUniforms.uFloorBounds.value.set(layout.minX, layout.minZ, layout.width, layout.length);
}
export const concreteGLSL = `
  uniform sampler2D uWearAtlas;
  uniform vec4 uFloorBounds;
  uniform float uWearStrength,uConcreteRoughness;
  vec3 concreteWear(vec3 worldPosition) {
    vec2 uv=(worldPosition.xz-uFloorBounds.xy)/uFloorBounds.zw;
    float inside=step(0.0,uv.x)*step(0.0,uv.y)*step(uv.x,1.0)*step(uv.y,1.0);
    vec3 wear=texture2D(uWearAtlas,clamp(uv,0.0,1.0)).rgb;
    return mix(vec3(0.0,.52,0.0),wear,inside);
  }
  float concretePolish(vec3 wear) { return clamp(wear.r*uWearStrength,0.0,1.0); }
  float concreteRoughness(vec3 wear,float grain) {
    return clamp(mix(uConcreteRoughness*(.86+grain*.30),.16,concretePolish(wear))+wear.b*.12,.14,.95);
  }
`;

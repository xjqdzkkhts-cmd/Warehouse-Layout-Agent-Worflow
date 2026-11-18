export const proceduralRoles = Object.freeze({
  galvanized: 1, stainless: 2, powderCoat: 3, enamel: 4,
  plastic: 5, rubber: 6, cardboard: 7, concrete: 8, wall: 9,
});
const defaults = { metal: "galvanized", paint: "powderCoat", rubber: "rubber",
  paper: "cardboard", floor: "concrete", wall: "wall" };
export function proceduralRole(material, kind) {
  return proceduralRoles[material.userData.preview?.role ?? defaults[kind]] ?? 0;
}
export const proceduralGLSL = `
  uniform float uProceduralEnabled,uProceduralStrength;
  varying vec3 vSurfacePosition;
  float warehouseHash(vec3 p) {
    p=fract(p*vec3(.1031,.11369,.13787));
    p+=dot(p,p.yzx+19.19);
    return fract((p.x+p.y)*p.z);
  }
  float warehouseNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(
      mix(mix(warehouseHash(i),warehouseHash(i+vec3(1,0,0)),f.x),
          mix(warehouseHash(i+vec3(0,1,0)),warehouseHash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(warehouseHash(i+vec3(0,0,1)),warehouseHash(i+vec3(1,0,1)),f.x),
          mix(warehouseHash(i+vec3(0,1,1)),warehouseHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float warehouseFilteredNoise(vec3 p) {
    float footprint=max(length(dFdx(p)),length(dFdy(p)));
    return mix(.5,warehouseNoise(p),1.0-smoothstep(.6,1.8,footprint));
  }
  vec2 warehouseSurfaceDetail(vec3 p) {
    float macro=warehouseFilteredNoise(p*1.7+vec3(13,7,3))-.5;
    #if WAREHOUSE_ROLE == 1
      float grain=warehouseFilteredNoise(p*65.0)-.5;
      return vec2(grain*.17+macro*.035,grain*.05);
    #elif WAREHOUSE_ROLE == 2
      float phase=p.y*2100.0+warehouseNoise(p*24.0)*1.8;
      float grain=sin(phase)*(1.0-smoothstep(1.0,3.14,fwidth(phase)));
      return vec2(grain*.055+macro*.018,grain*.006);
    #elif WAREHOUSE_ROLE == 3 || WAREHOUSE_ROLE == 4
      float grain=warehouseFilteredNoise(p*620.0)-.5;
      return vec2(grain*.075+macro*.014,macro*.012);
    #elif WAREHOUSE_ROLE == 5 || WAREHOUSE_ROLE == 6
      float grain=warehouseFilteredNoise(p*260.0)-.5;
      return vec2(grain*.085+macro*.018,grain*.012);
    #elif WAREHOUSE_ROLE == 7
      float grain=warehouseFilteredNoise(p*vec3(480,90,750))-.5;
      return vec2(grain*.08+macro*.022,grain*.04+macro*.016);
    #elif WAREHOUSE_ROLE == 8
      float grain=warehouseFilteredNoise(p*9.0)-.5;
      return vec2(0.0,grain*.055);
    #elif WAREHOUSE_ROLE == 9
      float grain=warehouseFilteredNoise(p*8.0)-.5;
      return vec2(grain*.08,macro*.018);
    #else
      return vec2(0.0);
    #endif
  }
`;

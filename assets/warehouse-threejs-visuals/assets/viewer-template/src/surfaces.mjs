import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { concreteGLSL, concreteUniforms } from "./concrete.mjs";
import { proceduralGLSL, proceduralRole } from "./procedural-surface.mjs";

export const surfaceEnabled = { value: 1 };
export const proceduralUniforms = {
  uProceduralEnabled: { value: 1 }, uProceduralStrength: { value: 1 },
};
const settings = {
  floor: { scale: 1 / 3, normal: .46, colorGain: 2.4, colorBlend: .9, roughMin: .58, roughMax: 1.45 },
  metal: { scale: 1 / .7, normal: .16, colorGain: 1.7, colorBlend: .32, roughMin: .72, roughMax: 1.8 },
  paint: { scale: 1 / .18, normal: .18, colorGain: 1.15, colorBlend: .45, roughMin: .86, roughMax: 1.12 },
  paper: { scale: 1 / .3, normal: .3, colorGain: 1.15, colorBlend: .7, roughMin: .9, roughMax: 1.08 },
  rubber: { scale: 1 / .14, normal: .3, colorGain: 1.15, colorBlend: .55, roughMin: .82, roughMax: 1.2 },
  wall: { scale: 1 / .6, normal: .23, colorGain: 1.15, colorBlend: .5, roughMin: .9, roughMax: 1.05 },
};
export async function loadSurfaces(renderer) {
  const loader = new THREE.TextureLoader();
  const library = {};
  await Promise.all(Object.keys(settings).map(async kind => {
    const maps = {};
    await Promise.all(["color", "normal", "arm"].map(async channel => {
      const name = kind === "floor" && channel === "color" ? "concrete-color" : `${kind}-${channel}`;
      const texture = await loader.loadAsync(`./assets/pbr/${name}.webp`);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.colorSpace = channel === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      maps[channel] = texture;
    }));
    library[kind] = maps;
  }));
  return library;
}
export async function loadWarehouseHDR(renderer) {
  const hdr = await new HDRLoader().loadAsync("./assets/pbr/warehouse.hdr");
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(hdr);
  hdr.dispose(); pmrem.dispose();
  return target;
}
export function classifySurface(material) {
  const name = material.name.toLowerCase();
  if (material.map || material.transmission > 0 || material.emissive?.getHex() > 0) return "other";
  if (/^(floor|地面|地坪)|月台/.test(name)) return "floor";
  if (/^wall$|外墙/.test(name)) return "wall";
  if (/paper|纸箱/.test(name)) return "paper";
  if (/皮带|轮胎|管线|rubber|wheel|轮子/.test(name)) return "rubber";
  const color = material.color;
  const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  if (spread > .08 || /白色|white|black|gray metal|电控柜|侧板|托盘|周转箱|架|立柱|机体|外罩|内构|平台|上横梁|下横梁|载货台|防护网/.test(name)) return "paint";
  if (/^gray$|不锈钢|滚筒|铁|金属|steel|metal|链条|螺钉|金属杆|梯子|地轨/.test(name) || material.metalness >= .6) return "metal";
  return "paint";
}
export function attachSurface(material, kind, library) {
  if (!library[kind]) return;
  const maps = library[kind], config = settings[kind], role = proceduralRole(material, kind);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uSurfaceEnabled: surfaceEnabled, uPbrColor: { value: maps.color },
      uPbrNormal: { value: maps.normal }, uPbrArm: { value: maps.arm },
    });
    Object.assign(shader.uniforms, proceduralUniforms);
    if (kind === "floor") Object.assign(shader.uniforms, concreteUniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec3 vPbrPosition;
      varying vec3 vPbrNormal;
      varying vec3 vSurfacePosition;`);
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      vec4 pbrPosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        pbrPosition=instanceMatrix*pbrPosition;
      #endif
      vPbrPosition=(modelMatrix*pbrPosition).xyz;
      mat4 surfaceMatrix=modelMatrix;
      #ifdef USE_INSTANCING
        surfaceMatrix=modelMatrix*instanceMatrix;
      #endif
      vSurfacePosition=transformed*vec3(length(surfaceMatrix[0].xyz),length(surfaceMatrix[1].xyz),length(surfaceMatrix[2].xyz));
      vPbrNormal=inverseTransformDirection(transformedNormal,viewMatrix);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vPbrPosition; varying vec3 vPbrNormal;
      #define WAREHOUSE_ROLE ${role}
      ${proceduralGLSL}
      ${kind === "floor" ? concreteGLSL : ""}
      uniform float uSurfaceEnabled;
      uniform sampler2D uPbrColor,uPbrNormal,uPbrArm;
      vec3 pbrWeights(vec3 n) { vec3 w=pow(abs(n),vec3(6.0)); return w/max(dot(w,vec3(1.0)),.00001); }
      vec3 pbrSample(sampler2D tex,vec3 p,vec3 n,vec3 w) {
        vec3 s=sign(n+vec3(.000001));
        return texture2D(tex,vec2(-s.x*p.z,p.y)).rgb*w.x
          +texture2D(tex,vec2(p.x,-s.y*p.z)).rgb*w.y
          +texture2D(tex,vec2(s.z*p.x,p.y)).rgb*w.z;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      vec3 surfaceN=normalize(vPbrNormal), surfaceW=pbrWeights(surfaceN);
      vec3 surfaceP=vPbrPosition*${config.scale.toFixed(8)};
      vec2 surfaceProcedure=vec2(0.0);
      ${kind === "floor" ? "vec3 floorWear=concreteWear(vPbrPosition);" : ""}
      if(uSurfaceEnabled>.5) {
        vec3 surfaceColor=pbrSample(uPbrColor,surfaceP,surfaceN,surfaceW);
        diffuseColor.rgb*=mix(vec3(1.0),surfaceColor*${config.colorGain.toFixed(4)},${config.colorBlend.toFixed(4)});
        if(uProceduralEnabled>.5) {
          surfaceProcedure=warehouseSurfaceDetail(vSurfacePosition)*uProceduralStrength;
          diffuseColor.rgb*=1.0+surfaceProcedure.y;
        }
        ${kind === "floor" ? "diffuseColor.rgb*=mix(.68,1.22,floorWear.g)*(1.0-floorWear.b*.28);" : ""}
      }`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      if(uSurfaceEnabled>.5) {
        vec3 arm=pbrSample(uPbrArm,surfaceP,surfaceN,surfaceW);
        ${kind === "floor" ? "roughnessFactor=clamp(concreteRoughness(floorWear,arm.g),.14,.97);"
    : `roughnessFactor=clamp(roughnessFactor*mix(${config.roughMin.toFixed(4)},${config.roughMax.toFixed(4)},arm.g)+surfaceProcedure.x,.12,1.0);`}
        diffuseColor.rgb*=mix(.88,1.0,arm.r);
      }`);
    if (kind === "metal") shader.fragmentShader = shader.fragmentShader.replace("#include <metalnessmap_fragment>",
      `#include <metalnessmap_fragment>
        if(uSurfaceEnabled>.5) metalnessFactor*=pbrSample(uPbrArm,surfaceP,surfaceN,surfaceW).b;`);
    // Blend tangent perturbations onto the smooth world normal; flat maps preserve it exactly.
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      if(uSurfaceEnabled>.5) {
        vec3 sg=sign(surfaceN+vec3(.000001));
        vec2 nx=texture2D(uPbrNormal,vec2(-sg.x*surfaceP.z,surfaceP.y)).xy*2.0-1.0;
        vec2 ny=texture2D(uPbrNormal,vec2(surfaceP.x,-sg.y*surfaceP.z)).xy*2.0-1.0;
        vec2 nz=texture2D(uPbrNormal,vec2(sg.z*surfaceP.x,surfaceP.y)).xy*2.0-1.0;
        vec3 perturb=vec3(0.0,nx.y,-sg.x*nx.x)*surfaceW.x
          +vec3(ny.x,0.0,-sg.y*ny.y)*surfaceW.y
          +vec3(sg.z*nz.x,nz.y,0.0)*surfaceW.z;
        vec3 worldN=inverseTransformDirection(normal,viewMatrix);
        normal=normalize(mat3(viewMatrix)*(worldN+perturb*${config.normal.toFixed(4)}${kind === "floor" ? "*(1.0-concretePolish(floorWear)*.78)" : ""}));
      }`);
  };
  material.customProgramCacheKey = () => `warehouse-pbr-v7-${kind}-${role}`;
}

export function installSoftShadows(worldSpan = 60) {
  let chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const signature = "float getShadow( sampler2D shadowMap,";
  const code = `
    vec2 warehouseDisk(int i,float turn) {
      float angle=float(i)*2.39996323+turn;
      return vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/20.0);
    }
    float warehousePCSS(sampler2D shadowMap,vec2 mapSize,vec3 coord) {
      float rotation=rand(floor(coord.xy*mapSize))*PI2;
      float blockerSum=0.0,blockerCount=0.0;
      for(int i=0;i<12;i++) {
        vec2 offset=warehouseDisk(i,rotation)*${(.22 / worldSpan).toFixed(8)};
        float depth=unpackRGBAToDepth(texture2D(shadowMap,coord.xy+offset));
        if(depth<coord.z-.00004) { blockerSum+=depth; blockerCount+=1.0; }
      }
      if(blockerCount<.5) return texture2DCompare(shadowMap,coord.xy,coord.z);
      float blocker=blockerSum/blockerCount;
      float radius=clamp((coord.z-blocker)*.10,1.0/mapSize.x,${(.32 / worldSpan).toFixed(8)});
      float sum=0.0;
      for(int i=0;i<20;i++) sum+=texture2DCompare(shadowMap,coord.xy+warehouseDisk(i,rotation)*radius,coord.z);
      return sum/20.0;
    }
    `;
  chunk = chunk.replace(signature, code + signature);
  chunk = chunk.replace("if ( frustumTest ) {", `if ( frustumTest ) {
    #if defined( SHADOWMAP_TYPE_PCF_SOFT )
      return mix(1.0,warehousePCSS(shadowMap,shadowMapSize,shadowCoord.xyz),shadowIntensity);
    #endif`);
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk;
}

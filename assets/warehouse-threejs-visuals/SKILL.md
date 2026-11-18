---
name: warehouse-threejs-visuals
description: "为仓储 GLB 或现有 Three.js 应用复用写实材质、空间光照、地坪反射、AO 和画质预设，并验证跨场景效果。适用于仓储网页预览及视觉回归，不负责 CAD 识别、原生 Blender/UE 工程生成、LOD 制作或园区流式加载。"
---

# 仓储 Three.js 写实预览

把同一套视觉规则迁移到用户的场景，不重建本包参考图里的设备布局。
本包包含可运行模板、固定资源与已实现算法；不是仅供模型自由发挥的美术提示词。

## 选择工作方式

- **新场景独立测试**：复制 `assets/viewer-template/`，优先使用 `scripts/create-preview.mjs`。
  模板已带编译后的页面、PBR 位图和 HDR，初次查看只需 Node.js。
- **接入已有应用**：保留用户的框架和界面，按 [渲染实现](references/rendering.md) 移植所需模块。
  不为复用效果强制改用 Vite、替换整个前端，或把已有场景重建为示例。
- **确认是否达到参考质量**：按 [测试与验收](references/validation.md) 检查；
  对照图在 `assets/reference-images/`，它们是视觉参考，不是几何真值。

## 新场景流程

1. 读取 [场景接入约定](references/scene-contract.md)。获得 GLB、一个已知尺寸、地面标高、
   建筑是否已包含及允许改动的范围。已有信息不重复询问。
2. 用 `node scripts/inspect-glb.mjs <model.glb>` 只读检查场景、材质、实例和外部依赖。
   单位、地坪或建筑归属不明时先确认，不默认覆盖原地坪。
3. 确认输入是适合本模板的单层设备场景后，创建新输出：

   ```sh
   node scripts/create-preview.mjs --out ./preview-test --model ./model.glb --floor-y 0 --confirm-equipment-scene --no-source-floor
   ```

   命令中的地面标高仅是语法示例，必须使用该场景的真实值。
   `--no-source-floor` 仅在确认模型没有旧地坪时使用；否则通过 `--config` 指定要替换的原始地坪节点。
   已有完整建筑、多层或异形场景不直接套模板，先按约定确认适配工作。
4. 检查输出的 `reports/input-audit.json`，编辑对应项目 JSON：
   显式指定材质角色、要隐藏的旧地坪原始节点名、必要镜头和已知通道。
   不从参考图拷贝坐标；不猜设备类型，不把未知材质全部改成金属。
5. 在输出目录运行 `node scripts/start-server.mjs`。修改项目 JSON 不需重新构建；
   修改源码时先安装锁定依赖，再运行 `npm run build`。
6. 使用本机可用浏览器验证实际画面，按测试约定保存静止、移动、原始材质和开关对照。
   有依赖与浏览器时可运行 `npm test`、`npm run verify -- --project <id>`。
   未执行的检查列明，不用“加载成功”替代画质或性能验收。

不提供模型时可先运行：

```sh
node scripts/create-preview.mjs --out ./smoke-preview
```

它创建两个明确标注的合成测试场景，不代表用户的真实仓库。

## 必须保持的约定

- 模型位置、规格、数量及业务身份是约束。视觉增强不修改源 GLB，不为了好看增删设备。
- 项目坐标为米、Y 向上、X/Z 地面；不重复转换已标准化的 glTF。
  大地坐标、其他轴向和单位先经明确适配，不在渲染代码里猜系数。
- 已有完整材质、透明/透射/发光材料和未分配角色的材料优先保留。
  材质本色不用于抵消全局光照偏色。
- 地坪替换按 glTF 原始节点身份处理。缺失或重名歧义报错；
  不依赖加载器改写后的显示名，不通过加大 AO 或 TAA 掩盖重叠闪烁。
- 高、中、低、自定义只管理画质。建筑显隐、镜头、灯光布置及地面外观独立保留。
  从低档手动开启单项后应进入自定义并真正生效，不保留隐藏的低档禁用条件。
- 静止 TAA 为 32 次累积，任意相关状态变化都使旧结果失效。
  AO 在移动时可降采样保留；静止缓存不能跨相机、几何、配置或尺寸变化继续使用。
- 实例合批只处理已证明兼容的对象，保留实例资料与变换。
  不把“少量绘制调用”误说成“面数没有成本”。
- 固定 Three.js `0.180.0`。本包修改 ShaderChunk 并适配 GTAO/TAA 内部行为，
  升级引擎必须单独验证，不声称新版本可直接替换。

## 资料索引

- [渲染实现与参数](references/rendering.md)：材质、AO、光照、反射、TAA、画质及缓存策略。
- [场景接入约定](references/scene-contract.md)：输入、配置、材质角色、地坪和模型预检。
- [测试与验收](references/validation.md)：跨场景测试步骤、证据、性能口径和报告格式。
- [边界与故障处理](references/limits-and-troubleshooting.md)：哪些能力尚未实现，如何定位常见回归。
- [同事测试说明](references/teammate-test.md)：提供资料、启动方式和建议交回的结果。

允许根据明确输入调整参数，但先保留模板基准并记录差异。
“同等效果”指材质辨识、光影层次、稳定性和交互质量相当，不是不同场景逐像素相同。
当前未完成普通 ThinkPad、同事真实场景或 1.8 亿面项目的性能验收。

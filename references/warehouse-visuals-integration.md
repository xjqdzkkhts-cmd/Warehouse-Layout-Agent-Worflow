# 仓储写实渲染接入

用户提供的 `warehouse-threejs-visuals` v1.0.0 已完整随包保存在 [assets/warehouse-threejs-visuals](../assets/warehouse-threejs-visuals/SKILL.md)。源模块、预编译预览、PBR/HDR、测试、参考图和许可均保留；不依赖原电脑项目目录。它负责渲染，不负责识别或改变CAD布局。

## 接入顺序

1. 读 [渲染实现](../assets/warehouse-threejs-visuals/references/rendering.md) 和 [场景约定](../assets/warehouse-threejs-visuals/references/scene-contract.md)。已有项目使用“接入已有应用”模式，保留固定前端、稳定设备ID、坐标、楼层归属和已确认资产。独立viewer仅用于隔离测试。
2. 从 `../assets/warehouse-threejs-visuals/assets/viewer-template/src/` 移植所需模块；从同模板 `public/assets/pbr/` 复制纹理及HDR到项目相对路径，保留 `THIRD_PARTY.md` 和licenses。不要根据参考截图重新猜灯光或几何。
3. 按显式材质角色使用PBR，保留原色、已有纹理及透明/透射/发光材料。未知材质保留原样；不要一律金属化。地坪替换识别原节点；已有CAD楼板不能被演示地面覆盖。
4. 按预算接入HDR/PMREM、软阴影、GTAO、粗糙平面反射、32样本静止TAA、辉光及FXAA。使用quality-settings作为预设单一来源；高/中/低/自定义仅管理画质，不改变设备模型精度、仓区显隐或镜头。
5. 相机、几何、显隐、配置及画布尺寸变化使AO/TAA缓存失效；移动与静止策略分别验证。实例合批保留业务ID及完整变换；它不会消除三角面成本。

## 引擎版本与旧实现

本渲染包锁定Three.js **0.180.0**，修改ShaderChunk并依赖GTAO/TAA内部行为。项目必须使用一致的核心、addons与后期依赖。旧 `assets/runtime-template/render-quality.js` 及园区案例使用 **0.186.1**，只能在旧版本组合内维护；不能把它和新渲染模块直接拼接。新接入默认采用新包基准；旧项目需先在可恢复副本完成统一版本适配和回归，再替换运行版。不要声称仅复制文件就完成迁移。

## 验收边界

按 [测试与验收](../assets/warehouse-threejs-visuals/references/validation.md) 保存静止、移动、原始材质、效果开关和导出对照；确认实际AO目标尺寸及状态失效。输入布局、设备数量、模型精度与位置必须保持一致。

参考图只作内部视觉对照，不是设备布局真值或可自由分发的客户模型。保持源包许可与文件校验清单。源包已有测试记录不代表新项目通过；未完成的大场景、普通笔记本性能验证应明确说明。能力边界见 [故障与限制](../assets/warehouse-threejs-visuals/references/limits-and-troubleshooting.md)，不宣称已实现SSR、实时GI、LOD、园区流送或物流动画。

## 完整接入与 UI

只调整曝光、环境光或颜色不能称为完整接入。逐项登记 PBR、HDR/PMREM、阴影、GTAO、粗糙反射、32 样本静止 TAA、辉光/FXAA、预设、状态失效及截图的已接入/未接入/未验证状态。按源实现接入适用功能，受限或不适用项说明原因，不静默省略。版本不兼容先完成适配和回归，不用简单补光代替渲染包。

质量设置绑定 [UI 控件规范](frontend-template.md)。室内与园区室外分别设置材质角色和效果范围，不给室外统一铺反射地坪。实际检查远近景、移动/静止、效果开关、图片导出及性能；源包通过不代表当前项目通过。

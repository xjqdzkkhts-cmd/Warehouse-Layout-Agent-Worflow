# 原 skill 迁移对照与优先级
来源：用户提供 dxf-blender-layout 文件夹。新版 v1.4.0。当前用户指令 > 新版 HTML/网页规则 > 本次适配经验 > 原案例。原始材料完整保存在 assets/migration-source，仅作审计证据，不作为执行入口；源机器绝对路径脱敏。原有脚本保留不代表浏览器可执行。

|原文件/条款|新版位置|处理|
|SKILL：开始、范围、货物、高度确认|SKILL、confirmation-contract、cad-reading|保留，已有确认复用，只询问疑点|
|csv-confirmation 全部交付/字段/答复流程|confirmation-contract、review-html、assets模板|完整流程改写；HTML主入口，PNG辅助，不要求全清单审批|
|drawing-analysis 统计/分簇/单位/动态块/副本|drawing-analysis、cad-reading|保留；补巨型土建子几何筛选|
|warehouse-patterns 全部9节与10类陷阱|warehouse-patterns|完整经验保留；纠正极限位、双深位、尺寸不得武断套用|
|asset-matching 库扫描/缩放/代用/组合/链接/Z/映射|matching-and-validation、asset-placement|GLB缓存替代Blend链接；已有高精度资产优先|
|rack-generation 粒度/XYZ/点位/缺口/矩形/计数/护栏|parametric-layout、xyz_decompose.py|网页参数阵列替代GN；保持可编辑单元与数量守恒|
|conveyor-modeling 直坡弯螺旋/接口/失败模式|continuous-conveyors、asset-placement|数学与验收保留，网页扫掠替代GN；旧项目调位许可不沿用|
|validation 数字/视觉/交付|matching-and-validation、acceptance|世界几何和网页诊断底图替代depsgraph与blend交付|
|GN脚本、Blender插件API、版本注意|assets/migration-source（仅证据）|不作为网页依赖；功能由项目参数几何实现并单独验证|
|原配置/CSV/placements模板|assets/project-config.json、equipment-review.csv、placements-template.json|保留字段并适配网页坐标；未知项null|

## 不回退的新版规则
HTML默认突出代理不确定项；已确认部分可先生成。首层与贯通架范围、货物偏好按当前项目。红色智狼入库线、KXF输送线配料箱沿用已确认语义，但数量尺寸不跨项目默认。固定首站前端、独立GLB、高精度可用资产、连续简化墙体和网页性能规则仍生效。

# 渲染与高清出图

新项目及写实升级先遵循 [仓储渲染接入](warehouse-visuals-integration.md)，使用随包warehouse-threejs-visuals与其锁定的Three.js 0.180.0。材质、HDR、AO、反射、静止TAA和质量设置以该包实现为准；旧案例的“无外部HDR”不适用于新方案。

旧 `assets/runtime-template/render-quality.js` 提供materials、resize、render、exportPNG、dispose，配套案例Three.js 0.186.1，仅用于旧项目维护。不能混用两套ShaderChunk、核心库和后期插件；升级应统一版本并验证。

4K导出目标3840×2160：冻结更新，等待静止累积完成，临时调整输出尺寸和阴影预算，渲染编码，在finally恢复相机比例、像素比、尺寸、控制器与播放状态；不包含HTML控件。校验GPU上限，超出时明确失败；未实现分块出图，不宣称无限分辨率。

验收实际PNG尺寸、非空内容、视角与状态恢复；保存效果开关对照。CPU提交时间不是GPU帧率，静止缓存耗时不能代表漫游FPS；首次加载与连续交互性能分别测量。

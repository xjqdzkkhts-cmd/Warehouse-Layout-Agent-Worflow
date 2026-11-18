# 园区回归案例
这是本次用户授权打包的已完成园区布局案例，不是新图纸的默认方案。
`dist/` 可直接静态托管；`node tools/test-high-conveyors.mjs`、`node tools/validate.mjs`、`node tools/test-navigation.mjs` 为案例验收。
`tools/build_layout.py`、`build_navigation.py` 含该园区已确认的识图映射、坐标、数量和展示参数，仅用于复现或改编；新项目用 references/project-pipeline.md 的配置流程，不直接运行这些脚本生成新 CAD。
已包含原始高精度库、低模库及派生设备所需的相对依赖；没有原始 DXF，也没有部署身份。重新解析案例需自行提供同版 input.dxf，先运行 analyze_dxf.py 和 extract_devices.py。

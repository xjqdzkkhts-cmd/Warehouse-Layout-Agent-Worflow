# 项目初始化与阶段流水线
包内 Node ES modules 和 Three.js 可离线运行；CAD 分析用 Python 3、ezdxf、matplotlib，地面布尔和导航用 Shapely 2。依赖清单为 scripts/requirements.txt；在项目虚拟环境安装，不修改系统 Python。

1. `python3 scripts/init_project.py /目标目录 --example` 复制完整可运行案例与两套源库（低模仅作历史参考，实际模型统一使用高精度）。随后 `cd /目标目录/project && python3 -m http.server 5184 --directory dist`；无 Blender、无需 npm 安装。
2. 新项目使用 `--layout /已确认/layout.json` 替代 --example。调用前按 [用户流程](user-workflow.md) 检查生成门槛；脚本仅验证布局字段和资产引用，不能证明业务确认或参数已通过。初始化会复制 `cad-mapping/` 种子，项目映射数据库须独立维护。工具复用固定前端和新版渲染，优先选择并校验高精度 GLB；同 ID 旧资产必须由高精度源替换，派生件仅允许有高精度来源记录的资产；需要特殊派生件时先参考案例 build_assets.mjs 生成自己的变体。缺资产明确失败，不能代用猜测。
3. CAD：先按 [业务映射契约](business-mapping.md) 执行 JDL 查表；scripts/cad_mapping.py 是独立查询工具，尚未自动接入递归解析器。scripts/dxf_inventory.py 做通用统计；案例 tools/analyze_dxf.py、extract_devices.py 接收 DXF 路径，示范大块展开与设备溯源。它们的层过滤、轮廓阈值仍需按图调整。保留源哈希、嵌套路径、单位、旋转、镜像与待确认清单。
4. 三维搭建前执行 preview_review.py，生成彩色编号 HTML 及来源清单；只让用户处理未决项，无未决项直接继续。已确认部分可继续准备；有阻断项时完整生成暂停，部分预览须标明范围。
5. 配置由新图纸和确认信息产生：建筑轮廓/高度/楼层、设备映射/占地/承载高度、货位占用率、运动范围、导航区域/车体半径。案例 layout.json 为完整结构参考，不是默认配置。
6. 接地及单段连接 → 一组设备 → 整区实例化 → 运动与镜头 → 光影 → 验收 → 发布。各阶段产物保存为文件，下一阶段使用产物而不是重新识图。
7. scripts/validate_bundle.py 校验分发包；场景验收另行执行。scripts/check_scene_contract.py 仍用于通用世界几何契约；案例数量断言只用于案例。

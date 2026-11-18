# 车辆运动与镜头
runtime-template/navigation.js 使用图节点和四邻接 A*，占位预约同时保护旧格/目标格，按米每秒插值；转向按最短角差停稳旋转后前进。不是 WMS/WCS 或工程交通控制器。
scripts/build_navigation.py layout.json config.json 读取配置 building、bounds[xmin,zmin,xmax,zmax]、cellSize、bodyClearanceRadius、speed。障碍使用真实设备占地和大车扫掠范围，膨胀车体及载货半径；边连接也需可通行。起点若需挪至空节点，记录并审核偏移，不能误称实际轨迹来自 CAD。
运行时导航图目前单个建筑；跨库车队需分别建 fleet 并扩展管理器，不能把一个图套全园区。
点击 AGV 跟随当前运动位置，拖动镜头取消跟随；选择建筑进入仓库；设备聚焦同步导航选中、外墙及楼层。近景可按周围架体包围盒筛选视线。包围盒视线筛选是启发式，近景仍需实际截图核验，不能保证任意设备无遮挡。

标准六向视图使用正交相机；视图范围、方向基准与爆炸图联动见 [场景操作](scene-interaction.md)。

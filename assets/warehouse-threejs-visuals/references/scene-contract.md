# 场景接入约定

## 先确认输入

需要一个可读取的 GLB、至少一个已知尺寸、地面标高及建筑是否已包含。
优先选择与基准相近、可完整人工检查的小型仓储区域。
如果源场景特别大，先由用户确认测试子集，不直接加载整个项目后靠低画质补救。

自带模板仅支持单层矩形预览外壳和一个连续平面地坪。
生成外壳是一项展示假设，不是从 CAD 解析出的真实建筑。
已有完整建筑、多层地坪、异形轮廓或园区必须先确认适配范围；
不能未经确认同时叠加新外壳、新地坪和第二套灯光。

GLB 应自包含。外部贴图、Draco、Meshopt 压缩或 KTX2 纹理需要相应资源及加载器；
模板不会自动下载缺失内容，也没有预置这些解码器。
保留 Blender 源工程，GLB 中没有原几何节点网络的可编辑执行能力。

## 项目 JSON

```json
{
  "schemaVersion": 1,
  "id": "scene-test",
  "title": "同事测试场景",
  "units": "meter",
  "upAxis": "Y",
  "floorY": 0,
  "source": {
    "type": "glb",
    "url": "./assets/models/input.glb",
    "floorNodes": ["OriginalFloor"]
  },
  "building": {
    "margin": 1.5,
    "clearance": 2.5,
    "roofRise": 2.2,
    "frameSpacing": 6.5,
    "daylightOpenings": true
  },
  "lighting": {
    "template": "daylight",
    "spacingX": 10,
    "spacingZ": 12,
    "maxLights": 12,
    "maxShadowLights": 2,
    "shadowFocus": [0.75, 0.5]
  },
  "materialBindings": {
    "RackCoating": "powderCoat",
    "RollerMetal": "stainless",
    "BoxPaper": "cardboard",
    "ProductLabel": "preserve"
  },
  "surfaceSeed": 173,
  "traffic": [],
  "cameras": {}
}
```

名称和地面标高都只是结构示例，必须从实际输入确认。
原始源节点名可通过 `inspect-glb.mjs` 查看。隐藏前要求唯一匹配；
例如含点号的名称会被 GLTFLoader 改写，不能只查运行时显示名。

`floorNodes` 是明确允许隐藏的旧地坪节点，不是“看起来像地面”的模糊规则。
模型确实没有旧地坪时，可在创建命令中使用 `--no-source-floor`；
有旧地坪时提供配置，不能随意移动新地坪来掩盖重叠。

## 坐标及范围

全部项目参数采用米制、Y 向上，X/Z 为地面。位置数据必须已经局部化。
不盲目旋转正常 glTF；如果源单位不明，用已知尺寸验证后另做可追溯适配。
模板会拒绝非约定单位/轴向、无效范围和超出配置边界的输入。

外壳默认四周外扩 1.5 米，设备上方留 2.5 米，最低檐高 6 米，屋脊再高 2.2 米。
这些是可调展示参数。可通过 `building.bounds.min/max` 提供明确的矩形范围与檐口标高。
模型包含楼板洞口、错层或室外设施时，这种外壳不适用。

## 材质和细节

绑定键为实际材质名，不是对象名。可选角色见渲染参考。
资产材质 extras 也可提供 `materialRole`，减少每个项目重复绑定。
已有颜色、法线、粗糙度、金属度贴图及透明、透射、发光材料默认保留。
完整材质未被替换不代表失败，应对照原效果判断是否还需要适配。

未知材料保留并列入待确认清单。对于文字、屏幕、品牌标识、CAD 底图，
不要用通用金属或涂层覆盖。不要以更强灯光弥补错误的材料分类。

## 通道和相机

`traffic` 每项使用 `points: [[x,z],...]`、`width`（米）、`strength`（0 到 1）。
只登记有依据的通道；没有交通资料时保留空数组，仍会生成基础斑驳。

`cameras` 可按视图名填写 `position`、`target` 和 `fov`。
特殊工位镜头应来自新场景，不能使用参考仓库的坐标。
缺少镜头时模板只按范围给出基础视点，不保证自动避墙、避设备或完成最佳构图。

## 创建方式

模型无旧地坪且已确认是设备场景：

```sh
node scripts/create-preview.mjs --out ./preview-a --model ./warehouse.glb --floor-y 0 --confirm-equipment-scene --no-source-floor
```

模型有要替换的旧地坪：

```sh
node scripts/create-preview.mjs --out ./preview-b --model ./warehouse.glb --config ./project-config.json --confirm-equipment-scene
```

脚本拒绝覆盖已有目录。模型只复制到新输出，并比对 SHA256，不修改源文件。
输出的 `reports/input-audit.json` 不等于验证完成，应继续检查实际单位、材质和画面。

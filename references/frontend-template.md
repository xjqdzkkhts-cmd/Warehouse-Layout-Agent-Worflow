# 固定前端：第一个“三建筑”网站

本参考是园区与仓库三维预览页的默认 UI 规范；三建筑只是模板来源，不限制建筑数量。直接复用 `assets/frontend-template/`，保留视觉和操作方式。新 CAD2Scene 产品的上传、解析核对、生成进度、助手与项目管理遵循当前 PRD 和 [用户流程](user-workflow.md)，不受本案例“无标题/无提示”的限制。修复原项目时优先改场景适配器，保留原视觉语言。

基准是本机 `warehouse-web/dist/` 的第一个“三建筑”站点：提交 `74c64e5bb3d7950372dbf63c967e9cc05cb4937c`。这是已删除页头/时间轴、采用黑白配色并有环境设置的版本，不能回退到早期带顶部标题栏的版本。模板自包含源码快照，无需依赖原目录以后还存在；原文件哈希与改动范围见 `assets/frontend-template/template.json`。

## 固定内容

|位置|保留内容|
|---|---|
|中央|全屏三维 viewport，无顶部页头，无场景标签/说明文案|
|左侧 204px 栏|空间导航、楼层按钮、收发控制、设备列表|
|右侧 184px 栏|外墙/货物/网格开关，透视/俯视/正视/侧视，自动环绕，展开的环境与光照|
|底部居中|132px 紧凑播放条，暂停/播放与 0.25×—4× 倍速，无时间轴|
|右下角|放大、缩小、适应视图|
|样式|原白色半透明圆角面板、黑白灰选中态、字号间距及 1000/650px 断点，原 `style.css` 完整保留|

环境控制包含背景颜色及 5 个色板、主光颜色、水平/俯仰角、主光/环境光强度、恢复默认。加载进度条只用于首次资源加载，播放区不增加进度条。侧栏里的按钮名和设备列表保留，三维物体上不叠加标注文字。

仓库名称、数量、楼层及设备来自当前 CAD 配置，可以不同于原站三个仓库。固定的是界面与操作方式，不能把原站三个仓库、坐标、楼高和路径硬写到新项目。

## 复用与接入

复制模板中的 `index.html`、`style.css`、`ui.js`、`app.js` 到新站静态目录。模板 import map 指向独立 GLB 库自带 Three.js；如项目用打包器，仅调整依赖解析。不要复制原站 `.openai/hosting.json` 或项目 ID 到新站，不复制 `scene.json` / `scene.bin.gz` / 模型或原站业务路径。

新项目实现 `scene-adapter.js`，导出异步 `createSceneAdapter({viewport,onProgress})`，返回：

```js
{
  catalog: {
    overviewLabel: '园区总览',
    warehouses: [{ id: '2', label: '2号仓库', floors: [{ id: '1', label: '1F' }] }],
    devices: [{ id: 'lift-01', label: '提升机 01', warehouseId: '2', floorIds: ['1'], focusFloor: 'all' }]
  },
  capabilities: { logistics: false, production: false, followCargo: false },
  storageKey: 'project-specific-warehouse-lighting',
  initialState: { warehouse: 'all', floor: 'all' },
  dispatch(action, state) { /* 实现下面的场景动作 */ },
  subscribe(listener) { /* 可选：状态回写；返回解除监听函数 */ },
  dispose() { /* 释放场景、动画和资源 */ }
}
```

此接口示例不是可交付的场景实现。模板只封装前端；没有适配器时会显示加载失败，不能把空壳当仓库网站交付。业务适配器必须实际实现以下动作：

|action.type|适配器职责|
|---|---|
|initialize|应用 state 的初始显隐、相机、播放与光照，真实模型载入完成才返回|
|select-warehouse / select-floor|按归属切换显隐，更新设备可见性并适应视角；不凭世界高度猜归属|
|focus-device|定位 action.id，按实际运动后位置聚焦；UI 已关闭外墙并停止跟随/环绕|
|view / fit / zoom|四种视图、适应范围与相对缩放；zoom.factor 为 .8 或 1.25|
|visibility|按 state 的 walls/goods/grid 更新场景|
|orbit|使用 state.orbit 控制 OrbitControls 自动环绕|
|playback|使用 state.playing 和 state.speed 同步所有设备、货物和仿真时钟|
|lighting|将 state.lighting 应用到背景和灯光；沿用原站角度与默认参数|
|logistics|按 command 执行 inbound/outbound/reset/focus/production/auto/follow；实际实现后才开启 capabilities|

UI 管理按钮状态，适配器管理几何与模拟；`dispatch` 返回 promise 可报告失败。实现异步动作时保留请求时的 state 快照，避免读取后续 UI 状态。`subscribe` 用于回写任务忙碌、自动收发、货物跟随及设备拾取后的当前仓库/楼层；相机手动操作停止跟随/环绕，也应回写。状态中的 `all` 为保留值，所有实际 ID 统一字符串。

设备列表的 `floorIds` 表示显隐归属。提升机等可设 `focusFloor:'all'` 保证完整视野，但不能据此让它在所有楼层列表中出现。业务未实现时收发按钮保持原位置并禁用，不能伪造“已入库”的反馈；任务完成后应由适配器回写 `logisticsBusy` / `activeLogistics`。

参考相机参数：PerspectiveCamera 34°、OrbitControls damping .07、maxPolarAngle .49π、zoomSpeed .85、autoRotateSpeed .35。模型坐标保持 CAD→GLB 既定约定，不复制原站 Z-up 转换到已经 Y-up 的模型，避免二次翻转。阳光方向为 `[sin(az)cos(el),sin(el),cos(az)cos(el)]`，朝向模型区域中心；缺省参数由 `ui.js` 的 `LIGHT_DEFAULTS` 提供。

## 模型库与模型网页的区别

默认高精度模型库在 `assets/asset-library-high/`，含 53 个模型及功能接口；低保真模型库已删除。该目录的 `index.html` 是同一模型库的预览工具。**默认直接读包内模型，不从预览网页提取模型，也不依赖原作者的绝对路径。** 用 `scripts/materialize_library.py <项目静态目录>/library` 复制后，模板的 import map 与 SDK 均使用该目录的相对 URL；详细内容见 [包内模型库](bundled-assets.md)。

模板只借用第一个仓库网站的前端代码；当前 CAD 场景的数据和模型仍来自这套独立库。后来的 `shanghe-warehouse-web` 可作为识图与接缝修复经验，不能作为前端模板。

## 验收

用当前项目数据检查仓库切换、楼层、设备聚焦、显隐、四视图、播放倍速、光照与恢复默认。设备聚焦应同时更新左侧选中项且不被墙挡住。仓库数量变化不能造成底部新增导航条。检查手机断点及侧栏滚动；无新增顶部标题、播放时间轴或场景标签。前端模板的 UI 通过不代表场景、调度或动画已经通过，仍执行主 skill 的几何和完整流程验收。

## 新增控件与渲染设置

右侧原面板增加货物数量/占用率、清空/填满、六向正交视图、建筑分组爆炸比例及复原；当前截图入口明确支持爆炸图导出。数量显示作用空间。左侧园区→建筑→楼层由当前图纸生成。状态及验收见 [场景操作](scene-interaction.md)。

保留背景颜色与色板、主光颜色/方向/强度、环境光强度与恢复默认；接入渲染包的画质预设、AO、反射、TAA、辉光等实际支持的效果。控件必须绑定真实渲染状态，手动修改进入自定义。低画质只改变采样和效果，不更换模型。渲染升级不得替换原 UI 规范。

窄屏采用折叠侧栏/抽屉，避免遮满画布；播放条仅在实现动画时显示，未实现的物流按钮明确禁用。场景页沿用无顶部标题、无三维标签、紧凑黑白灰半透明面板；上传、核对及项目管理等业务页仍按 PRD。

爆炸图默认采用纵向分层、平滑展开/收拢动画；右侧提供展开/收拢、比例、间距和复原，具体状态及验收以 [场景操作](scene-interaction.md) 为准。

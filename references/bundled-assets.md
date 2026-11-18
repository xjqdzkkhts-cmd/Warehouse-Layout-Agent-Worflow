# 包内模型库与分发

默认库为 `assets/asset-library-high`，包含53个高精度源GLB；低保真库已删除，只分发高精度模型，不提供低模回退。普通辊筒及参数化设备按 [高精度派生](high-detail-assets.md) 生成。

智狼搭配规则见 [专用参考](zhilang-layout.md)。模型来源独立于仓库网站；不得从旧网站抽取模型冒充高精度源库。

## 目录和使用

以下路径相对 skill 根目录，移动到其他电脑仍然有效：

|路径|内容|
|---|---|
|`assets/asset-library-high/manifest.json`|53个高精度资产的ID、文件、尺寸、哈希、细节等级与统计|
|`assets/asset-library-high/models/`|高精度GLB|
|`assets/asset-library-high/specs/`|对应功能定义和来源|
|`assets/asset-library-high/runtime/`|资产加载与动画SDK|
|`assets/asset-library-high/vendor/three/`|本地Three.js与许可证|
|`assets/asset-library-high/index.html`|高精度资产预览，不是仓库场景前端|
|`assets/campus-example/tools/high-conveyors.mjs`|高精度辊筒、链式输送线派生工具|

新项目先把包内库复制到自身静态目录（下面命令假设当前目录为 skill 根目录）：

```sh
python3 scripts/materialize_library.py /path/to/project/dist/library
```

脚本只复制高精度库，拒绝 --quality low。脚本从自身位置寻找包内资产，不依赖当前工作目录；拒绝覆盖非空目标。目标已有模型库时先比对版本/哈希，根据本次授权范围合并，不能为了让脚本成功而清空用户目录。

项目从 `./library/` 加载。与固定前端配合时保留其 import map：`three` 指向 `./library/vendor/three/build/three.module.js`，`three/addons/` 指向包内 examples/jsm。用 `new AssetLibrary(new URL('./library/', import.meta.url))` 获取模型。若该代码不在静态目录根层，相对 URL 应随模块位置调整。

在复制后的 library 目录运行 HTTP 服务可独立查看模型：

```sh
python3 -m http.server 5174 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:5174/`；不要直接双击 HTML 使用 file://。资产预览、模型加载、动作接口及验证不需要网络下载 Three.js、不需要源 Blender 工程。CAD 解析仍需 Python、ezdxf/matplotlib；执行 Node 验证需 Node.js，这些系统运行环境不包含在 zip 中。

## 验证

复制脚本验证所选库GLB哈希及spec一致性；运行场景另验实际加载路径/哈希、接地、功能轴、尺寸和承载面。高精度库与低模库的节点、零件索引和端口可能不同，旧库测试的端口数或零件编号不能直接套用。派生输送线参考 [高精度派生](high-detail-assets.md)。资产自带动画不代表项目物流流程已接通。

## 安装包与范围

分发 zip 的顶层是 `cad-web-prototype/`，里面直接包含 SKILL.md、references、scripts 和 assets。解压后将整个文件夹放进目标 Codex 技能目录；不要只复制 SKILL.md 或遗漏 assets。安装位置改变不会影响包内路径。

本包不包含用户原 CAD、原始 .blend、原网站 scene.json/scene.bin.gz、部署项目 ID、账号信息或本机路径。Three.js 许可证保留在其 vendor 目录，模型来源和派生关系保留在 manifest/spec 中，不为模型编造新的开源授权。

此次打包解决了“模型需要另外找作者索取”的依赖。固定前端的 `scene-adapter.js` 仍需按 CAD 项目实现，物流任务和未知设备仍需按实际布局配置；不要因此宣称已经具备任意 CAD 一键生成完整仿真的通用引擎。


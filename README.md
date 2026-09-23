# Warehouse-skill
This is a skill which enable AI/Agent to better build a fancy warehouse in blender according to a CAD

# 仓储布局：DXF → Blender 分享包

| 文件 | 是什么 | 怎么装 |
|---|---|---|
| `dxf-blender-layout/` | Claude Code 的 skill（识图经验、流程、脚本） | 整个文件夹复制到 `~/.claude/skills/` |
| `warehouse_layout-0.3.0.zip` | Blender 插件「仓储布局工具」（Blender 4.2+，自带 ezdxf） | Blender：编辑 → 偏好设置 → 获取扩展 → ⌄ → 从磁盘安装，**不要解压** |
| `新图纸建模_SOP.md` | 拿到新图纸后的完整操作流程 | 先读这个 |
| `仓储布局工具_PRD.md` | 插件的功能说明 | 需要改插件时看 |
| `示例/编号预览_示例.png` | 识图确认阶段输出的编号预览图样例 | — |

## 你还需要自己准备

1. **Blender MCP**：Blender 里装好并启动服务，Claude 才能操作场景。
2. **设备资产库 .blend**：本包不含模型。设备放在一个 .blend 里并标记为资产，命名带类型关键词（如"…提升机""…货架""…护栏"），再在插件偏好设置里填它的路径。
3. **Python 依赖**（Claude 在 Blender 外识图时用）：`ezdxf`、`matplotlib`。没装的话 Claude 会自己在临时目录建虚拟环境。

## 开始

在 Claude Code 里说：

```
用 dxf-blender-layout skill 把 <项目>/图纸输入/xxx.dxf 转成 Blender 场景。
资产库：<路径>/设备模型库.blend；输出到 <项目>/输出/。
```

后续步骤见 `新图纸建模_SOP.md`。

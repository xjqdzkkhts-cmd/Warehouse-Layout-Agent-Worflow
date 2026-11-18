# JDL 业务字典与设备映射契约

## 来源与版本

本包 `assets/cad-mapping/cad_mapping_v0_1.sql` 是项目 `database/cad_mapping_v0_1.sql` 的分发副本，含 DDL 和初始数据：22 个业务图层、44 个中英文别名、27 类设备、51 条候选关系、21 类智狼示例分区。更新业务规则时维护项目原件，再同步分发副本并比较 SHA-256；迁移已有项目数据库使用单独版本迁移，不重复运行初始化脚本或覆盖项目确认。

四张业务截图只给出了标注、图号、图层分类和功能区。它们没有给出真实块名→具体型号→模型 ID 的完整图例。种子中的模型目录和块映射有意留空；包内高精度 GLB 虽已存在，也不得批量猜测绑定。截图中“白(1)”等按原文保存，不修造成可信颜色索引。智狼“标配/选配”仅用于该业务场景的提示，不自动补设备或阻断其他仓库。

种子 SQL 是一次性、受维护的初始化程序，不把来自 DXF 文本、模型名称、用户注释或外部文档的文字作为 SQL 执行。查询参数绑定；维护字典时输出 DDL/迁移和必要 DML，不能只交自然语言规则。

## 读取顺序

1. **图纸上下文**：选择项目 `rule_set`，保留 CAD 哈希及字典版本。业务配置允许的单位不是图纸单位证据。优先检查 `$INSUNITS` 与已知尺寸；可靠且一致则沿用，不要求用户再确认。缺失/冲突时集中问一次。国内配置 mm；海外 mm/ft/in；内部统一米，1 ft=0.3048m、1 in=0.0254m。其他明确单位需记录项目扩展，不能套默认值。
2. **实体归属及变换**：保存原始图层 `layerRaw`、嵌套路径和累计矩阵；块内 layer 0 按 DXF 继承规则求 `layerEffective`，显式非 0 图层不被父层覆盖。绑定外参前缀不得擅自去掉；图层名有空格/大小写差异时保留原文，提出别名建议，经项目确认后入字典。
3. **图层精确查表**：用 `cad_layer_alias.alias_name` 得到规范 `layer_code`，再读 `entity_role/parse_action`。未知图层进入待分类，不默认排除或按名称片段映射。图层命中统计和设备型号命中统计分别计算。
4. **按角色分流**：建筑底图可包含多个建筑模块，展开后按几何解释；不能整个变成一个设备。路径、TEXT、DIMENSION 等保留在对应数据流。设备图层里的注记也不生成设备；实体类型与图层角色冲突时记录问题，不直接丢弃。大块父子不能重复计数。
5. **型号精确查表**：匹配 `(rule_set, layer_code, block_name)` 的 confirmed 记录。`block_name` 是实际块名，或有证据恢复的动态原名；两者命中不同映射时按冲突处理，不静默优先。匿名块编号只在当前图纸证据范围有效。pending/disabled 记录不能启用，尤其不能绕过显式禁用映射去用同名候选。
6. **验证实例**：型号命中之后，检查资产、参数、坐标、朝向、楼层及物理实例去重。此时才形成 `generationStatus=ready`。查表工具只返回 `mapped_needs_validation`，绝不自动标 ready。

## 字段职责

| 表 | 职责 | 不能推导的结论 |
|---|---|---|
| cad_layer_rule / cad_layer_alias | 业务图层分类、中英文同义名 | 不能确定唯一设备或型号 |
| cad_layer_equipment_candidate | 该层允许出现的候选类型 | 不能推导数量、位置或每种都存在 |
| cad_model_catalog | 已验证的模型资产、轴向、单位、默认参数 | 不证明 CAD 图块对应它 |
| cad_block_model_mapping | 指定规则集内已确认的块与模型对应关系 | 不证明每个实例的高度、楼层等齐全 |
| cad_zone_dictionary | 业务用途名称及适用场景 | 不提供 CAD 空间边界 |

`model_id` 可以使用已核对的 manifest ID，但要显式登记，不能假定 `type_009=beam-rack`。同类型的多款设备须依据真实型号或确认区分。缺模型是 `needs_asset`，认不出类型是 `needs_mapping`，缺高度是 `needs_parameters`；不要统称识别失败。

## 参数与几何门槛

`parameter_binding_json` 记录属性来源→目标参数、源单位、换算及依据；`default_parameters_json` 只存资产已验证的型号固有值。两者当前是存储字段，查表脚本不解释或执行表达式；参数解析器使用白名单字段和数值变换，禁止 eval。

每种型号维护其必填参数及范围。全局单位、原点、楼层标高、块到模型锚点/旋转修正须有依据；货架的储位层数/总高、输送承载面等按设备需求检查。视觉默认值不得偷偷填入业务参数；经批准的展示近似记录 `assumptions` 和作用域。

保留完整 `T(insert)·R·S·T(-blockBase)` 与父级矩阵；SQL 的旋转修正不替代嵌套/镜像/OCS 处理。几何中心仅用于审阅，不是设备定位锚点。图中同物多位置按已确认 physicalId 合并，记录所有源实体。

## 项目确认的复用

确认记录至少绑定：projectId、ruleSet、源 CAD/图块定义指纹、稳定实体 ID 或规则作用域、答案、依据、时间。按编号、区域和同构块分组复用；同层同名但属性或结构不同，不自动共享参数确认。

图纸更新先做差异比较：没变的图块定义、属性及适用范围可沿用；变更项重新校验。字典/资产更新只重新检查引用它的实例。旧记录保留供追溯，不能因为切会话全部失效，也不能同名就跨项目继承。

当前 SQL 只能表达规则集内的精确块映射，不能表达任意属性谓词、租户权限、审批版本或完整场景历史。多型号同名时先形成待确认记录，必要时扩展有版本的判别表，不能往 SQL 中塞通配规则或复制重复唯一键。

## 可执行查表

在 skill 根目录执行（只需 Python 标准库）：

```sh
python3 scripts/cad_mapping.py validate
python3 scripts/cad_mapping.py lookup --layer 'JDL-机区-存拣区'
python3 scripts/cad_mapping.py lookup --layer 'JDL-AUTO-AGV-PATH'
python3 scripts/cad_mapping.py lookup --db project-mapping.sqlite --rule-set project-a --layer 'JDL-AUTO-CHARGER' --block charger-block
python3 scripts/cad_mapping.py lookup --db project-mapping.sqlite --rule-set project-a --layer 'JDL-AUTO-PICK' --block '*U123' --original-block rack-block
```

默认在内存中加载包内种子；`--db` 只读打开已建立的项目 SQLite 数据库，不创建/修改它。正常的未命中也返回结构化 JSON，不是进程异常。缺规则集返回 `needs_rule_set`；路径/注记/建筑返回对应解析动作；未决项保留 `modelId:null`。脚本不展开 DXF、不校验真实资产文件、不转换参数，也不自动对接 `dxf_inventory.py` 的输出。集成时应由 DXF 解析器提供生效图层、已溯源块名，然后把结果合并到实例数据。

验证项目数据库可用 `validate --db project-mapping.sqlite`。DDL 导入错误、外键错误、confirmed 映射缺依据、JSON 无效、轴向共线等属于配置错误，非“用户图纸无法识别”。

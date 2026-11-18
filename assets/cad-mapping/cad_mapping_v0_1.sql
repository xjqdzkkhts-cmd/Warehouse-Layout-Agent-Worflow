-- CAD2Scene 业务 CAD 解析与映射字典 v0.1
-- 编写日期：2026-11-17。使用业务 JDL 命名，不采用 PRD 示例 EQ_ 命名。
-- 方言：SQLite 3 / PostgreSQL 通用基础 SQL；主键由应用提供，不依赖自增。
-- 在空数据库/独立 schema 中执行；这是一次性建表及种子脚本，不是重复执行的迁移。
-- 来源：本目录四张业务规范截图。截图中的国标/ISO 表述仅作业务原文记录，未经标准核验。
-- 当前没有 DXF、真实块名图例或模型清单；因此不初始化块→模型映射，不臆造模型 ID。
-- 解析顺序：确定文件单位 → 展开块并计算累计变换 → 按图层别名查业务语义
-- → 按真实块名查已确认模型映射 → 校验参数 → 生成设备实例。
-- 图层只限定候选设备类型，不等于一个具体模型。候选不得直接生成设备实例。
-- 块名未命中、多候选、必填参数缺失：进入人工确认；不可任取首条候选。
-- 中英文图层名精确匹配；保留原名，不做模糊自动绑定。父块/子实体图层归属需解析器处理。
-- CAD 颜色、线宽、字体不作为设备识别主键；业务表注明颜色可调。
-- 业务表的“白(1)”按原文保留，不推断成可靠的 CAD 颜色索引。

BEGIN;

CREATE TABLE cad_rule_source (
    source_id VARCHAR(40) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    section_name VARCHAR(100) NOT NULL,
    evidence_note TEXT NOT NULL
);

CREATE TABLE cad_drawing_profile (
    profile_id VARCHAR(40) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    naming_note TEXT NOT NULL,
    elevation_note TEXT NOT NULL,
    source_id VARCHAR(40) NOT NULL REFERENCES cad_rule_source(source_id)
);
-- 输入单位必须显式确认；同一图纸禁止按对象猜测单位。规范没有给定单位时不默认 mm。
CREATE TABLE cad_profile_unit (
    profile_id VARCHAR(40) NOT NULL REFERENCES cad_drawing_profile(profile_id),
    unit_code VARCHAR(10) NOT NULL CHECK (unit_code IN ('mm','ft','in')),
    millimeters_per_unit DECIMAL(16,6) NOT NULL CHECK (millimeters_per_unit > 0),
    PRIMARY KEY (profile_id, unit_code)
);

CREATE TABLE cad_layer_rule (
    layer_code VARCHAR(80) PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    business_name VARCHAR(100) NOT NULL,
    entity_role VARCHAR(30) NOT NULL CHECK (entity_role IN
        ('building_reference','equipment_group','path','annotation')),
    parse_action VARCHAR(40) NOT NULL CHECK (parse_action IN
        ('parse_reference','resolve_blocks','extract_path','extract_text','extract_dimensions')),
    equipment_scope TEXT NOT NULL,
    source_color_text VARCHAR(40),
    source_line_type VARCHAR(40),
    source_line_width_mm DECIMAL(6,3),
    source_id VARCHAR(40) NOT NULL REFERENCES cad_rule_source(source_id)
);
CREATE TABLE cad_layer_alias (
    alias_name VARCHAR(120) PRIMARY KEY,
    layer_code VARCHAR(80) NOT NULL REFERENCES cad_layer_rule(layer_code),
    language_code VARCHAR(10) NOT NULL CHECK (language_code IN ('zh','en'))
);

-- 以下类型 ID 是本系统分类键，不是业务型号或模型 ID。
CREATE TABLE cad_equipment_type (
    equipment_type_id VARCHAR(80) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE cad_layer_equipment_candidate (
    layer_code VARCHAR(80) NOT NULL REFERENCES cad_layer_rule(layer_code),
    equipment_type_id VARCHAR(80) NOT NULL REFERENCES cad_equipment_type(equipment_type_id),
    evidence_note TEXT NOT NULL,
    PRIMARY KEY (layer_code, equipment_type_id)
);

-- 待真实资产到位后填充：尺寸、原点、朝向和参数必须依据资产实际数据登记。
CREATE TABLE cad_model_catalog (
    model_id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(160) NOT NULL,
    equipment_type_id VARCHAR(80) NOT NULL REFERENCES cad_equipment_type(equipment_type_id),
    asset_uri TEXT NOT NULL,
    asset_unit VARCHAR(10) NOT NULL CHECK (asset_unit IN ('mm','cm','m')),
    local_origin_note TEXT NOT NULL,
    forward_axis VARCHAR(4) NOT NULL CHECK (forward_axis IN ('+X','-X','+Y','-Y','+Z','-Z')),
    up_axis VARCHAR(4) NOT NULL CHECK (up_axis IN ('+X','-X','+Y','-Y','+Z','-Z')),
    default_parameters_json TEXT NOT NULL DEFAULT '{}'
);
-- JSON 用 TEXT 保持跨数据库兼容；格式和参数语义由应用校验。
-- 每个规则集中的同一图层别名归一化结果+块名只允许一条映射。
-- 若相同块名存在多个型号，应拆分规则集或增加属性判别规则后再启用，不能强行一对一。
CREATE TABLE cad_block_model_mapping (
    mapping_id VARCHAR(100) PRIMARY KEY,
    rule_set VARCHAR(100) NOT NULL,
    layer_code VARCHAR(80) NOT NULL REFERENCES cad_layer_rule(layer_code),
    block_name VARCHAR(255) NOT NULL,
    model_id VARCHAR(100) REFERENCES cad_model_catalog(model_id),
    mapping_status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (mapping_status IN ('pending','confirmed','disabled')),
    cad_anchor_note TEXT,
    rotation_offset_degrees DECIMAL(12,6),
    parameter_binding_json TEXT NOT NULL DEFAULT '{}',
    evidence_reference TEXT NOT NULL,
    confirmed_by VARCHAR(100),
    confirmed_at VARCHAR(40),
    UNIQUE (rule_set, layer_code, block_name),
    CHECK (mapping_status <> 'confirmed' OR
        (model_id IS NOT NULL AND cad_anchor_note IS NOT NULL AND
         rotation_offset_degrees IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE INDEX cad_block_mapping_lookup ON cad_block_model_mapping(rule_set, layer_code, block_name, mapping_status);

-- 功能分区表为“智狼示例”知识，不作为所有仓库强制要求；没有提供空间边界表达规则。
CREATE TABLE cad_zone_dictionary (
    zone_code VARCHAR(60) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    configuration_class VARCHAR(20) NOT NULL CHECK (configuration_class IN ('standard','optional')),
    applicability VARCHAR(100) NOT NULL,
    source_id VARCHAR(40) NOT NULL REFERENCES cad_rule_source(source_id)
);

INSERT INTO cad_rule_source VALUES ('annotation', 'Snipaste_2026-11-17_10-37-20.png', '3.1 标注规范', '国内外语言、单位及标高约定');
INSERT INTO cad_rule_source VALUES ('drawing', 'Snipaste_2026-11-17_10-37-29.png', '3.2 图号编码', '图纸专业编码；不是设备块名图例');
INSERT INTO cad_rule_source VALUES ('layers', 'Snipaste_2026-11-17_10-38-49.png', '图层编码及设备范围', '图层可包含多类设备；没有实际块名与型号绑定');
INSERT INTO cad_rule_source VALUES ('zones', 'Snipaste_2026-11-17_10-39-24.png', '5.3 功能分区标准', '智狼示例；不提供分区边界或块名');

INSERT INTO cad_drawing_profile VALUES ('domestic', '国内版', '中文为主+英文编码', '相对标高（±0.00）', 'annotation');
INSERT INTO cad_drawing_profile VALUES ('overseas', '海外版', '纯英文', '可含绝对标高', 'annotation');

INSERT INTO cad_profile_unit VALUES ('domestic', 'mm', 1);
INSERT INTO cad_profile_unit VALUES ('overseas', 'mm', 1);
INSERT INTO cad_profile_unit VALUES ('overseas', 'ft', 304.8);
INSERT INTO cad_profile_unit VALUES ('overseas', 'in', 25.4);

INSERT INTO cad_equipment_type VALUES ('type_001', '输送线体');
INSERT INTO cad_equipment_type VALUES ('type_002', '识别设备');
INSERT INTO cad_equipment_type VALUES ('type_003', '称重设备');
INSERT INTO cad_equipment_type VALUES ('type_004', '支腿');
INSERT INTO cad_equipment_type VALUES ('type_005', '检修平台');
INSERT INTO cad_equipment_type VALUES ('type_006', '人工操作台');
INSERT INTO cad_equipment_type VALUES ('type_007', '实箱线');
INSERT INTO cad_equipment_type VALUES ('type_008', '空箱线');
INSERT INTO cad_equipment_type VALUES ('type_009', '货架');
INSERT INTO cad_equipment_type VALUES ('type_010', '货物单元');
INSERT INTO cad_equipment_type VALUES ('type_011', 'AGV');
INSERT INTO cad_equipment_type VALUES ('type_012', '检修位');
INSERT INTO cad_equipment_type VALUES ('type_013', '四向车');
INSERT INTO cad_equipment_type VALUES ('type_014', '提升机');
INSERT INTO cad_equipment_type VALUES ('type_015', '拣选/理货/盘点拣选站');
INSERT INTO cad_equipment_type VALUES ('type_016', 'rebinwall');
INSERT INTO cad_equipment_type VALUES ('type_017', '充电桩');
INSERT INTO cad_equipment_type VALUES ('type_018', '安全围栏');
INSERT INTO cad_equipment_type VALUES ('type_019', '安全门');
INSERT INTO cad_equipment_type VALUES ('type_020', '打包台');
INSERT INTO cad_equipment_type VALUES ('type_021', '操作台');
INSERT INTO cad_equipment_type VALUES ('type_022', '封贴一体机');
INSERT INTO cad_equipment_type VALUES ('type_023', '自动包装机');
INSERT INTO cad_equipment_type VALUES ('type_024', '输送衔接设备');
INSERT INTO cad_equipment_type VALUES ('type_025', '立柱');
INSERT INTO cad_equipment_type VALUES ('type_026', '投篮口');
INSERT INTO cad_equipment_type VALUES ('type_027', '围栏');

INSERT INTO cad_layer_rule VALUES ('JDL-WH-BASE', '仓库建筑/电气/消防', '仓库-底图', 'building_reference', 'parse_reference', '各模块建成块并归入底图图层；建筑、电气、消防模块', '灰(8)', '实线', 0.13, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-仓库-底图', 'JDL-WH-BASE', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-WH-BASE', 'JDL-WH-BASE', 'en');

INSERT INTO cad_layer_rule VALUES ('JDL-CONV-IN-FULL', '自动化设备/输送', '输送-入库实箱线', 'equipment_group', 'resolve_blocks', '各类输送线体、识别设备、称重设备、支腿、检修平台', '蓝(5)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-输送-入库实箱线', 'JDL-CONV-IN-FULL', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-CONV-IN-FULL', 'JDL-CONV-IN-FULL', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-FULL', 'type_001', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-FULL', 'type_002', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-FULL', 'type_003', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-FULL', 'type_004', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-FULL', 'type_005', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-CONV-IN-EMPTY', '自动化设备/输送', '输送-入库空箱线', 'equipment_group', 'resolve_blocks', '各类输送线体、识别设备、称重设备、支腿、检修平台', '洋红(6)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-输送-入库空箱线', 'JDL-CONV-IN-EMPTY', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-CONV-IN-EMPTY', 'JDL-CONV-IN-EMPTY', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-EMPTY', 'type_001', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-EMPTY', 'type_002', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-EMPTY', 'type_003', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-EMPTY', 'type_004', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-IN-EMPTY', 'type_005', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-CONV-OUT-FULL', '自动化设备/输送', '输送-出库实箱线', 'equipment_group', 'resolve_blocks', '各类输送线体、识别设备、称重设备、支腿、检修平台', '绿(3)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-输送-出库实箱线', 'JDL-CONV-OUT-FULL', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-CONV-OUT-FULL', 'JDL-CONV-OUT-FULL', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-FULL', 'type_001', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-FULL', 'type_002', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-FULL', 'type_003', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-FULL', 'type_004', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-FULL', 'type_005', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-CONV-OUT-EMPTY', '自动化设备/输送', '输送-出库空箱线', 'equipment_group', 'resolve_blocks', '各类输送线体、识别设备、称重设备、支腿、检修平台', '洋红(6)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-输送-出库空箱线', 'JDL-CONV-OUT-EMPTY', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-CONV-OUT-EMPTY', 'JDL-CONV-OUT-EMPTY', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-EMPTY', 'type_001', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-EMPTY', 'type_002', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-EMPTY', 'type_003', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-EMPTY', 'type_004', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-OUT-EMPTY', 'type_005', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-CONV-PARCEL', '自动化设备/输送', '输送-包裹线', 'equipment_group', 'resolve_blocks', '各类输送线体、识别设备、称重设备、支腿、检修平台', '黄(2)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-输送-包裹线', 'JDL-CONV-PARCEL', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-CONV-PARCEL', 'JDL-CONV-PARCEL', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-PARCEL', 'type_001', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-PARCEL', 'type_002', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-PARCEL', 'type_003', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-PARCEL', 'type_004', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-CONV-PARCEL', 'type_005', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-AUTO-IN-WS', '自动化设备/存拣', '机区-入库工作站', 'equipment_group', 'resolve_blocks', '人工操作台、实箱线、空箱线', '白(1)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-机区-入库工作站', 'JDL-AUTO-IN-WS', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-AUTO-IN-WS', 'JDL-AUTO-IN-WS', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-IN-WS', 'type_006', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-IN-WS', 'type_007', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-IN-WS', 'type_008', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-AUTO-PICK', '自动化设备/存拣', '机区-存拣区', 'equipment_group', 'resolve_blocks', '智狼：货架、货物单元、AGV、检修位；天狼：货架、货物单元、AGV、四向车、提升机；原表含省略项', '白(1)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-机区-存拣区', 'JDL-AUTO-PICK', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-AUTO-PICK', 'JDL-AUTO-PICK', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-PICK', 'type_009', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-PICK', 'type_010', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-PICK', 'type_011', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-PICK', 'type_012', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-PICK', 'type_013', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-PICK', 'type_014', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-AUTO-OUT-WS', '自动化设备/存拣', '机区-出库工作站', 'equipment_group', 'resolve_blocks', '拣选/理货/盘点拣选站、rebinwall', '白(1)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-机区-出库工作站', 'JDL-AUTO-OUT-WS', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-AUTO-OUT-WS', 'JDL-AUTO-OUT-WS', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-OUT-WS', 'type_015', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-OUT-WS', 'type_016', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-AUTO-CHARGER', '自动化设备/存拣', '机区-充电桩', 'equipment_group', 'resolve_blocks', '充电桩', '白(1)', '实线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-机区-充电桩', 'JDL-AUTO-CHARGER', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-AUTO-CHARGER', 'JDL-AUTO-CHARGER', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-CHARGER', 'type_017', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-AUTO-AGV-PATH', '自动化设备/存拣', '机区-小车路径', 'path', 'extract_path', '线路通道；不是 AGV 设备实例', '青(4)', '实线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-机区-小车路径', 'JDL-AUTO-AGV-PATH', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-AUTO-AGV-PATH', 'JDL-AUTO-AGV-PATH', 'en');

INSERT INTO cad_layer_rule VALUES ('JDL-AUTO-FENCE', '自动化设备/存拣', '机区-围栏', 'equipment_group', 'resolve_blocks', '安全围栏、安全门', '绿(3)', '实线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-机区-围栏', 'JDL-AUTO-FENCE', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-AUTO-FENCE', 'JDL-AUTO-FENCE', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-FENCE', 'type_018', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-AUTO-FENCE', 'type_019', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-PACK-MANUAL', '自动化设备/包装', '自动化-出库-人工包装', 'equipment_group', 'resolve_blocks', '打包台、rebinwall', '白(1)', '实线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-自动化-出库-人工包装', 'JDL-PACK-MANUAL', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-PACK-MANUAL', 'JDL-PACK-MANUAL', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-MANUAL', 'type_020', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-MANUAL', 'type_016', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-PACK-SEAL', '自动化设备/包装', '自动化-出库-封贴一体', 'equipment_group', 'resolve_blocks', '操作台、封贴一体机', '白(1)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-自动化-出库-封贴一体', 'JDL-PACK-SEAL', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-PACK-SEAL', 'JDL-PACK-SEAL', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-SEAL', 'type_021', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-SEAL', 'type_022', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-PACK-AUTO', '自动化设备/包装', '自动化-出库-自动包装', 'equipment_group', 'resolve_blocks', '操作台、自动包装机及输送衔接设备', '白(1)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-自动化-出库-自动包装', 'JDL-PACK-AUTO', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-PACK-AUTO', 'JDL-PACK-AUTO', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-AUTO', 'type_021', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-AUTO', 'type_023', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-PACK-AUTO', 'type_024', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-STEEL-PLAT', '自动化设备/钢平台', '自动化-钢平台', 'equipment_group', 'resolve_blocks', '立柱、投篮口、围栏', '灰(8)', '实线', 0.35, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-自动化-钢平台', 'JDL-STEEL-PLAT', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-STEEL-PLAT', 'JDL-STEEL-PLAT', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-STEEL-PLAT', 'type_025', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-STEEL-PLAT', 'type_026', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-STEEL-PLAT', 'type_027', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-MANUAL-STORE', '非自动化设备/存拣', '人工-存拣', 'equipment_group', 'resolve_blocks', '货架、货物单元', '白(1)', '实线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-人工-存拣', 'JDL-MANUAL-STORE', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-MANUAL-STORE', 'JDL-MANUAL-STORE', 'en');

INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-MANUAL-STORE', 'type_009', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');
INSERT INTO cad_layer_equipment_candidate VALUES ('JDL-MANUAL-STORE', 'type_010', '来源图层表设备栏；仅作候选，不能据此确定型号或数量');

INSERT INTO cad_layer_rule VALUES ('JDL-TEXT', '功能区/文字标注', '文字标注', 'annotation', 'extract_text', '功能区名称、面积、流量、设备数量、规划能力', '白(1)', '实线', 0.18, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-文字标注', 'JDL-TEXT', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-TEXT', 'JDL-TEXT', 'en');

INSERT INTO cad_layer_rule VALUES ('JDL-DIM', '功能区/尺寸标注', '尺寸标注', 'annotation', 'extract_dimensions', '拣选主/辅通道、区域长宽、单元化长宽', '白(1)', '实线', 0.18, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-尺寸标注', 'JDL-DIM', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-DIM', 'JDL-DIM', 'en');

INSERT INTO cad_layer_rule VALUES ('JDL-FLOW-MATERIAL', '动线/物流动线', '动线-物流动线', 'path', 'extract_path', '入库/出库/拣选动线箭头；不直接等于输送机几何', '黄(2)', '虚线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-动线-物流动线', 'JDL-FLOW-MATERIAL', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-FLOW-MATERIAL', 'JDL-FLOW-MATERIAL', 'en');

INSERT INTO cad_layer_rule VALUES ('JDL-FLOW-STAFF', '动线/员工通道', '动线-员工通道', 'path', 'extract_path', '员工通行路径', '蓝(5)', '虚线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-动线-员工通道', 'JDL-FLOW-STAFF', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-FLOW-STAFF', 'JDL-FLOW-STAFF', 'en');

INSERT INTO cad_layer_rule VALUES ('JDL-FLOW-VISIT', '动线/参观通道', '动线-参观通道', 'path', 'extract_path', '参观通行路径', '绿(3)', '点划线', 0.25, 'layers');

INSERT INTO cad_layer_alias VALUES ('JDL-动线-参观通道', 'JDL-FLOW-VISIT', 'zh');
INSERT INTO cad_layer_alias VALUES ('JDL-FLOW-VISIT', 'JDL-FLOW-VISIT', 'en');

INSERT INTO cad_zone_dictionary VALUES ('receiving', '收货区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('putaway', '上架区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('storage', '存储区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('outbound', '出库区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('sorting', '理货区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('charging', '充电区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('production', '生产区', 'optional', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('merge', '合流区', 'optional', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('exception', '异常处理区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('large_vehicle_maintenance', '大车维修区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('small_vehicle_maintenance', '小车维修区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('spare_parts', '备品备件区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('empty_container', '空箱暂存区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('office', '现场办公区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('rest_training', '员工休息/培训区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('visitor', '参观通道', 'optional', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('consumables', '耗材暂存', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('return_transfer', '退供/内配区', 'optional', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('dispatch_buffer', '发货暂存区', 'standard', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('irregular_manual', '异形品区/人区', 'optional', '智狼仓示例；须按项目确认', 'zones');
INSERT INTO cad_zone_dictionary VALUES ('other', '其他功能区', 'optional', '智狼仓示例；须按项目确认', 'zones');

-- 只有确认后的映射可供生成器使用；查询前必须已选择 rule_set。
CREATE VIEW cad_confirmed_block_mapping AS
SELECT b.mapping_id, b.rule_set, b.layer_code, b.block_name, b.model_id,
       b.cad_anchor_note, b.rotation_offset_degrees, b.parameter_binding_json,
       m.asset_uri, m.asset_unit, m.local_origin_note, m.forward_axis, m.up_axis,
       m.default_parameters_json
FROM cad_block_model_mapping b
JOIN cad_model_catalog m ON m.model_id = b.model_id
WHERE b.mapping_status = 'confirmed';

COMMIT;

-- 使用示例（参数绑定由应用执行，勿拼接用户输入）：
-- SELECT r.* FROM cad_layer_alias a JOIN cad_layer_rule r ON r.layer_code=a.layer_code
-- WHERE a.alias_name = :original_layer_name;
-- SELECT * FROM cad_confirmed_block_mapping
-- WHERE rule_set=:rule_set AND layer_code=:layer_code AND block_name=:block_name;
-- 若未命中，保留原始 CAD 实体信息并提示确认，禁止自动绑定到层级候选模型。

"""Behavior regressions for evidence-gated lookup; fixtures are not business mappings."""
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cad_mapping import connect, lookup, validate


class MappingTests(unittest.TestCase):
    def setUp(self):
        self.db = connect()
        self.addCleanup(self.db.close)

    def model(self, model_id='fixture-charger', type_id='type_017'):
        self.db.execute('INSERT INTO cad_model_catalog VALUES (?,?,?,?,?,?,?,?,?)',
                        (model_id, '测试资产', type_id, 'fixture.glb', 'm', '底面原点', '+X', '+Y', '{}'))

    def mapping(self, block='fixture-block', model='fixture-charger', scope='project-a', status='confirmed'):
        self.db.execute('INSERT INTO cad_block_model_mapping VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                        (scope + block, scope, 'JDL-AUTO-CHARGER', block, model, status,
                         '底面定位点', 0, '{}', 'test fixture', 'fixture-user', '2026-11-17'))

    def test_seed_is_classification_not_model_binding(self):
        report = validate(self.db)
        self.assertEqual(report['counts']['cad_block_model_mapping'], 0)
        self.assertEqual(report['counts']['cad_model_catalog'], 0)

    def test_bilingual_aliases_preserve_semantics(self):
        zh = lookup(self.db, 'JDL-机区-存拣区')
        en = lookup(self.db, 'JDL-AUTO-PICK')
        self.assertEqual(zh['layerCode'], en['layerCode'])
        self.assertEqual(zh['candidateTypes'], en['candidateTypes'])
        self.assertGreater(len(zh['candidateTypes']), 1)
        self.assertIsNone(zh['modelId'])

    def test_unknown_alias_is_not_fuzzily_bound(self):
        for name in ('jdl-auto-pick', ' JDL-AUTO-PICK', 'EQ_SHELF_PALLET'):
            self.assertEqual(lookup(self.db, name)['status'], 'needs_layer_classification')

    def test_non_equipment_routing(self):
        for layer, action in [('JDL-AUTO-AGV-PATH', 'extract_path'),
                              ('JDL-FLOW-MATERIAL', 'extract_path'), ('JDL-TEXT', 'extract_text'),
                              ('JDL-DIM', 'extract_dimensions'), ('JDL-WH-BASE', 'parse_reference')]:
            result = lookup(self.db, layer, 'fixture-block', rule_set='project-a')
            self.assertEqual(result['parseAction'], action)
            self.assertEqual(result['status'], 'not_equipment')
            self.assertIsNone(result['modelId'])

    def test_confirmation_is_scoped_and_not_generation_approval(self):
        self.model(); self.mapping()
        self.assertEqual(lookup(self.db, 'JDL-AUTO-CHARGER', 'fixture-block')['status'], 'needs_rule_set')
        self.assertEqual(lookup(self.db, 'JDL-AUTO-CHARGER', 'fixture-block', rule_set='project-b')['status'], 'needs_mapping')
        result = lookup(self.db, 'JDL-机区-充电桩', 'fixture-block', rule_set='project-a')
        self.assertEqual(result['status'], 'mapped_needs_validation')
        self.assertFalse(result['generationApproved'])

    def test_pending_and_disabled_are_not_used(self):
        self.model()
        for status in ('pending', 'disabled'):
            self.mapping(block=status, status=status)
            result = lookup(self.db, 'JDL-AUTO-CHARGER', status, rule_set='project-a')
            self.assertEqual(result['status'], 'mapping_' + status)
            self.assertIsNone(result['modelId'])

    def test_dynamic_name_conflicts_do_not_choose_first(self):
        self.model(); self.mapping(); self.mapping(block='*U1', status='disabled')
        result = lookup(self.db, 'JDL-AUTO-CHARGER', '*U1', 'fixture-block', 'project-a')
        self.assertEqual(result['status'], 'mapping_conflict')
        self.assertIsNone(result['modelId'])

    def test_verified_dynamic_name_can_resolve(self):
        self.model(); self.mapping()
        self.assertEqual(lookup(self.db, 'JDL-AUTO-CHARGER', '*U1', 'fixture-block', 'project-a')['status'], 'mapped_needs_validation')

    def test_type_mismatch_is_a_conflict(self):
        self.model(type_id='type_009'); self.mapping()
        self.assertEqual(lookup(self.db, 'JDL-AUTO-CHARGER', 'fixture-block', rule_set='project-a')['status'], 'type_conflict')

    def test_invalid_axis_and_json_are_rejected(self):
        self.model()
        self.db.execute("UPDATE cad_model_catalog SET up_axis='-X'")
        with self.assertRaises(ValueError): validate(self.db)
        self.db.execute("UPDATE cad_model_catalog SET up_axis='+Y', default_parameters_json='[]'")
        with self.assertRaises(ValueError): validate(self.db)

    def test_empty_confirmation_evidence_is_rejected(self):
        self.model(); self.mapping()
        self.db.execute("UPDATE cad_block_model_mapping SET evidence_reference=' '")
        with self.assertRaises(ValueError): validate(self.db)

    def test_existing_db_is_read_only(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'project.sqlite'
            writer = sqlite3.connect(path); self.db.backup(writer); writer.close()
            reader = connect(path)
            try:
                validate(reader)
                with self.assertRaises(sqlite3.OperationalError):
                    reader.execute('DELETE FROM cad_layer_alias')
            finally:
                reader.close()


if __name__ == '__main__':
    unittest.main()

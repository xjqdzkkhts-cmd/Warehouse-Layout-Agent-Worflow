"""Read-only JDL lookup. A confirmed model mapping is NOT generation approval."""
import argparse
import json
import math
import sqlite3
from pathlib import Path

SEED = Path(__file__).resolve().parents[1] / 'assets/cad-mapping/cad_mapping_v0_1.sql'


def connect(db=None, seed=SEED):
    if db is not None:
        path = Path(db).expanduser().resolve(strict=True)
        connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    else:
        connection = sqlite3.connect(':memory:')
        connection.execute('PRAGMA foreign_keys=ON')
        connection.executescript(Path(seed).read_text(encoding='utf-8'))
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    return connection


def _object_json(raw):
    def invalid_constant(value):
        raise ValueError('non-finite JSON constant: ' + value)
    value = json.loads(raw, parse_constant=invalid_constant)
    if not isinstance(value, dict):
        raise ValueError('JSON parameter fields must be objects')
    return value


def validate(connection):
    errors = connection.execute('PRAGMA foreign_key_check').fetchall()
    if errors:
        raise ValueError('foreign key violations: ' + str([tuple(r) for r in errors]))
    integrity = [r[0] for r in connection.execute('PRAGMA integrity_check')]
    if integrity != ['ok']:
        raise ValueError('database integrity: ' + str(integrity))
    counts = {}
    for table in ('cad_layer_rule', 'cad_layer_alias', 'cad_equipment_type',
                  'cad_layer_equipment_candidate', 'cad_zone_dictionary',
                  'cad_model_catalog', 'cad_block_model_mapping'):
        counts[table] = connection.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
    for row in connection.execute('SELECT * FROM cad_model_catalog'):
        _object_json(row['default_parameters_json'])
        axes = ('+X', '-X', '+Y', '-Y', '+Z', '-Z')
        if row['forward_axis'] not in axes or row['up_axis'] not in axes or row['forward_axis'][-1] == row['up_axis'][-1]:
            raise ValueError('model axes invalid or collinear: ' + row['model_id'])
        if any(not str(row[k] or '').strip() for k in ('asset_uri', 'local_origin_note')):
            raise ValueError('model metadata missing: ' + row['model_id'])
    for row in connection.execute('SELECT * FROM cad_block_model_mapping'):
        _object_json(row['parameter_binding_json'])
        if row['mapping_status'] == 'confirmed':
            required = ('rule_set', 'block_name', 'model_id', 'cad_anchor_note',
                        'evidence_reference', 'confirmed_by', 'confirmed_at')
            if any(not str(row[k] or '').strip() for k in required):
                raise ValueError('confirmed mapping lacks evidence: ' + row['mapping_id'])
            angle = row['rotation_offset_degrees']
            if angle is None or not math.isfinite(float(angle)):
                raise ValueError('invalid rotation: ' + row['mapping_id'])
    return {'status': 'valid', 'counts': counts}


def lookup(connection, layer, block=None, original_block=None, rule_set=None):
    result = {'layerRaw': layer, 'layerCode': None, 'role': None, 'parseAction': None,
              'status': 'needs_layer_classification', 'modelId': None,
              'candidateTypes': [], 'generationApproved': False}
    row = connection.execute('''SELECT r.* FROM cad_layer_alias a
        JOIN cad_layer_rule r ON r.layer_code=a.layer_code WHERE a.alias_name=?''', (layer,)).fetchone()
    if row is None:
        return result
    result.update(layerCode=row['layer_code'], role=row['entity_role'], parseAction=row['parse_action'])
    if row['entity_role'] != 'equipment_group':
        result['status'] = 'not_equipment'
        return result
    result['candidateTypes'] = [dict(r) for r in connection.execute('''
        SELECT t.equipment_type_id AS typeId, t.display_name AS name
        FROM cad_layer_equipment_candidate c JOIN cad_equipment_type t
        ON c.equipment_type_id=t.equipment_type_id WHERE c.layer_code=?
        ORDER BY t.equipment_type_id''', (row['layer_code'],))]
    result['status'] = 'needs_mapping'
    if not block:
        return result
    if not rule_set or not rule_set.strip():
        result['status'] = 'needs_rule_set'
        return result
    names = list(dict.fromkeys(n for n in (block, original_block) if n))
    matches = []
    for name in names:
        match = connection.execute('''SELECT * FROM cad_block_model_mapping
            WHERE rule_set=? AND layer_code=? AND block_name=?''',
            (rule_set, row['layer_code'], name)).fetchone()
        if match:
            matches.append(dict(match))
    if not matches:
        return result
    result['matchedMappingIds'] = [r['mapping_id'] for r in matches]
    # Exact evaluated/original names pointing at different rules require review,
    # even when the model is equal: anchor/parameter meaning may be different.
    if len(matches) > 1:
        result['status'] = 'mapping_conflict'
        return result
    match = matches[0]
    if match['mapping_status'] != 'confirmed':
        result['status'] = 'mapping_' + match['mapping_status']
        return result
    model = connection.execute('SELECT * FROM cad_model_catalog WHERE model_id=?', (match['model_id'],)).fetchone()
    if model is None:
        result['status'] = 'needs_asset'
        return result
    if model['equipment_type_id'] not in {t['typeId'] for t in result['candidateTypes']}:
        result['status'] = 'type_conflict'
        return result
    result.update(status='mapped_needs_validation', modelId=match['model_id'],
                  mapping=match, model=dict(model))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('validate', 'lookup'):
        sub = commands.add_parser(name)
        sub.add_argument('--db', type=Path, help='existing SQLite DB, opened read-only')
        if name == 'lookup':
            sub.add_argument('--layer', required=True, help='effective layer; exact matching')
            sub.add_argument('--block')
            sub.add_argument('--original-block', help='verified dynamic original name only')
            sub.add_argument('--rule-set')
    args = parser.parse_args()
    try:
        connection = connect(args.db)
        try:
            report = validate(connection)
            if args.command == 'lookup':
                if args.original_block and not args.block:
                    raise ValueError('--original-block requires --block')
                report = lookup(connection, args.layer, args.block, args.original_block, args.rule_set)
            print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
        finally:
            connection.close()
    except (OSError, sqlite3.Error, ValueError) as exc:
        print(json.dumps({'status': 'configuration_error', 'message': str(exc)}, ensure_ascii=False))
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

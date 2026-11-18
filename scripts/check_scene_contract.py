"""Audit measured world contacts/ports/visibility/ownership. Standard library only.

This consumes evaluated scene samples, not GLB files. It does not infer topology,
repair geometry or certify CAD semantics. Exit 0: sampled checks pass; 1: failures;
2: malformed input. See references/acceptance.md for the JSON contract.
"""
import argparse
import copy
import json
import math
from pathlib import Path


def number(x, label, minimum=None):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
        raise ValueError(f'{label}: expected finite number')
    if minimum is not None and x < minimum:
        raise ValueError(f'{label}: must be >= {minimum}')
    return x


def vector(v, label):
    if not isinstance(v, list) or len(v) != 3:
        raise ValueError(f'{label}: expected [x,y,z]')
    return [number(x, label) for x in v]


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def subtract(a, b):
    return [x-y for x, y in zip(a, b)]


def norm(a):
    return math.sqrt(dot(a, a))


def normal(v, label):
    v = vector(v, label)
    if abs(norm(v)-1) > 1e-4:
        raise ValueError(f'{label}: expected unit normal')
    return v


def limit(row, key):
    return number(row[key], key, 0)


def strings(value, label):
    if not isinstance(value, list) or any(not isinstance(x, str) or not x for x in value):
        raise ValueError(f'{label}: expected list of nonempty IDs')
    return value


def check(data):
    if data.get('units') != 'm':
        raise ValueError('Input must use world meters: units="m"')
    if data.get('measurementBasis') != 'evaluated-world-geometry':
        raise ValueError('Export evaluated-world-geometry samples before checking')
    results, counts = [], {}
    for category in ['contacts', 'connections', 'viewSamples', 'cargoSamples']:
        rows = data.get(category, [])
        if not isinstance(rows, list):
            raise ValueError(f'{category}: expected array')
        counts[category] = len(rows)
        seen = set()
        for row in rows:
            identifier = row['id']
            if not isinstance(identifier, str) or not identifier or identifier in seen:
                raise ValueError(f'{category}: missing or duplicate sample ID')
            seen.add(identifier)
            failures, metrics = [], {}
            if category == 'contacts':
                delta = subtract(vector(row['subjectPoint'], 'subjectPoint'), vector(row['supportPoint'], 'supportPoint'))
                n = normal(row['normal'], 'normal')
                height = dot(delta, n)
                lateral = norm([delta[i]-height*n[i] for i in range(3)])
                metrics = {'normalSeparationM': height, 'lateralM': lateral}
                if abs(height) > limit(row, 'tolerance'):
                    failures.append('floating' if height > 0 else 'penetrating')
                if lateral > limit(row, 'maxLateral'):
                    failures.append('off_support')
            elif category == 'connections':
                a, b = row['a'], row['b']
                delta = subtract(vector(b['position'], 'b.position'), vector(a['position'], 'a.position'))
                na, nb = normal(a['normal'], 'a.normal'), normal(b['normal'], 'b.normal')
                axial = dot(delta, na)
                lateral = norm([delta[i]-axial*na[i] for i in range(3)])
                angle = math.degrees(math.acos(max(-1, min(1, -dot(na, nb)))))
                metrics = {'axialGapM': axial, 'lateralM': lateral, 'heightDifferenceM': abs(delta[1]), 'oppositionErrorDegrees': angle}
                if abs(axial) > limit(row, 'maxGap'):
                    failures.append('gap_or_overlap')
                if lateral > limit(row, 'maxLateral'):
                    failures.append('misaligned')
                if abs(delta[1]) > limit(row, 'maxHeight'):
                    failures.append('height_step')
                if angle > limit(row, 'angleToleranceDegrees'):
                    failures.append('wrong_port_direction')
            elif category == 'viewSamples':
                expected, visible = strings(row['expectedIds'], 'expectedIds'), strings(row['visibleIds'], 'visibleIds')
                if len(set(expected)) != len(expected):
                    raise ValueError('expectedIds contains duplicates')
                metrics = {'leaked': sorted(set(visible)-set(expected)), 'missing': sorted(set(expected)-set(visible))}
                if metrics['leaked']:
                    failures.append('wrong_floor_or_building_visible')
                if metrics['missing']:
                    failures.append('expected_entity_hidden')
                if len(set(visible)) != len(visible):
                    failures.append('duplicate_visible_entity')
            else:
                owners = strings(row['owners'], 'owners')
                delta = subtract(vector(row['cargoAnchor'], 'cargoAnchor'), vector(row['carrierAnchor'], 'carrierAnchor'))
                metrics = {'ownerCount': len(owners), 'anchorDistanceM': norm(delta)}
                if len(owners) != 1:
                    failures.append('cargo_owner_count')
                if norm(delta) > limit(row, 'tolerance'):
                    failures.append('cargo_detached_from_carrier')
            results.append({'category': category, 'id': identifier, 'metrics': metrics, 'failures': failures})
    if not results:
        raise ValueError('No samples: cannot claim successful verification')
    return {'sampleCounts': counts, 'unsampledCategories': [k for k, v in counts.items() if not v],
            'failedSamples': sum(bool(r['failures']) for r in results), 'results': results}


def self_test():
    fixture = {'units': 'm', 'measurementBasis': 'evaluated-world-geometry',
               'contacts': [{'id': 'load-on-upper-platform', 'subjectPoint': [0, 1.7, 0], 'supportPoint': [0, 1.7, 0], 'normal': [0, 1, 0], 'tolerance': .005, 'maxLateral': .02}],
               'connections': [{'id': 'a-b', 'a': {'position': [0, .8, 1], 'normal': [0, 0, 1]}, 'b': {'position': [0, .8, 1.01], 'normal': [0, 0, -1]}, 'maxGap': .02, 'maxLateral': .01, 'maxHeight': .005, 'angleToleranceDegrees': 2}],
               'viewSamples': [{'id': 'floor-2', 'expectedIds': ['floor-2-machine'], 'visibleIds': ['floor-2-machine']}],
               'cargoSamples': [{'id': 'load-1', 'owners': ['vehicle'], 'cargoAnchor': [1, .8, 2], 'carrierAnchor': [1, .8, 2], 'tolerance': .005}]}
    assert check(fixture)['failedSamples'] == 0  # Elevated support is valid.
    faults = [
        ('contacts', 'subjectPoint', [0, 1.924, 0], 'floating'),
        ('contacts', 'subjectPoint', [0, 0, 0], 'penetrating'),
        ('contacts', 'subjectPoint', [.4, 1.7, 0], 'off_support'),
        ('connections', 'b', {'position': [0, .8, 1.6], 'normal': [0, 0, -1]}, 'gap_or_overlap'),
        ('connections', 'b', {'position': [0, .576, 1.01], 'normal': [0, 0, -1]}, 'height_step'),
        ('connections', 'b', {'position': [.2, .8, 1.01], 'normal': [0, 0, -1]}, 'misaligned'),
        ('connections', 'b', {'position': [0, .8, 1.01], 'normal': [0, 0, 1]}, 'wrong_port_direction'),
        ('viewSamples', 'visibleIds', ['floor-2-machine', 'rack-owned-by-floor-1'], 'wrong_floor_or_building_visible'),
        ('viewSamples', 'visibleIds', [], 'expected_entity_hidden'),
        ('viewSamples', 'visibleIds', ['floor-2-machine']*2, 'duplicate_visible_entity'),
        ('cargoSamples', 'owners', ['vehicle', 'conveyor'], 'cargo_owner_count'),
        ('cargoSamples', 'owners', [], 'cargo_owner_count'),
        ('cargoSamples', 'cargoAnchor', [2, .8, 2], 'cargo_detached_from_carrier')]
    for category, key, value, expected in faults:
        changed = copy.deepcopy(fixture)
        changed[category][0][key] = value
        report = check(changed)
        assert report['failedSamples'] >= 1
        assert any(expected in r['failures'] for r in report['results']), expected
    invalid = copy.deepcopy(fixture)
    invalid['contacts'][0]['normal'] = [0, 0, 0]
    for data in [invalid, {'units': 'mm'}, {'units': 'm', 'measurementBasis': 'evaluated-world-geometry'}]:
        try:
            check(data)
        except (ValueError, KeyError):
            pass
        else:
            raise AssertionError('Invalid input accepted')
    print(json.dumps({'validElevatedSupport': True, 'faultCasesDetected': len(faults), 'invalidInputsRejected': 3}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', nargs='?')
    parser.add_argument('--out')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        if not args.input:
            parser.error('input JSON required')
        try:
            report = check(json.loads(Path(args.input).read_text()))
        except (ValueError, KeyError, TypeError, OSError) as exc:
            parser.exit(2, f'Invalid measurement data: {exc}\n')
        output = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
        if args.out:
            Path(args.out).write_text(output)
        print(output, end='')
        raise SystemExit(1 if report['failedSamples'] else 0)

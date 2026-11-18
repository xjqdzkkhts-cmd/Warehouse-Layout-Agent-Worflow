"""Copy the bundled GLB library into a project after validating its models/specs.

Usage: python3 materialize_library.py /path/to/project/dist/library
Uses only the Python standard library; never overwrites a nonempty directory.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def safe_file(root, relative):
    path = (root / relative).resolve()
    if root not in path.parents or not path.is_file():
        raise ValueError(f'Invalid or missing bundled file: {relative}')
    return path


def materialize(destination, quality="high"):
    if quality != "high":
        raise ValueError("Only high-detail models are supported")
    source = (Path(__file__).resolve().parents[1] / 'assets' / 'asset-library-high').resolve()
    target = Path(destination).expanduser().resolve()
    if target == source or source in target.parents or target in source.parents:
        raise ValueError('Destination must be separate from the bundled library')
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise ValueError(f'Destination is not an empty directory: {target}')
    catalog = json.loads((source / 'manifest.json').read_text())
    ids = [a['id'] for a in catalog['assets']]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError('Missing or duplicated asset IDs')
    for asset in catalog['assets']:
        model = safe_file(source, asset['model'])
        if hashlib.sha256(model.read_bytes()).hexdigest() != asset['modelSha256']:
            raise ValueError(f'Model checksum mismatch: {asset["id"]}')
        spec = json.loads(safe_file(source, asset['spec']).read_text())
        if spec['id'] != asset['id'] or spec['modelSha256'] != asset['modelSha256']:
            raise ValueError(f'Spec/model mismatch: {asset["id"]}')
    shutil.copytree(source, target, dirs_exist_ok=target.exists(),
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))
    return {'quality': quality, 'assetCount': len(ids), 'libraryVersion': catalog['version'], 'destination': str(target)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination')
    parser.add_argument('--quality', choices=['high'], default='high', help='Only high-detail models')
    args = parser.parse_args()
    try:
        print(json.dumps(materialize(args.destination, args.quality), ensure_ascii=False))
    except (ValueError, KeyError, OSError) as exc:
        parser.exit(1, f'Cannot copy asset library: {exc}\n')

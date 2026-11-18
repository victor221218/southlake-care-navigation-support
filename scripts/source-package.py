"""Export an allowlisted source archive without runtime, records or credentials."""
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
output = root.parent.parent / 'outputs'
output.mkdir(exist_ok=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8-sig'))['version']
output = output / 'Southlake-Hive-Windows-2.0'
output.mkdir(exist_ok=True)
destination = output / f'Southlake-Hive-Source-{version}.zip'
files = [root / name for name in (
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.gitignore',
    'README.md', 'WINDOWS-DEVELOPMENT.md', 'START-HERE.md', 'SHARING.md', 'DIRECTORY-SOURCES.md', 'BUILDING.md', 'electron-builder.yml',
)]
for folder in ('src', 'ui', 'tests', 'scripts', 'assets', 'drizzle'):
    files.extend(item for item in (root / folder).rglob('*') if item.is_file() and '__pycache__' not in item.parts)
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
    for file in sorted(files):
        relative = file.relative_to(root)
        if file.suffix.lower() in ('.sqlite', '.db', '.auth', '.credentials', '.log', '.pfx', '.p12', '.key') or file.name.startswith('.env'):
            raise ValueError('Unexpected private file in source allowlist')
        archive.write(file, 'southlake-hive-desktop/' + relative.as_posix())
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert archive.read('southlake-hive-desktop/package.json') == (root / 'package.json').read_bytes()
    assert 'southlake-hive-desktop/README.md' in archive.namelist()
    assert 'southlake-hive-desktop/WINDOWS-DEVELOPMENT.md' in archive.namelist()
    for name in archive.namelist():
        relative = pathlib.PurePosixPath(name)
        assert not relative.is_absolute() and '..' not in relative.parts
        assert not set(relative.parts) & {'.runtime', 'node_modules', '.git', 'release', 'dist', '__pycache__'}
        source = root.joinpath(*relative.parts[1:])
        assert archive.read(name) == source.read_bytes()
digest = hashlib.file_digest(destination.open('rb'), 'sha256').hexdigest()
checksum_file = output / 'SHA256.txt'
checksums = {}
if checksum_file.exists():
    for line in checksum_file.read_text().splitlines():
        if '  ' in line:
            value, name = line.split('  ', 1)
            if (output / name).is_file():
                checksums[name] = value
checksums[destination.name] = digest
checksum_file.write_text(''.join(f'{value}  {name}\n' for name, value in sorted(checksums.items())))
print(destination)
print(digest)
print(f'{len(files)} source files verified byte-for-byte; version {version}; no GitHub publication performed.')

"""Create clean portable Windows and recipient-test Mac archives."""
import argparse
import copy
import json
import pathlib
import shutil
import zipfile
from mac_package import PROJECT, PRODUCT, REVISION, asar_hashes, build_mac, digest, entry, verify_mac

root = pathlib.Path(__file__).resolve().parent.parent
output = root.parent.parent / 'outputs'
output.mkdir(exist_ok=True)
runtimes = json.loads((root / '.runtime/runtimes.json').read_text())
version = PROJECT['version']
electron_version = PROJECT['devDependencies']['electron']
product_prefix = PRODUCT.replace(' ', '-')
mac_output = output / f"{product_prefix}-Windows-{'.'.join(version.split('.')[:2])}" / 'Mac'
parser = argparse.ArgumentParser()
selection = parser.add_mutually_exclusive_group()
selection.add_argument('--platform', choices=('Windows', 'Mac-Apple-Silicon', 'Mac-Intel'))
selection.add_argument('--mac-only', action='store_true')
args = parser.parse_args()
asar = root / 'release/app.asar'
hashes = None
checksums = {}
checksum_file = output / 'Southlake-Hive-Desktop-SHA256.txt'
if checksum_file.exists():
    for line in checksum_file.read_text().splitlines():
        if '  ' in line:
            value, name = line.split('  ', 1)
            if (output / name).is_file():
                checksums[name] = value
mac_reports = []

for runtime in runtimes:
    platform, arch = runtime['platform'], runtime['arch']
    label = 'Windows' if platform == 'win32' else 'Mac-Apple-Silicon' if arch == 'arm64' else 'Mac-Intel'
    if (args.platform and args.platform != label) or (args.mac_only and platform != 'darwin'):
        continue
    alias = output / f'Southlake-Hive-{label}.zip'
    if platform == 'darwin':
        checksum_path = root / f'.runtime/electron-v{electron_version}-official-sha256.txt'
        upstream = dict((name.lstrip('*'), sha) for sha, name in (
            line.split(maxsplit=1) for line in checksum_path.read_text(encoding='utf-8-sig').splitlines() if line.strip()
        ))
        runtime_name = f'electron-v{electron_version}-darwin-{arch}.zip'
        if pathlib.Path(runtime['path']).name != runtime_name or digest(runtime['path']) != upstream.get(runtime_name):
            raise ValueError('The Mac runtime differs from Electron’s official checksum: ' + runtime_name)
        if hashes is None:
            hashes = asar_hashes(root, asar)
        mac_output.mkdir(parents=True, exist_ok=True)
        destination = mac_output / f'{product_prefix}-{label}-{version}-Test.zip'
        temporary = destination.with_suffix('.building.zip')
        build_mac(root, runtime, temporary, version, asar, hashes)
        report = verify_mac(temporary, *hashes, arch, version)
        temporary.replace(destination)
        report['file'] = destination.name
        report['official_electron_checksum_verified'] = True
        mac_reports.append(report)
    else:
        destination = alias
        with zipfile.ZipFile(runtime['path']) as source, zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=5, allowZip64=True) as target:
            for original in source.infolist():
                if original.filename.lower().endswith('resources/default_app.asar'):
                    continue
                info = copy.copy(original)
                info.filename = 'Southlake Hive/' + ('Southlake Hive.exe' if original.filename == 'electron.exe' else original.filename)
                target.writestr(info, source.read(original))
            with asar.open('rb') as stream, target.open(entry('Southlake Hive/resources/app.asar'), 'w', force_zip64=True) as dest:
                shutil.copyfileobj(stream, dest, length=1024 * 1024)
            for name in ('START-HERE.md', 'SHARING.md'):
                target.writestr(entry(name), (root / name).read_bytes())
        with zipfile.ZipFile(destination) as archive:
            assert archive.testzip() is None
        checksums[destination.name] = digest(destination)
    print(json.dumps({'file': str(destination), 'bytes': destination.stat().st_size, 'sha256': report['sha256'] if platform == 'darwin' else checksums[destination.name]}), flush=True)

if not args.mac_only and args.platform in (None, 'Windows'):
    checksum_file.write_text(''.join(f'{value}  {name}\n' for name, value in sorted(checksums.items())))
if mac_reports:
    report_file = mac_output / 'Mac-Verification.json'
    previous = json.loads(report_file.read_text()) if report_file.exists() else {'packages': []}
    reports = {report['architecture']: report for report in previous['packages'] if report['app_version'] == version}
    reports.update({report['architecture']: report for report in mac_reports})
    report_file.write_text(json.dumps({'package_revision': REVISION, 'app_version': version,
                                      'built_on': 'Windows; no macOS runtime is available in this workspace',
                                      'packages': list(reports.values())}, indent=2) + '\n')
if not args.mac_only and args.platform in (None, 'Windows'):
    shutil.copyfile(root / 'START-HERE.md', output / 'Southlake-Hive-Desktop-Start-Here.md')
    shutil.copyfile(root / 'SHARING.md', output / 'Southlake-Hive-Sharing-Guide.md')

"""Independent cross-platform inspection; this does not substitute for a Mac test."""
import hashlib
import json
import pathlib
import plistlib
import struct
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
output = root.parent.parent / 'outputs'
version = json.loads((root / 'package.json').read_text())['version']
asar = root / 'release/app.asar'
with asar.open('rb') as stream:
    full_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
with asar.open('rb') as stream:
    prefix = stream.read(16)
    _, header_pickle_size, payload_size, string_size = struct.unpack('<IIII', prefix)
    assert string_size <= payload_size <= header_pickle_size
    header = stream.read(string_size)
    json.loads(header)
    header_hash = hashlib.sha256(header).hexdigest()

def file_hash(archive, name):
    with archive.open(name) as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

report_file = output / 'Southlake-Hive-Mac-Verification.json'
report = json.loads(report_file.read_text())
report_by_arch = {item['architecture']: item for item in report['packages']}
for runtime in json.loads((root / '.runtime/runtimes.json').read_text()):
    if runtime['platform'] != 'darwin':
        continue
    arch = runtime['arch']
    label = 'Apple-Silicon' if arch == 'arm64' else 'Intel'
    path = output / f'Southlake-Hive-Mac-{label}-{version}-Test.zip'
    app = 'Southlake Hive Mac/Southlake Hive.app/'
    compared = 0
    with zipfile.ZipFile(runtime['path']) as upstream, zipfile.ZipFile(path) as packaged:
        expected = set()
        for item in upstream.infolist():
            name = item.filename
            if not name.startswith('Electron.app/'):
                continue
            if name.startswith('Electron.app/Contents/_CodeSignature/') or name.lower().endswith('/resources/default_app.asar'):
                continue
            target = app + name[len('Electron.app/'):]
            expected.add(target)
            if name == 'Electron.app/Contents/Info.plist':
                continue
            assert file_hash(upstream, name) == file_hash(packaged, target), 'Changed upstream runtime code: ' + name
            assert upstream.getinfo(name).external_attr == packaged.getinfo(target).external_attr, 'Lost file permissions: ' + name
            compared += 1
        expected.update({app + 'Contents/Resources/app.asar', app + 'Contents/Resources/hive.icns'})
        assert expected == {name for name in packaged.namelist() if name.startswith(app)}, 'Unexpected/missing bundle contents'
        info = plistlib.loads(packaged.read(app + 'Contents/Info.plist'))
        assert info['ElectronAsarIntegrity']['Resources/app.asar']['hash'] == header_hash
        assert file_hash(packaged, app + 'Contents/Resources/app.asar') == full_hash
        binary = packaged.read(app + 'Contents/MacOS/Electron')
        count = struct.unpack_from('<I', binary, 16)[0]
        offset = 32
        native_minimum = None
        for _ in range(count):
            command, size = struct.unpack_from('<II', binary, offset)
            if command == 0x32:
                number = struct.unpack_from('<I', binary, offset + 12)[0]
                native_minimum = f'{number >> 16}.{number >> 8 & 255}.{number & 255}'
            offset += size
        assert native_minimum == '13.0.0', 'Unexpected native macOS minimum'
        manifest = json.loads(packaged.read('Southlake Hive Mac/Support/package-manifest.json'))
        assert manifest['app_asar_sha256'] == full_hash
        assert not manifest['native_mac_launch_verified'] and not manifest['developer_id_signed'] and not manifest['apple_notarized']
        for name in ('READ ME FIRST.txt', 'Mac test checklist.txt', 'Install Southlake Hive.command'):
            text = packaged.read('Southlake Hive Mac/' + name).decode('utf-8')
            assert '@VERSION@' not in text and '@ASAR_SHA256@' not in text
            assert version in text
    item = report_by_arch[arch]
    item.update(unchanged_upstream_runtime_entries_compared=compared,
                only_expected_bundle_files=True, independently_parsed_asar_header_matches=True,
                native_binary_minimum_macos=native_minimum,
                installer_bash_execution_verified=False,
                installer_bash_execution_note='Git Bash cannot start in this restricted Windows build environment; recipient Mac test required.')
    print(json.dumps({'architecture': arch, 'unchanged_runtime_entries_compared': compared,
                      'app_hash': full_hash, 'independent_header_check': True, 'native_minimum': native_minimum}))
report_file.write_text(json.dumps(report, indent=2) + '\n')
print('Both Mac kits match the shipping app and their original native runtimes. Native launch remains unverified.')

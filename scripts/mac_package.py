"""Assemble and inspect Mac acceptance kits without pretending to run macOS."""
import copy
import hashlib
import json
import pathlib
import plistlib
import posixpath
import shutil
import stat
import struct
import subprocess
import zipfile

PREFIX = 'Southlake Hive Mac/'
APP = PREFIX + 'Southlake Hive.app/'
REVISION = 'mac-2'


def digest(path):
    with pathlib.Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def entry(name, mode=0o644):
    info = zipfile.ZipInfo(name)
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    return info


def asar_hashes(root, asar):
    # Hash the exact header string exposed by Electron's own ASAR library.
    code = """import { getRawHeader } from '@electron/asar';
import { createHash } from 'node:crypto';
console.log(createHash('sha256').update(getRawHeader(process.argv[1]).headerString).digest('hex'));"""
    result = subprocess.run(['node', '--input-type=module', '-e', code, str(asar)],
                            cwd=root, text=True, capture_output=True, check=True)
    header_hash = result.stdout.strip()
    if len(header_hash) != 64 or any(c not in '0123456789abcdef' for c in header_hash):
        raise ValueError('Could not calculate the ASAR header hash')
    return digest(asar), header_hash


def render_template(root, name, substitutions):
    text = (root / 'scripts/mac' / name).read_text(encoding='utf-8')
    for key, value in substitutions.items():
        text = text.replace('@' + key + '@', value)
    if any(token in text for token in ('@ARCH@', '@VERSION@', '@ASAR_SHA256@', '@CHIP_LABEL@')):
        raise ValueError('Unrendered Mac installer template')
    return text.replace('\r\n', '\n').encode('utf-8')


def build_mac(root, runtime, destination, version, asar, hashes):
    arch = runtime['arch']
    chip = 'Apple Silicon (Apple M-series)' if arch == 'arm64' else 'Intel'
    full_hash, header_hash = hashes
    manifest = {
        'app': 'Southlake Hive', 'app_version': version, 'package_revision': REVISION,
        'architecture': arch, 'minimum_macos': '13.0',
        'app_asar_sha256': full_hash, 'app_asar_header_sha256': header_hash,
        'runtime': {'archive': pathlib.Path(runtime['path']).name, 'sha256': digest(runtime['path']),
                    'source': 'https://github.com/electron/electron/releases'},
        'native_mac_launch_verified': False, 'developer_id_signed': False, 'apple_notarized': False,
        'installation': 'Recipient runs bundled Mac installer; outer app receives a local ad-hoc test signature.',
        'security': 'Does not remove quarantine, disable Gatekeeper or grant microphone/Keychain permission.',
        'data': 'Public starting directory and separate fictional practice records only; no user records or credentials.',
    }
    substitutions = {'ARCH': arch, 'VERSION': version, 'ASAR_SHA256': full_hash, 'CHIP_LABEL': chip}
    with zipfile.ZipFile(runtime['path']) as source, zipfile.ZipFile(
            destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=5, allowZip64=True) as target:
        for original in source.infolist():
            old_name = original.filename
            if old_name.lower().endswith('/resources/default_app.asar'):
                continue
            if old_name.startswith('Electron.app/Contents/_CodeSignature/'):
                continue
            info = copy.copy(original)
            if old_name.startswith('Electron.app/'):
                info.filename = APP + old_name[len('Electron.app/'):]
            else:
                info.filename = PREFIX + 'Support/Electron-runtime/' + old_name
            data = source.read(original)
            if old_name == 'Electron.app/Contents/Info.plist':
                values = plistlib.loads(data)
                values.update(
                    CFBundleDisplayName='Southlake Hive', CFBundleName='Southlake Hive',
                    CFBundleIdentifier='org.team26.southlakehive', CFBundleVersion=version,
                    CFBundleShortVersionString=version, CFBundleIconFile='hive.icns',
                    LSApplicationCategoryType='public.app-category.productivity',
                    NSMicrophoneUsageDescription='Dictate service needs to Southlake Hive. English recognition runs on this computer.',
                    ElectronAsarIntegrity={'Resources/app.asar': {'algorithm': 'SHA256', 'hash': header_hash}},
                )
                for key in ('NSCameraUsageDescription', 'NSBluetoothAlwaysUsageDescription',
                            'NSBluetoothPeripheralUsageDescription', 'NSAudioCaptureUsageDescription'):
                    values.pop(key, None)
                data = plistlib.dumps(values)
            target.writestr(info, data)
        with asar.open('rb') as stream, target.open(entry(APP + 'Contents/Resources/app.asar'), 'w', force_zip64=True) as dest:
            shutil.copyfileobj(stream, dest, length=1024 * 1024)
        target.writestr(entry(APP + 'Contents/Resources/hive.icns'), (root / 'assets/hive.icns').read_bytes())
        for name in ('READ ME FIRST.txt', 'Mac test checklist.txt', 'Install Southlake Hive.command'):
            target.writestr(entry(PREFIX + name, 0o755 if name.endswith('.command') else 0o644),
                            render_template(root, name, substitutions))
        target.writestr(entry(PREFIX + 'Support/main-entitlements.plist'),
                        (root / 'scripts/mac/main-entitlements.plist').read_bytes())
        target.writestr(entry(PREFIX + 'Support/package-manifest.json'),
                        json.dumps(manifest, indent=2).encode() + b'\n')
    return manifest


def resolved_link(name, links, names):
    current = name
    for _ in range(40):
        parts = current.split('/')
        for index in range(1, len(parts) + 1):
            component = '/'.join(parts[:index])
            if component in links:
                target = links[component]
                if target.startswith('/'):
                    raise ValueError('Absolute symlink in app bundle')
                current = posixpath.normpath(posixpath.join(posixpath.dirname(component), target, *parts[index:]))
                if not current.startswith(APP):
                    raise ValueError('Symlink escapes the app bundle')
                break
        else:
            if current in names or current + '/' in names or any(item.startswith(current + '/') for item in names):
                return current
            raise ValueError('Dangling app symlink: ' + name)
    raise ValueError('App symlink loop: ' + name)


def verify_mac(destination, expected_asar, expected_header, expected_arch, version):
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate archive entry'
        assert all(name.startswith(PREFIX) and '..' not in pathlib.PurePosixPath(name).parts for name in names)
        assert not any('default_app.asar' in name.lower() for name in names), 'Electron starter app remains'
        assert not any(name.startswith(APP + 'Contents/_CodeSignature/') for name in names), 'Stale outer signature remains'
        info = plistlib.loads(archive.read(APP + 'Contents/Info.plist'))
        assert info['CFBundleIdentifier'] == 'org.team26.southlakehive'
        assert info['CFBundleShortVersionString'] == info['CFBundleVersion'] == version
        assert info['CFBundleExecutable'] == 'Electron'
        assert info['LSMinimumSystemVersion'] == '13.0'
        assert info['CFBundleIconFile'] == 'hive.icns'
        assert 'NSMicrophoneUsageDescription' in info
        assert info['ElectronAsarIntegrity'] == {'Resources/app.asar': {'algorithm': 'SHA256', 'hash': expected_header}}
        with archive.open(APP + 'Contents/Resources/app.asar') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == expected_asar, 'Shipping ASAR mismatch'
        manifest = json.loads(archive.read(PREFIX + 'Support/package-manifest.json'))
        assert manifest['architecture'] == expected_arch
        assert manifest['app_asar_sha256'] == expected_asar
        assert manifest['app_asar_header_sha256'] == expected_header
        assert manifest['native_mac_launch_verified'] is False and manifest['apple_notarized'] is False
        executable = archive.getinfo(APP + 'Contents/MacOS/Electron')
        assert executable.external_attr >> 16 & 0o111, 'Main executable bit missing'
        binary = archive.read(executable)
        magic, cpu = struct.unpack_from('<II', binary)
        assert magic == 0xFEEDFACF
        assert cpu == {'arm64': 0x0100000C, 'x64': 0x01000007}[expected_arch], 'Wrong native architecture'
        links = {item.filename: archive.read(item).decode() for item in archive.infolist()
                 if stat.S_ISLNK(item.external_attr >> 16)}
        assert links, 'Framework symlinks lost'
        for name in links:
            resolved_link(name, links, set(names))
        installer = archive.getinfo(PREFIX + 'Install Southlake Hive.command')
        assert installer.external_attr >> 16 & 0o111, 'Installer executable bit missing'
        command = archive.read(installer).decode()
        assert '\r' not in command and command.startswith('#!/bin/bash\n'), 'Mac script line endings'
        assert expected_asar in command and f'hive_expected_arch="{expected_arch}"' in command
        assert '@VERSION@' not in command and '@ARCH@' not in command
        assert 'codesign --verify --deep --strict' in command
        assert not any(token in command for token in ('xattr ', 'spctl ', 'sudo ', '--no-sandbox', 'curl ', 'wget '))
        entitlements = plistlib.loads(archive.read(PREFIX + 'Support/main-entitlements.plist'))
        assert entitlements == {'com.apple.security.cs.allow-jit': True, 'com.apple.security.device.audio-input': True}
        icon = archive.read(APP + 'Contents/Resources/hive.icns')
        assert icon[:4] == b'icns' and struct.unpack_from('>I', icon, 4)[0] == len(icon)
        return {
            'file': destination.name, 'bytes': destination.stat().st_size, 'sha256': digest(destination),
            'app_version': version, 'package_revision': REVISION, 'architecture': expected_arch,
            'minimum_macos': info['LSMinimumSystemVersion'], 'asar_matches_shipping_release': True,
            'asar_integrity_header_matches': True, 'starter_app_removed': True,
            'framework_symlinks_checked': len(links), 'executable_permissions_preserved': True,
            'zip_crc_passed': True, 'installer_rendered': True, 'native_mac_launch_verified': False,
            'developer_id_signed': False, 'apple_notarized': False,
            'recipient_test_required': ['local installation and launch', 'microphone', 'save and reopen', 'ChatGPT connection and Keychain'],
        }

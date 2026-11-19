"""Stage only public application files for the per-user Windows installer."""
import json
import pathlib
import shutil
import subprocess
import zipfile
import argparse

root = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
checks = parser.add_mutually_exclusive_group()
checks.add_argument('--qa', action='store_true', help='Use the isolated developer QA bootstrap; never distribute this folder.')
checks.add_argument('--voice-smoke', action='store_true', help='Build an isolated native voice smoke-check executable; never distribute it as the app.')
checks.add_argument('--assistant-smoke', action='store_true', help='Build an isolated assistant IPC smoke check; never distribute it as the app.')
checks.add_argument('--document-smoke', action='store_true', help='Build an isolated document-workspace check; never distribute it as the app.')
args = parser.parse_args()
runtimes = json.loads((root / '.runtime/runtimes.json').read_text())
runtime = next(item for item in runtimes if item['platform'] == 'win32' and item['arch'] == 'x64')
project = json.loads((root / 'package.json').read_text(encoding='utf-8'))
version = project['version']
product_name = project['productName']
executable = f'{product_name}.exe'
if args.assistant_smoke:
    executable = 'Southlake Hive Assistant Test.exe'
elif args.voice_smoke:
    executable = 'Southlake Hive Voice Test.exe'
elif args.document_smoke:
    executable = f'{product_name} Test.exe'
stage = root / (f'.runtime/assistant-smoke-{version}' if args.assistant_smoke else f'.runtime/voice-smoke-{version}' if args.voice_smoke else '.runtime/desktop-qa' if args.qa else f'release/windows-app-{version}')
if args.document_smoke:
    stage = root / f'.runtime/document-smoke-{version}'
stage.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(runtime['path']) as archive:
    assert archive.testzip() is None
    for member in archive.infolist():
        if member.is_dir() or member.filename == 'resources/default_app.asar':
            continue
        relative = pathlib.PurePosixPath(member.filename)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Unexpected runtime archive path')
        name = executable if member.filename == 'electron.exe' else member.filename
        destination = stage / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, destination.open('wb') as target:
            shutil.copyfileobj(source, target)
(stage / 'resources').mkdir(exist_ok=True)
shutil.copyfile(root / ('.runtime/document-smoke.asar' if args.document_smoke else '.runtime/assistant-smoke.asar' if args.assistant_smoke else '.runtime/voice-smoke.asar' if args.voice_smoke else '.runtime/qa-app.asar' if args.qa else 'release/app.asar'), stage / 'resources/app.asar')
shutil.copyfile(root / 'START-HERE.md', stage / 'START-HERE.md')
shutil.copyfile(root / 'SHARING.md', stage / 'SHARING.md')
shutil.copyfile(root / 'DIRECTORY-SOURCES.md', stage / 'DIRECTORY-SOURCES.md')
icon = root / 'assets/hive.ico'
shutil.copyfile(icon, stage / 'hive.ico')
if not (args.qa or args.assistant_smoke or args.voice_smoke):
    # Use the resource editor already provided by the pinned Windows build dependencies.
    editor = root / 'node_modules/electron-winstaller/vendor/rcedit.exe'
    if not editor.is_file():
        raise SystemExit('Install the pinned Windows build dependencies with the hoisted linker.')
    subprocess.run([
        str(editor), str(stage / executable), '--set-icon', str(icon),
        '--set-version-string', 'ProductName', product_name,
        '--set-version-string', 'FileDescription', product_name,
        '--set-version-string', 'OriginalFilename', f'{product_name}.exe',
        '--set-file-version', version, '--set-product-version', version,
    ], check=True)
print(stage)

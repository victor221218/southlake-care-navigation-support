"""Stage only public application files for the per-user Windows installer."""
import json
import pathlib
import shutil
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
version = json.loads((root / 'package.json').read_text())['version']
stage = root / (f'.runtime/assistant-smoke-{version}' if args.assistant_smoke else f'.runtime/voice-smoke-{version}' if args.voice_smoke else '.runtime/desktop-qa' if args.qa else 'release/windows-app')
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
        name = ('Southlake Hive Assistant Test.exe' if args.assistant_smoke else 'Southlake Hive Voice Test.exe' if args.voice_smoke else 'Southlake Hive.exe') if member.filename == 'electron.exe' else member.filename
        if args.document_smoke and member.filename == 'electron.exe':
            name = 'Southlake Hive Document Test.exe'
        destination = stage / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, destination.open('wb') as target:
            shutil.copyfileobj(source, target)
(stage / 'resources').mkdir(exist_ok=True)
shutil.copyfile(root / ('.runtime/document-smoke.asar' if args.document_smoke else '.runtime/assistant-smoke.asar' if args.assistant_smoke else '.runtime/voice-smoke.asar' if args.voice_smoke else '.runtime/qa-app.asar' if args.qa else 'release/app.asar'), stage / 'resources/app.asar')
shutil.copyfile(root / 'START-HERE.md', stage / 'START-HERE.md')
shutil.copyfile(root / 'SHARING.md', stage / 'SHARING.md')
shutil.copyfile(root / 'DIRECTORY-SOURCES.md', stage / 'DIRECTORY-SOURCES.md')
shutil.copyfile(root / 'assets/hive.ico', stage / 'hive.ico')
print(stage)

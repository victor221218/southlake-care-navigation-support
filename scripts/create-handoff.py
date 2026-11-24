"""Bundle the tested installer, editable source and guides for a GitHub release."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
FILENAME = 'Care-Navigation-Support-Handoff.zip'
PRIVATE_SUFFIXES = {'.xlsx', '.xls', '.xlsm', '.sqlite', '.db', '.key', '.pfx', '.p12', '.log'}
PRIVATE_FOLDERS = {'.git', '.runtime', 'node_modules', 'dist', 'release', 'outputs'}


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def sha256(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def check_file(file, report):
    if file.name != report['filename'] or file.stat().st_size != report['bytes'] or sha256(file) != report['sha256']:
        raise ValueError(f'{file.name} differs from its verification report')


def start_page(version, installer, mac_links):
    mac = ''
    if mac_links:
        choices = ' or '.join(f'<a href="{file}">{label}</a>' for file, label in mac_links)
        mac = f'<h2>Test on a Mac</h2><p>Choose the {choices} bundle and follow its included guide. Native Mac launch, signing and notarization still need verification.</p>'
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Care Navigation Support {version}</title>
<style>
body {{ max-width: 700px; margin: 42px auto; padding: 0 22px; font: 16px/1.6 "Segoe UI", Arial, sans-serif; color: #20374b; }}
h1, h2 {{ color: #064b7f; line-height: 1.2; }} h2 {{ margin-top: 28px; }}
a {{ color: #064b7f; }} .download {{ display: inline-block; padding: 9px 16px; background: #064b7f; color: white; border-radius: 5px; }}
</style>
<main>
<h1>Care Navigation Support {version}</h1>
<h2>Install on Windows</h2>
<p>Close Care Navigation Support if it is open. Run the installer from this extracted folder, choose <strong>Install</strong>, then <strong>Finish</strong>.</p>
<p><a class="download" href="{installer}">Open the Windows installer</a></p>
<p>Start Care Navigation Support and choose <strong>Connect ChatGPT</strong>. Sign in with your eligible account in the browser. In <strong>Known services</strong>, choose <strong>Import services</strong> to review a contact spreadsheet before saving.</p>
{mac}
<h2>Guides and source</h2>
<ul>
<li><a href="source/START-HERE.md">User guide</a> for documents, services, chat and backups.</li>
<li><a href="source/SHARING.md">Handoff guide</a> for setup and rollout.</li>
<li><a href="source/README.md">Source code map</a> and <a href="source/WINDOWS-DEVELOPMENT.md">build instructions</a> for maintainers.</li>
<li><a href="Verification.json">Test results</a> and <a href="SHA256.txt">file checksums</a>.</li>
</ul>
</main>
</html>
"""


def copy_source(source, package):
    for member in source.infolist():
        if member.is_dir():
            continue
        relative = PurePosixPath(member.filename).relative_to('source')
        if (relative.is_absolute() or '..' in relative.parts or
                PRIVATE_FOLDERS.intersection(relative.parts) or relative.name.startswith('.env') or
                relative.suffix.lower() in PRIVATE_SUFFIXES or stat.S_ISLNK(member.external_attr >> 16)):
            raise ValueError(f'Unexpected file in the source snapshot: {relative}')
        with source.open(member) as input_file, package.open(member.filename, 'w') as output_file:
            shutil.copyfileobj(input_file, output_file, length=1024 * 1024)


def create_handoff(installer, verification, mac_directory, output):
    commit = git('rev-parse', 'HEAD').decode().strip()
    version = json.loads(git('show', f'{commit}:package.json'))['version']
    report = json.loads(verification.read_text(encoding='utf-8-sig'))
    if (report['version'] != version or report['source_commit'] != commit or
            report['automated_tests']['failed'] or not report['windows_acceptance']['passed']):
        raise ValueError('Verification must describe the tested source commit')
    if installer.name != f'Care-Navigation-Support-Setup-{version}.exe':
        raise ValueError('The installer version must match the source')
    check_file(installer, report['installer'])

    files = [(installer, installer.name), (verification, 'Verification.json')]
    mac_links = []
    if mac_directory:
        mac_verification = mac_directory / 'Mac-Verification.json'
        mac_report = json.loads(mac_verification.read_text(encoding='utf-8-sig'))
        if mac_report['app_version'] != version or {item['architecture'] for item in mac_report['packages']} != {'arm64', 'x64'}:
            raise ValueError('Mac test bundles must match the release version')
        files.append((mac_verification, 'Mac/Mac-Verification.json'))
        labels = {'arm64': ('Apple-Silicon', 'Apple Silicon'), 'x64': ('Intel', 'Intel')}
        for item in mac_report['packages']:
            label, title = labels[item['architecture']]
            name = f'Care-Navigation-Support-Mac-{label}-{version}-Test.zip'
            file = mac_directory / name
            check_file(file, {**item, 'filename': item['file']})
            arcname = f'Mac/{name}'
            files.append((file, arcname))
            mac_links.append((arcname, title))

    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output, prefix='.handoff-') as scratch:
        source_path = Path(scratch) / 'source.zip'
        git('archive', '--format=zip', '--prefix=source/', f'--output={source_path}', commit)
        temporary = Path(scratch) / FILENAME
        with ZipFile(source_path) as source, ZipFile(temporary, 'w', compression=ZIP_DEFLATED) as package:
            copy_source(source, package)
            for file, name in files:
                package.write(file, name, compress_type=ZIP_STORED)
            package.writestr('START-HERE.html', start_page(version, installer.name, mac_links))
        checksums = {}
        with ZipFile(temporary, 'a', compression=ZIP_DEFLATED) as package:
            for name in package.namelist():
                with package.open(name) as stream:
                    checksums[name] = hashlib.file_digest(stream, 'sha256').hexdigest()
            if checksums[installer.name] != report['installer']['sha256']:
                raise ValueError('The archived installer differs from the tested installer')
            package.writestr('SHA256.txt', ''.join(f'{value}  {name}\n' for name, value in sorted(checksums.items())))
        destination = output / FILENAME
        temporary.replace(destination)

    print(json.dumps({'filename': destination.name, 'version': version, 'source_commit': commit,
                      'bytes': destination.stat().st_size, 'sha256': sha256(destination),
                      'files_checked': len(checksums)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--installer', type=Path, required=True)
    parser.add_argument('--verification', type=Path, required=True)
    parser.add_argument('--mac-directory', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    create_handoff(**vars(parser.parse_args()))

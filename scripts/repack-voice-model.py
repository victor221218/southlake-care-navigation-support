"""Repack model files with explicit directory entries required by Vosk's unpacker.

Usage: python scripts/repack-voice-model.py input.tar.gz output.tar.gz
Does not change the model file contents. Output is reproducible gzip/USTAR.
"""
import gzip
import pathlib
import sys
import tarfile

source, output = map(pathlib.Path, sys.argv[1:3])
if source.resolve() == output.resolve():
    raise ValueError('Use a separate output path, verify the loader, then replace the bundled archive.')
with tarfile.open(source) as original:
    files = [member for member in original.getmembers() if member.isfile()]
    for member in files:
        name = pathlib.PurePosixPath(member.name)
        if not member.name.startswith('model/') or '..' in name.parts or name.is_absolute():
            raise ValueError('Expected only files below model/')
    directories = {str(parent) for member in files for parent in pathlib.PurePosixPath(member.name).parents if str(parent) != '.'}
    with output.open('wb') as raw, gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as compressed, tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as packed:
        for name in sorted(directories, key=lambda item: (len(pathlib.PurePosixPath(item).parts), item)):
            entry = tarfile.TarInfo(name + '/')
            entry.type = tarfile.DIRTYPE
            entry.mode = 0o755
            entry.mtime = 0
            packed.addfile(entry)
        for member in files:
            entry = tarfile.TarInfo(member.name)
            entry.mode = 0o644
            entry.size = member.size
            entry.mtime = 0
            packed.addfile(entry, original.extractfile(member))
print(output)

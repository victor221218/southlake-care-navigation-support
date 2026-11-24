import { createPackage } from '@electron/asar';
import { cp, mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const stage = path.resolve('.runtime/app-stage');
await mkdir(stage, { recursive: true });
for (const folder of ['dist', 'assets', 'drizzle']) await cp(folder, path.join(stage, folder), { recursive: true });
const project = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: project.name, productName: project.productName, version: project.version, main: project.main }));
for (const name of ['README.md', 'START-HERE.md', 'SHARING.md', 'DIRECTORY-SOURCES.md']) await cp(name, path.join(stage, name));
const notices = [];
async function licenses(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) await licenses(filename);
    else if (/^(LICENSE|LICENCE|NOTICE|COPYING)(\..*)?$/i.test(item.name)) notices.push('\n\n=== ' + filename + ' ===\n' + await readFile(filename, 'utf8'));
  }
}
await licenses('node_modules');
notices.push('\n\nBundled Vosk English model: Apache-2.0. Source and SHA-256:\n' + await readFile('assets/voice-model-source.json', 'utf8'));
await writeFile(path.join(stage, 'THIRD-PARTY-NOTICES.txt'), notices.join(''));
await mkdir('release', { recursive: true });
await createPackage(stage, 'release/app.asar');
await copyFile('START-HERE.md', 'release/START-HERE.md');
console.log('Packaged the cross-platform application resources.');

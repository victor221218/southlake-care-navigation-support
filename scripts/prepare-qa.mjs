// Development-only storage isolation. No test identity, tokens or auth bypass.
// The shipping package is built separately by package.mjs and never includes this bootstrap.
import { createPackage } from '@electron/asar';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const stage = path.resolve('.runtime/qa-stage');
await mkdir(stage, { recursive: true });
await cp('.runtime/app-stage', stage, { recursive: true });
const project = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'));
project.main = 'qa-bootstrap.cjs';
await writeFile(path.join(stage, 'package.json'), JSON.stringify(project));
await writeFile(path.join(stage, 'qa-bootstrap.cjs'), `process.env.HIVE_QA_DATA_DIR=require('node:path').join(require('node:path').dirname(process.execPath),'qa-user');
require('electron').app.commandLine.appendSwitch('force-renderer-accessibility');
require('./dist/main.cjs');\n`);
await createPackage(stage, '.runtime/qa-app.asar');
console.log('Prepared a separate local QA data folder. The shipping app was not modified.');

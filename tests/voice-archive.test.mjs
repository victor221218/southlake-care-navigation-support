import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('the shipped archive downloads, unpacks through Vosk and recognizes synthetic speech', { timeout: 60000 }, async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/check-voice-engine.mjs'], { timeout: 50000, maxBuffer: 1000000 });
  const report = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(report.archive_loader_checked, true);
  assert.match(report.heard, /find home support in aurora/i);
  assert.equal(report.microphone_opened, false);
});

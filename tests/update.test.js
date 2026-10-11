import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validatePackage, validateIdentity, requireNewerVersion } from '../electron/update-validation.js';
const exec = promisify(execFile);

test('updates reject same/older versions and unrelated products', () => {
  requireNewerVersion('0.0.10', '0.0.3');
  requireNewerVersion('1.0.0', '0.9.99');
  assert.throws(() => requireNewerVersion('0.0.3.0', '0.0.3'));
  assert.throws(() => requireNewerVersion('0.0.2', '0.0.3'));
  assert.throws(() => requireNewerVersion('garbage', '0.0.3'));
  assert.throws(() => validateIdentity('Another App', '1.0.0', '0.0.3'));
  validateIdentity('Prompt Manager', '0.0.4', '0.0.3');
});

test('package validation checks platform, extension, truncation and headers', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-update-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const exe = path.join(root, '新版.exe'), dmg = path.join(root, '新版.dmg');
  const bytes = Buffer.alloc(1024); bytes.write('MZ'); await fs.writeFile(exe, bytes);
  await validatePackage(exe, 'win32');
  await assert.rejects(validatePackage(exe, 'darwin'));
  await assert.rejects(validatePackage(exe, 'linux'));
  await fs.writeFile(dmg, bytes);
  await assert.rejects(validatePackage(dmg, 'darwin'));
  bytes.write('koly', 512); await fs.writeFile(dmg, bytes);
  await validatePackage(dmg, 'darwin');
  await fs.writeFile(exe, 'MZ'); await assert.rejects(validatePackage(exe, 'win32'));
});

for (const rollback of [false, true]) {
  test(`Mac helper ${rollback ? 'rolls back failed replacement' : 'keeps backup and installs staged application'} with quoted paths`, { skip: process.platform === 'win32' }, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt update ' 测试-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const target = path.join(root, 'Prompt Manager.app'), staged = path.join(root, 'staged.app'), backup = path.join(root, 'backup.app');
    await fs.mkdir(target); await fs.mkdir(staged);
    await fs.writeFile(path.join(target, 'version'), 'old'); await fs.writeFile(path.join(staged, 'version'), 'new');
    let script = await fs.readFile(new URL('../electron/mac-update.sh', import.meta.url), 'utf8');
    // Do not launch any applications during the transaction test.
    script = script.replaceAll('/usr/bin/open', '/usr/bin/true');
    if (rollback) script = script.replace('/bin/mv "$staged" "$target"', '/usr/bin/false');
    const helper = path.join(root, 'helper.sh'); await fs.writeFile(helper, script);
    const result = path.join(root, 'result.json');
    const args = [helper, '99999999', staged, target, backup, result, '{"success":true}', '{"success":false}', path.join(root, 'ready'), path.join(root, 'profile')];
    if (rollback) await assert.rejects(exec('/bin/sh', args)); else await exec('/bin/sh', args);
    assert.equal(await fs.readFile(path.join(target, 'version'), 'utf8'), rollback ? 'old' : 'new');
    assert.equal(JSON.parse(await fs.readFile(result, 'utf8')).success, !rollback);
    if (!rollback) assert.equal(await fs.readFile(path.join(backup, 'version'), 'utf8'), 'old');
  });
}

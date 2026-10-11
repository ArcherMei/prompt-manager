import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yauzl from 'yauzl';
import { Library } from '../electron/library.js';
import { compareFolders, copyCompared, exportWarehouse } from '../electron/folder-tools.js';
import { inventoryMatches } from '../electron/library-match.js';
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lora-folders-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const storage = path.join(root, '仓库'), deployment = path.join(root, 'ComfyUI');
  await fs.mkdir(storage); await fs.mkdir(deployment);
  return { root: await fs.realpath(root), storage: await fs.realpath(storage), deployment: await fs.realpath(deployment) };
}
async function unzip(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    const files = {};
    zip.on('error', reject); zip.on('end', () => resolve(files));
    zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = []; stream.on('error', reject); stream.on('data', c => chunks.push(c));
      stream.on('end', () => { files[entry.fileName] = Buffer.concat(chunks).toString(); zip.readEntry(); });
    })); zip.readEntry();
  }));
}
test('two roots compare actual content across subfolders, refuse conflicts, copy both directions', async t => {
  const { storage, deployment } = await setup(t);
  await fs.mkdir(path.join(deployment, '人物'));
  await fs.writeFile(path.join(storage, 'same.pt'), 'abc');
  await fs.writeFile(path.join(deployment, '人物', 'renamed.pt'), 'abc');
  await fs.writeFile(path.join(storage, 'conflict.pt'), 'aaa');
  await fs.writeFile(path.join(deployment, 'conflict.pt'), 'bbb');
  await fs.writeFile(path.join(storage, 'new.pt'), 'new');
  await fs.writeFile(path.join(storage, 'new.html'), '<h1>guide</h1>');
  await fs.writeFile(path.join(deployment, 'back.pt'), 'back');
  const c = await compareFolders(storage, deployment);
  assert.equal(c.rows.find(r => r.fileName === 'same.pt').state, 'both');
  assert.equal(c.rows.find(r => r.fileName === 'conflict.pt').state, 'conflict');
  const row = c.rows.find(r => r.fileName === 'new.pt');
  await assert.rejects(copyCompared(c, [row.id], 'storage', storage), /目标/);
  assert.equal((await copyCompared(c, [row.id], 'storage', path.join(deployment, '人物')))[0].copied, true);
  assert.deepEqual((await fs.readdir(path.join(deployment, '人物'))).sort(), ['new.pt', 'renamed.pt']);
  assert.equal((await copyCompared(c, [row.id], 'storage', path.join(deployment, '人物')))[0].copied, false);
  const back = c.rows.find(r => r.fileName === 'back.pt');
  assert.equal((await copyCompared(c, [back.id], 'deployment'))[0].copied, true);
  assert.equal(await fs.readFile(path.join(storage, 'back.pt'), 'utf8'), 'back');
  await assert.rejects(compareFolders(storage, storage), /不能/);
});
test('ZIP contains every model, HTML resource and Unicode subfolder plus metadata; refuses overwrite and self export', async t => {
  const { root, storage } = await setup(t);
  await fs.mkdir(path.join(storage, '角色', 'guide_files'), { recursive: true });
  await fs.writeFile(path.join(storage, '角色', '猫.pt'), 'model');
  await fs.writeFile(path.join(storage, '角色', 'guide.html'), '<img src="guide_files/image.png">');
  await fs.writeFile(path.join(storage, '角色', 'guide_files', 'image.png'), 'image');
  await fs.symlink('/etc/passwd', path.join(storage, 'external'));
  const output = path.join(root, 'export.zip');
  const result = await exportWarehouse(storage, output, { prompts: [{ id: 'p' }] });
  assert.equal(result.count, 3); assert.deepEqual(result.skipped, ['external']);
  const files = await unzip(output);
  assert.equal(files['LoRA仓库/角色/猫.pt'], 'model');
  assert.equal(files['LoRA仓库/角色/guide_files/image.png'], 'image');
  assert.equal(JSON.parse(files['软件关联记录.json']).prompts[0].id, 'p');
  await assert.rejects(exportWarehouse(storage, output, {}), /exist/i);
  await assert.rejects(exportWarehouse(storage, path.join(storage, 'bad.zip'), {}), /以外/);
});
test('existing repository is indexed in place and new model / HTML imports are flat with collision protection', async t => {
  const { root, storage } = await setup(t);
  await fs.writeFile(path.join(storage, 'cat.pt'), 'existing');
  await fs.writeFile(path.join(storage, 'cat.html'), 'guide');
  const library = new Library(path.join(root, 'db')); await library.load();
  await library.setDirectory('storage', storage);
  assert.equal(library.data.models[0].path, path.join(storage, 'cat.pt'));
  assert.equal(library.data.archives[0].modelId, library.data.models[0].id);
  await fs.writeFile(path.join(root, 'new.pt'), 'new');
  await fs.writeFile(path.join(root, 'usage.html'), 'usage');
  await library.importModels([path.join(root, 'new.pt')]);
  const model = library.data.models.find(m => m.fileName === 'new.pt');
  assert.equal(model.path, path.join(storage, 'new.pt'));
  await library.importArchive(path.join(root, 'usage.html'), model.id);
  assert.equal(library.data.archives.find(a => a.modelId === model.id).path, path.join(storage, 'usage.html'));
  await assert.rejects(library.importArchive(path.join(root, 'usage.html'), model.id), /同名/);
  assert.deepEqual((await fs.readdir(storage)).sort(), ['cat.html', 'cat.pt', 'new.pt', 'usage.html']);
});
test('legacy cleanup previews and moves only known numbered folders, preserving HTML resources and links', async t => {
  const { root, storage } = await setup(t);
  const library = new Library(path.join(root, 'db')); await library.load();
  const source = path.join(storage, 'model-id', 'cat.pt');
  const html = path.join(storage, 'model-id', 'html-archive-id', 'guide.html');
  await fs.mkdir(path.join(path.dirname(html), 'guide_files'), { recursive: true });
  await fs.writeFile(source, 'model'); await fs.writeFile(html, 'guide');
  await fs.writeFile(path.join(path.dirname(html), 'guide_files', 'image.png'), 'image');
  await library.commit({ ...library.data, storageDirectory: storage, models: [{ id: 'model-id', path: source, fileName: 'cat.pt' }], archives: [{ id: 'archive-id', path: html, fileName: 'guide.html', modelId: 'model-id' }], inventoryLinks: { [source]: { promptIds: ['p'], excluded: [] } } });
  assert.equal((await library.cleanupPreview()).length, 2);
  assert.equal(await fs.readFile(source, 'utf8'), 'model');
  await library.cleanupLegacy();
  assert.equal(await fs.readFile(path.join(storage, 'guide_files', 'image.png'), 'utf8'), 'image');
  assert.equal(library.data.models[0].path, path.join(storage, 'cat.pt'));
  assert.deepEqual(library.data.inventoryLinks[path.join(storage, 'cat.pt')].promptIds, ['p']);
  await assert.rejects(fs.access(source));
});
test('Main Note and Complex LoRA Tag match with field evidence, prose is not silently linked', () => {
  const files = [{ id: 'f', fileName: 'hero.pt', path: '/hero.pt', relativePath: 'hero.pt' }];
  const result = inventoryMatches(files, [{ id: 'a', note: 'hero.pt' }, { id: 'b', extraTag: '<lora:hero:1>' }, { id: 'c', note: 'hero for portraits' }]);
  assert.deepEqual(result[0].matches.map(p => p.id), ['a', 'b']);
  assert.match(result[0].matches[0].reason, /Main Note/);
  assert.match(result[0].matches[1].reason, /Complex LoRA Tag/);
});

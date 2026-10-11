import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Library } from '../electron/library.js';
import { matchPrompt } from '../electron/library-match.js';

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-library-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const library = new Library(path.join(directory, 'repository'));
  await library.load();
  return { directory, library };
}

test('recursive model import deduplicates, skips symlinks and reports missing files', async t => {
  const { directory, library } = await setup(t);
  const folder = path.join(directory, '模型');
  await fs.mkdir(path.join(folder, 'nested'), { recursive: true });
  const file = path.join(folder, 'nested', 'Cat.safetensors');
  await fs.writeFile(file, 'model');
  await fs.writeFile(path.join(folder, 'ignore.html'), 'not a model');
  await fs.symlink(folder, path.join(folder, 'loop'));
  assert.equal((await library.importModels([folder, file])).added, 1);
  assert.equal((await library.importModels([file])).added, 0);
  assert.equal((await library.list()).models[0].missing, false);
  await fs.unlink(file);
  assert.equal((await library.list()).models[0].missing, false, 'managed copy survives deleting source');
  await fs.unlink(library.data.models[0].path);
  assert.equal((await library.list()).models[0].missing, true);
  const reopened = new Library(library.root);
  await reopened.load();
  assert.equal(reopened.data.models.length, 1);
});

test('display rename preserves original file, tag matches and history', async t => {
  const { directory, library } = await setup(t);
  const file = path.join(directory, 'cat.safetensors');
  await fs.writeFile(file, 'model');
  await library.importModels([file]);
  const id = library.data.models[0].id;
  await library.rename(id, 'My Cat');
  await library.rename(id, '猫');
  const model = library.model(id);
  assert.equal(await fs.readFile(file, 'utf8'), 'model');
  assert.equal(matchPrompt({ text: '<lora:CAT:0.8>' }, model), 'Prompt 正文 中的 LoRA 名称：CAT');
  assert.equal(matchPrompt({ extraTag: '<lora:My Cat:1>' }, model), 'Complex LoRA Tag 中的 LoRA 名称：My Cat');
  assert.equal(matchPrompt({ subNote: 'C:\\Models\\cat.safetensors' }, model), '文件名与 Sub-Note 一致');
  assert.equal(matchPrompt({ text: '<lora:catgirl:1>' }, model), null);
  assert.equal(matchPrompt({ text: 'cats and dogs' }, model), null);
  await assert.rejects(library.rename(id, '  '));
  await assert.rejects(library.rename('unknown', 'test'));
});

test('HTML and companion resources survive source removal, links persist', async t => {
  const { directory, library } = await setup(t);
  const source = path.join(directory, 'source');
  await fs.mkdir(path.join(source, '网页_files'), { recursive: true });
  await fs.writeFile(path.join(source, '网页.html'), '<img src="网页_files/image.png">');
  await fs.writeFile(path.join(source, '网页_files', 'image.png'), 'image-data');
  await fs.symlink('/etc/passwd', path.join(source, '网页_files', 'external'));
  await fs.writeFile(path.join(directory, 'model.pt'), 'model');
  await library.importModels([path.join(directory, 'model.pt')]);
  await library.importArchive(path.join(source, '网页.html'), library.data.models[0].id);
  await fs.rm(source, { recursive: true });
  const archive = library.data.archives[0];
  const saved = library.archivePath(archive.id);
  assert.equal(await fs.readFile(saved, 'utf8'), '<img src="网页_files/image.png">');
  assert.equal(await fs.readFile(path.join(path.dirname(saved), '网页_files', 'image.png'), 'utf8'), 'image-data');
  await assert.rejects(fs.access(path.join(path.dirname(saved), '网页_files', 'external')));
  await library.linkArchive(archive.id, null);
  const reopened = new Library(library.root);
  await reopened.load();
  assert.equal(reopened.data.archives[0].modelId, null);
  assert.throws(() => library.archivePath('../escape'));
  await assert.rejects(library.linkArchive(archive.id, 'invalid'));
});

test('invalid database is not silently replaced', async t => {
  const { library } = await setup(t);
  await fs.writeFile(library.dbPath, '{broken');
  await assert.rejects(library.load());
  assert.equal(await fs.readFile(library.dbPath, 'utf8'), '{broken');
});

test('selecting storage leaves existing model and HTML untouched; deployment copies only the model and refuses conflicts', async t => {
  const { directory, library } = await setup(t);
  const source = path.join(directory, 'detail.safetensors');
  const html = path.join(directory, 'usage.html');
  await fs.writeFile(source, 'original-model');
  await fs.writeFile(html, '<h1>Instructions</h1>');
  await library.importModels([source]);
  const id = library.data.models[0].id;
  await library.importArchive(html, id);
  const storage = path.join(directory, '我的仓库');
  const target = path.join(directory, 'AI LoRA');
  await fs.mkdir(storage); await fs.mkdir(target);
  const oldModelPath = library.model(id).path;
  await library.setDirectory('storage', storage);
  assert.equal(library.model(id).path, oldModelPath, 'selecting a folder never migrates files');
  assert.deepEqual(await fs.readdir(storage), []);
  assert.equal(await fs.readFile(library.model(id).path, 'utf8'), 'original-model');
  const archived = library.archivePath(library.data.archives[0].id);
  assert.ok(archived.startsWith(path.dirname(library.model(id).path)));
  assert.equal(await fs.readFile(archived, 'utf8'), '<h1>Instructions</h1>');
  await library.setDirectory('deployment', target);
  assert.equal((await library.deploy(id)).copied, true);
  assert.deepEqual(await fs.readdir(target), ['detail.safetensors']);
  assert.equal((await library.deploy(id)).copied, false);
  await fs.writeFile(path.join(target, 'detail.safetensors'), 'different-model');
  await assert.rejects(library.deploy(id), /不会覆盖/);
  assert.equal(await fs.readFile(path.join(target, 'detail.safetensors'), 'utf8'), 'different-model');
  const reopened = new Library(library.root); await reopened.load();
  assert.equal(reopened.data.deploymentDirectory, await fs.realpath(target));
  assert.equal(reopened.data.storageDirectory, await fs.realpath(storage));
});

test('existing LoRA inventory is recursive, read-only, and manual links survive restart', async t => {
  const { directory, library } = await setup(t);
  const root = path.join(directory, 'existing');
  await fs.mkdir(path.join(root, '人物', '二级'), { recursive: true });
  const file = path.join(root, '人物', '二级', 'hero.SAFETENSORS');
  await fs.writeFile(file, 'existing model');
  await fs.writeFile(path.join(root, 'usage.html'), 'html');
  await fs.symlink(root, path.join(root, 'loop'));
  await library.setDirectory('deployment', root);
  const inventory = await library.scanInventory();
  assert.equal(inventory.files.length, 1);
  assert.equal(inventory.files[0].relativePath, path.join('人物', '二级', 'hero.SAFETENSORS'));
  assert.equal(library.data.models.length, 0, 'scan does not import or copy models');
  await library.linkPrompt(inventory.files[0].id, 'p-1', 'link');
  await library.linkPrompt(inventory.files[0].id, 'p-1', 'link');
  const reopened = new Library(library.root); await reopened.load();
  const rescanned = await reopened.scanInventory();
  assert.equal(rescanned.files[0].id, inventory.files[0].id);
  assert.deepEqual(reopened.data.inventoryLinks[inventory.files[0].path].promptIds, ['p-1']);
  await reopened.linkPrompt(rescanned.files[0].id, 'p-1', 'unlink');
  assert.deepEqual(reopened.data.inventoryLinks[inventory.files[0].path], { promptIds: [], excluded: ['p-1'] });
  await reopened.linkPrompt(rescanned.files[0].id, 'p-1', 'auto');
  assert.deepEqual(reopened.data.inventoryLinks[inventory.files[0].path], { promptIds: [], excluded: [] });
  assert.equal(await fs.readFile(file, 'utf8'), 'existing model');
  await fs.unlink(file);
  await assert.rejects(reopened.linkPrompt(rescanned.files[0].id, 'p-1', 'link'));
  assert.equal((await reopened.scanInventory()).files.length, 0);
  await assert.rejects(reopened.linkPrompt('missing', 'p-1', 'link'));
});

test('inventory follows configured AI directory before any copies are imported', async t => {
  const { directory, library } = await setup(t);
  const target = path.join(directory, 'AI'); await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'existing.pt'), 'model');
  await library.setDirectory('deployment', target);
  assert.equal((await library.scanInventory()).files.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { TagDatabase, validateSelection } from '../electron/tag-database.js';
import { lmEndpoint, lmRequest } from '../electron/tag-lm.js';
import { Worker } from 'node:worker_threads';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tags-'));
  const db = new TagDatabase(path.join(dir, 'tags.sqlite'));
  t.after(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });
  const tags = path.join(dir, 'tags.csv.gz'), aliases = path.join(dir, 'aliases.csv');
  await writeFile(tags, gzipSync('name,category,post_count,is_deprecated\nwall,0,200,false\nsquatting,0,100,false\ncorner,0,50,false\nold_tag,0,5,true\n'));
  await writeFile(aliases, 'antecedent_name,consequent_name,status\ncrouch,squatting,active\ncrouching,crouch,active\nold,wall,deleted\nloop_a,loop_b,active\nloop_b,loop_a,active\n');
  await db.importFiles(tags, aliases);
  return { db, dir, tags, aliases };
}
test('imports gzip CSV, resolves active alias chains, excludes deprecated tags and cycles', async t => {
  const { db } = await fixture(t);
  assert.equal(db.status().tags, 3);
  assert.equal(db.resolve('Crouching').name, 'squatting');
  assert.equal(db.resolve('old'), null);
  assert.equal(db.resolve('old_tag'), null);
  assert.equal(db.resolve('loop_a'), null);
  assert.deepEqual(db.candidates(['wall']).map(t => t.name), ['wall']);
});
test('failed imports roll back all tables and timestamp, including damaged gzip', async t => {
  const { db, tags, aliases } = await fixture(t);
  const before = db.status();
  await writeFile(aliases, 'wrong\nvalue\n');
  await assert.rejects(db.importFiles(tags, aliases));
  assert.deepEqual(db.status(), before);
  assert.equal(db.resolve('crouching').name, 'squatting');
  await writeFile(tags, 'broken gzip');
  await assert.rejects(db.importFiles(tags, aliases));
  assert.deepEqual(db.status(), before);
});
test('hallucinated and out-of-candidate tags reject the whole group; aliases deduplicate', async t => {
  const { db } = await fixture(t);
  const candidates = db.candidates(['squatting', 'wall']);
  assert.equal(validateSelection(db, { tags: ['wall', 'made_up'] }, candidates).tags.length, 0);
  assert.equal(validateSelection(db, { tags: ['corner'] }, candidates).kind, 'not-found');
  assert.equal(validateSelection(db, { tags: ['crouching', 'squatting'] }, candidates).tags.length, 1);
  assert.equal(validateSelection(db, { tags: ['wall', 'squatting'] }, candidates).kind, 'combination');
  assert.equal(validateSelection(db, { tags: [] }, candidates).kind, 'not-found');
  assert.throws(() => validateSelection(db, {}, candidates));
  assert.deepEqual(db.candidates(['" OR * --']), []);
});
test('API accepts local and LAN hosts while rejecting invalid URLs', async () => {
  for (const url of ['file:///v1', 'ftp://localhost/v1', 'http://0.0.0.0:1234/v1', 'http://[::]:1234/v1', 'http://localhost/v1?redirect=x', 'http://user:pass@localhost/v1', 'http://localhost/admin']) assert.throws(() => lmEndpoint(url));
  assert.equal(lmEndpoint('http://localhost:1234/v1/'), 'http://localhost:1234/v1');
  const result = await lmRequest({ endpoint: 'http://127.0.0.1:1234/v1' }, 'models', null, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:1234/v1/models');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ data: [{ id: 'large-local-model' }] }) };
  });
  assert.equal(result.data[0].id, 'large-local-model');
  await assert.rejects(lmRequest({}, 'models', null, async () => ({ ok: false, status: 401 })), /401/);
});
test('worker returns exact matches without an LM server and rejects empty DB / invalid input', async t => {
  const { dir, tags, aliases } = await fixture(t);
  const worker = new Worker(new URL('../electron/tag-worker.js', import.meta.url), { workerData: { file: path.join(dir, 'worker.sqlite') } });
  t.after(() => worker.terminate());
  let id = 0;
  const call = (action, args) => new Promise((resolve, reject) => {
    worker.once('message', resolve); worker.once('error', reject); worker.postMessage({ id: ++id, action, args });
  });
  assert.match((await call('search', { query: 'wall', settings: {} })).error, /导入/);
  assert.equal((await call('import', [tags, aliases])).data.tags, 3);
  const exact = await call('search', { query: 'crouching', settings: {} });
  assert.equal(exact.data.kind, 'exact'); assert.equal(exact.data.tags[0].name, 'squatting');
  assert.match((await call('search', { query: '', settings: {} })).error, /500/);
  await worker.terminate();
});

test('Chinese lookup sends selected large model, rejects hallucinations and malformed replies', async t => {
  const { createServer } = await import('node:http');
  const { dir, tags, aliases } = await fixture(t);
  let mode = 'valid', calls = 0;
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    assert.equal(body.model, 'local-27b'); assert.equal(body.stream, false);
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.query, '蹲在墙角'); calls++;
    const content = mode === 'malformed' ? 'not JSON' : JSON.stringify(input.candidates ? { tags: mode === 'hallucinated' ? ['wall', 'invented_tag'] : ['squatting', 'wall'] } : { terms: ['squatting', 'wall'] });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const worker = new Worker(new URL('../electron/tag-worker.js', import.meta.url), { workerData: { file: path.join(dir, 'lm.sqlite') } });
  t.after(() => worker.terminate());
  let id = 0;
  const call = (action, args) => new Promise((resolve, reject) => {
    const error = err => { worker.off('message', message); reject(err); };
    const message = value => { worker.off('error', error); resolve(value); };
    worker.once('message', message); worker.once('error', error); worker.postMessage({ id: ++id, action, args });
  });
  await call('import', [tags, aliases]);
  const args = { query: '蹲在墙角', settings: { model: 'local-27b', endpoint: `http://127.0.0.1:${server.address().port}/v1` } };
  const valid = await call('search', args);
  assert.equal(valid.data.kind, 'combination'); assert.equal(valid.data.tags.length, 2); assert.equal(calls, 2);
  mode = 'hallucinated'; assert.equal((await call('search', args)).data.tags.length, 0);
  mode = 'malformed'; assert.match((await call('search', args)).error, /JSON/);
  await worker.terminate();
});
test('downloader uses descending cursors and only completes successful tables', async t => {
  const { downloadTable } = await import('../scripts/download-danbooru.js');
  const { readFile } = await import('node:fs/promises');
  const { dir } = await fixture(t);
  let page = 0;
  await downloadTable('tags', dir, async url => {
    if (page) assert.equal(url.searchParams.get('page'), 'b9');
    return { ok: true, status: 200, json: async () => page++ ? [] : [{ id: 9, name: 'wall', category: 0, post_count: 200, is_deprecated: false }] };
  }, async () => {});
  assert.match(await readFile(path.join(dir, 'tags.csv'), 'utf8'), /wall/);
  await assert.rejects(downloadTable('tag_aliases', dir, async () => ({ ok: false, status: 403 }), async () => {}), /403/);
  await assert.rejects(readFile(path.join(dir, 'tag_aliases.csv')), /ENOENT/);
});

test('Windows client can target Mac LAN IP or hostname with authentication', async () => {
  for (const endpoint of ['http://192.168.1.20:1234/v1', 'http://10.0.0.20:1234/v1', 'http://mac-studio.local:1234/v1', 'https://mac.example.test/v1', 'http://[fd00::20]:1234/v1']) {
    assert.equal(lmEndpoint(endpoint + '/'), endpoint);
    await lmRequest({ endpoint, token: 'test-token' }, 'chat/completions', { model: 'mac-27b' }, async (url, options) => {
      assert.equal(url, endpoint + '/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(JSON.parse(options.body).model, 'mac-27b');
      assert.equal(options.redirect, 'error');
      return { ok: true, json: async () => ({ choices: [] }) };
    });
  }
});
test('LAN connection failures distinguish unreachable host, timeout, and auth errors', async () => {
  const settings = { endpoint: 'http://192.168.1.20:1234/v1' };
  await assert.rejects(lmRequest(settings, 'models', null, async () => { throw new TypeError('fetch failed'); }), /Serve on Local Network/);
  await assert.rejects(lmRequest(settings, 'models', null, async () => { throw new DOMException('timeout', 'TimeoutError'); }), /连接超时/);
  await assert.rejects(lmRequest(settings, 'chat/completions', {}, async () => { throw new DOMException('timeout', 'TimeoutError'); }), /模型/);
  await assert.rejects(lmRequest(settings, 'models', null, async () => ({ ok: false, status: 401 })), /401/);
});

test('scene and optional image reach both stages; existing weighted aliases are excluded', async t => {
  const { createServer } = await import('node:http');
  const { existingNames, validateImage } = await import('../electron/tag-prompts.js');
  const { db, dir, tags, aliases } = await fixture(t);
  assert.deepEqual([...existingNames(db, '(crouching:1.2), wall')], ['squatting', 'wall']);
  assert.throws(() => validateImage('https://example.com/image.png'), /参考图/);
  assert.throws(() => validateImage('data:image/svg+xml;base64,AAAA'), /参考图/);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
  let calls = 0, withImage = true, excluded = false, hallucinated = false;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), content = body.messages[1].content;
    assert.equal(Array.isArray(content), withImage);
    if (withImage) assert.equal(content[1].image_url.url, image);
    const input = JSON.parse(withImage ? content[0].text : content);
    assert.equal(input.scene, '雨夜小巷，只补墙角');
    assert.equal(input.existingTags, '(crouching:1.2), wall');
    assert.match(body.messages[0].content, /existingTags/);
    calls++;
    if (input.candidates) {
      assert.deepEqual(input.candidates.map(x => x.name), ['corner']); excluded = true;
    }
    const output = input.candidates ? { tags: hallucinated ? ['corner', 'made_up'] : ['corner'], note: '补充墙角；姿势已在已有标签中。' } : { terms: ['crouching', 'wall', 'corner'] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const worker = new Worker(new URL('../electron/tag-worker.js', import.meta.url), { workerData: { file: path.join(dir, 'context.sqlite') } });
  t.after(() => worker.terminate());
  let id = 0;
  const call = (action, args) => new Promise((resolve, reject) => {
    const error = err => { worker.off('message', message); reject(err); };
    const message = value => { worker.off('error', error); resolve(value); };
    worker.once('message', message); worker.once('error', error); worker.postMessage({ id: ++id, action, args });
  });
  await call('import', [tags, aliases]);
  const args = { query: 'corner', scene: '雨夜小巷，只补墙角', existingTags: '(crouching:1.2), wall', image, settings: { model: 'vision-model', endpoint: `http://127.0.0.1:${server.address().port}/v1` } };
  const result = await call('search', args);
  assert.equal(result.data.kind, 'suggestion');
  assert.equal(result.data.tags[0].name, 'corner');
  assert.match(result.data.note, /姿势/); assert.equal(calls, 2); assert.ok(excluded);
  withImage = false;
  assert.equal((await call('search', { ...args, image: '' })).data.tags[0].name, 'corner');
  hallucinated = true;
  const rejected = await call('search', { ...args, image: '' });
  assert.equal(rejected.data.tags.length, 0); assert.equal(rejected.data.note, undefined);
  const before = calls;
  assert.match((await call('search', { ...args, image: 'file:///private.png' })).error, /参考图/);
  assert.match((await call('search', { ...args, scene: 'x'.repeat(4001) })).error, /4000/);
  assert.equal(calls, before);
  assert.match((await call('prompts')).data.selection, /spatial relationship/);
  await worker.terminate();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryMatches } from '../electron/library-match.js';

const files = [
  { id: 'a', path: '/models/one/cat.safetensors', relativePath: 'one/cat.safetensors', fileName: 'cat.safetensors', name: 'cat' },
  { id: 'b', path: '/models/two/cat.safetensors', relativePath: 'two/cat.safetensors', fileName: 'cat.safetensors', name: 'cat' },
  { id: 'c', path: '/models/人物/hero.pt', relativePath: '人物/hero.pt', fileName: 'hero.pt', name: 'hero' },
];

test('automatic matching handles nested paths and refuses ambiguous basenames or substrings', () => {
  const prompts = [{ id: '1', text: '<lora:cat:1>' }, { id: '2', text: '<lora:one\\CAT:0.8>' }, { id: '3', text: '<lora:HERO:1>' }, { id: '4', text: 'catgirl' }];
  const result = inventoryMatches(files, prompts);
  assert.deepEqual(result.map(f => f.matches.map(p => p.id)), [['2'], [], ['3']]);
  assert.equal(result[0].duplicateName, true);
});

test('manual links allow different names, exclusions override automatic matches and stale ids do not mark matched', () => {
  const prompts = [{ id: 'manual', text: 'my favorite character' }, { id: 'auto', text: '<lyco:hero:1>' }];
  const links = { [files[2].path]: { promptIds: ['manual', 'deleted'], excluded: ['auto'] } };
  assert.deepEqual(inventoryMatches(files, prompts, links)[2].matches.map(p => [p.id, p.reason]), [['manual', '手动匹配']]);
  assert.equal(inventoryMatches(files, [], links)[2].matches.length, 0);
  assert.equal(inventoryMatches(files, prompts, {})[2].matches[0].id, 'auto');
});

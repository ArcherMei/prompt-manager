import { parentPort, workerData } from 'node:worker_threads';
import { TagDatabase, validateSelection } from './tag-database.js';
import { askJSON, lmRequest } from './tag-lm.js';
import { EXPANSION_PROMPT, SELECTION_PROMPT, existingNames, validateImage } from './tag-prompts.js';
const db = new TagDatabase(workerData.file);
async function dispatch(action, args) {
  if (action === 'prompts') return { expansion: EXPANSION_PROMPT, selection: SELECTION_PROMPT };
  if (action === 'status') return db.status();
  if (action === 'import') return db.importFiles(...args);
  if (action === 'models') {
    const result = await lmRequest(args, 'models');
    return (result.data || []).filter(m => typeof m.id === 'string').map(m => m.id);
  }
  if (action === 'search') {
    const { query, settings, scene = '', existingTags = '', image = '' } = args;
    if (typeof scene !== 'string' || scene.length > 4000 || typeof existingTags !== 'string' || existingTags.length > 12000) throw new Error('场景最多 4000 字，已有 tags 最多 12000 字');
    validateImage(image);
    if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('请输入 1–500 字的查询');
    if (!db.status().tags) throw new Error('请先导入标签数据库');
    const existing = existingNames(db, existingTags);
    const exact = !scene.trim() && !existingTags.trim() && !image ? db.resolve(query) : null;
    const input = { query, scene, existingTags };
    if (exact) return { kind: 'exact', tags: [exact] };
    const expansion = await askJSON(settings, EXPANSION_PROMPT, input, image);
    if (!Array.isArray(expansion.terms) || expansion.terms.length > 12 || expansion.terms.some(t => typeof t !== 'string' || t.length > 120)) throw new Error('模型搜索词格式错误');
    const candidates = db.candidates([...expansion.terms, query]).filter(tag => !existing.has(tag.name));
    if (!candidates.length) return { kind: 'not-found', tags: [], note: '本次检索未找到可补充的新标签；已有标签不会重复推荐。' };
    const selection = await askJSON(settings, SELECTION_PROMPT, { ...input, candidates }, image);
    const result = validateSelection(db, selection, candidates);
    if (!result.rejected?.length && typeof selection.note === 'string') result.note = selection.note.slice(0, 1200);
    return result;
  }
  throw new Error('未知操作');
}
let queue = Promise.resolve();
parentPort.on('message', ({ id, action, args }) => {
  queue = queue.then(async () => {
    try { parentPort.postMessage({ id, data: await dispatch(action, args) }); }
    catch (error) { parentPort.postMessage({ id, error: error.message }); }
  });
});

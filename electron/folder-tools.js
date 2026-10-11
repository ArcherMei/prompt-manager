import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { scanModels } from './inventory.js';

export const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function compareFolders(storage, deployment) {
  if (!storage || !deployment) throw new Error('请先选择 LoRA 仓库文件夹和 ComfyUI 的 LoRA 模型文件夹。');
  const a = await scanModels(storage), b = await scanModels(deployment);
  if (inside(a.directory, b.directory) || inside(b.directory, a.directory)) throw new Error('两个文件夹不能相同，也不能互相包含。');
  if (a.warnings.length || b.warnings.length) throw new Error(`无法完整核对，请先处理无法读取的路径：\n${[...a.warnings, ...b.warnings].join('\n')}`);
  const cache = new Map();
  async function digest(file) {
    if (!cache.has(file.path)) cache.set(file.path, await hashFile(file.path));
    return cache.get(file.path);
  }
  const rows = [];
  for (const [side, source, other] of [['storage', a, b], ['deployment', b, a]]) {
    for (const file of source.files) {
      const peers = [];
      for (const candidate of other.files.filter(f => f.size === file.size)) {
        if (await digest(file) === await digest(candidate)) peers.push(candidate.relativePath);
      }
      const conflicts = other.files.filter(f => f.fileName.toLowerCase() === file.fileName.toLowerCase() && !peers.includes(f.relativePath)).map(f => f.relativePath);
      rows.push({ ...file, side, state: peers.length ? 'both' : conflicts.length ? 'conflict' : 'missing', peers, conflicts });
    }
  }
  return { storage: a.directory, deployment: b.directory, rows };
}

export async function copyCompared(comparison, ids, side, destinationFolder) {
  if (!comparison || !['storage', 'deployment'].includes(side) || !Array.isArray(ids) || !ids.length) throw new Error('请先核对两个文件夹，再勾选要复制的模型。');
  const root = side === 'storage' ? comparison.deployment : comparison.storage;
  const sourceRoot = side === 'storage' ? comparison.storage : comparison.deployment;
  const destination = await fs.realpath(destinationFolder || root);
  if (!inside(root, destination)) throw new Error('复制目标必须位于对应的 LoRA 文件夹内。');
  const results = [];
  for (const id of new Set(ids)) {
    const file = comparison.rows.find(f => f.id === id && f.side === side && f.state === 'missing');
    if (!file) throw new Error('所选模型已变化或存在同名冲突，请重新核对。');
    const source = await fs.realpath(file.path);
    if (source !== file.path || !inside(sourceRoot, source)) throw new Error('来源路径已变化，请重新核对。');
    const target = path.join(destination, file.fileName);
    try {
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      if (await hashFile(source) !== await hashFile(target)) { await fs.unlink(target); throw new Error('复制校验失败'); }
      results.push({ source, target, copied: true });
    } catch (error) { results.push({ source, target, copied: false, error: error.code === 'EEXIST' ? '目标已有同名文件，未覆盖' : error.message }); }
  }
  return results;
}

// Copy only the HTML and its browser-created resource folders, never its parent folder.
export async function copyHtml(source, directory) {
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, path.basename(source));
  if (path.resolve(source) === path.resolve(target)) return { target, created: [] };
  const pairs = [[source, target]];
  for (const suffix of ['_files', '.files']) {
    const from = path.join(path.dirname(source), path.parse(source).name + suffix);
    const stat = await fs.lstat(from).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (stat?.isSymbolicLink()) throw new Error(`网页资源不能是符号链接：${from}`);
    if (stat?.isDirectory()) pairs.push([from, path.join(directory, path.basename(from))]);
  }
  for (const [, to] of pairs) {
    const exists = await fs.lstat(to).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (exists) throw new Error(`目标已有同名网页或资源，未覆盖：${to}`);
  }
  const created = [];
  try {
    for (const [from, to] of pairs) {
      if ((await fs.lstat(from)).isDirectory()) {
        await fs.mkdir(to); created.push(to);
        for (const name of await fs.readdir(from)) await fs.cp(path.join(from, name), path.join(to, name), { recursive: true, force: false, errorOnExist: true, filter: async f => !(await fs.lstat(f)).isSymbolicLink() });
      } else { await fs.copyFile(from, to, constants.COPYFILE_EXCL); created.push(to); }
    }
    return { target, created };
  } catch (error) { for (const item of created.reverse()) await fs.rm(item, { recursive: true, force: true }); throw error; }
}

export async function exportWarehouse(root, output, metadata) {
  root = await fs.realpath(root);
  const parent = await fs.realpath(path.dirname(output));
  output = path.join(parent, path.basename(output));
  if (inside(root, output)) throw new Error('ZIP 保存位置请选择 LoRA 仓库文件夹以外的位置，避免把备份再次打包。');
  const entries = [];
  const skipped = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) { skipped.push(path.relative(root, file)); continue; }
      if (stat.isDirectory()) await visit(file);
      else if (stat.isFile()) entries.push(file);
    }
  }
  await visit(root);
  const temp = path.join(parent, `.lora-export-${randomUUID()}.tmp`);
  const zip = new yazl.ZipFile();
  const stream = createWriteStream(temp, { flags: 'wx' });
  zip.on('error', error => zip.outputStream.destroy(error));
  const done = pipeline(zip.outputStream, stream);
  try {
    for (const file of entries) zip.addFile(file, `LoRA仓库/${path.relative(root, file).split(path.sep).join('/')}`, { compress: false });
    zip.addBuffer(Buffer.from(JSON.stringify({ ...metadata, exportedAt: new Date().toISOString(), skipped }, null, 2)), '软件关联记录.json');
    zip.end({ forceZip64Format: true });
    await done;
    await fs.copyFile(temp, output, constants.COPYFILE_EXCL);
    return { output, count: entries.length, skipped };
  } catch (error) { zip.outputStream.destroy(); await done.catch(() => {}); throw error; }
  finally { await fs.rm(temp, { force: true }); }
}

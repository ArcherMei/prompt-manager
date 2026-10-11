import fs from 'node:fs/promises';
import { scanModels } from './inventory.js';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { hashFile, inside, copyHtml, compareFolders, copyCompared, exportWarehouse } from './folder-tools.js';

const modelExtensions = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf']);
export class Library {
  constructor(root) {
    this.root = root;
    this.dbPath = path.join(root, 'library.json');
    this.data = { models: [], archives: [], inventoryLinks: {}, inventoryDirectory: null, storageDirectory: path.join(root, 'files'), deploymentDirectory: null };
  }

  async load() {
    await fs.mkdir(this.root, { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.dbPath, 'utf8'));
      if (!Array.isArray(data.models) || !Array.isArray(data.archives)) throw new Error('仓库数据格式错误');
      this.data = { ...this.data, ...data };
      if (!this.data.deploymentDirectory && data.inventoryDirectory) this.data.deploymentDirectory = data.inventoryDirectory;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async commit(data) {
    const temp = `${this.dbPath}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2));
    await fs.rename(temp, this.dbPath);
    this.data = data;
  }

  model(id) {
    const model = this.data.models.find(item => item.id === id);
    if (!model) throw new Error('找不到 LoRA 记录');
    return model;
  }

  async list() {
    return {
      ...this.data,
      archives: this.data.archives.filter(a => inside(this.data.storageDirectory, a.path || this.archivePath(a.id))),
      models: await Promise.all(this.data.models.filter(m => inside(this.data.storageDirectory, m.path)).map(async model => {
        try { await fs.access(model.path); return { ...model, missing: false }; }
        catch { return { ...model, missing: true }; }
      })),
    };
  }

  async setDirectory(kind, directory) {
    if (!['storage', 'deployment'].includes(kind)) throw new Error('无效的目录类型');
    const real = await fs.realpath(directory);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('请选择文件夹');
    await fs.access(real, constants.R_OK | constants.W_OK);
    if (kind === 'deployment') {
      if (inside(real, this.data.storageDirectory) || inside(this.data.storageDirectory, real)) throw new Error('ComfyUI 模型文件夹与 LoRA 仓库文件夹不能相同或互相包含。');
      await this.commit({ ...this.data, deploymentDirectory: real });
      this.comparison = null;
      return;
    }
    const other = this.data.deploymentDirectory;
    if (other && (inside(real, other) || inside(other, real))) throw new Error('LoRA 仓库文件夹与 ComfyUI 模型文件夹不能相同或互相包含。');
    // Selecting an existing repository indexes it in place; it never migrates files.
    await this.commit({ ...this.data, storageDirectory: real });
    this.comparison = null;
    await this.refreshRepository();
  }

  async refreshRepository() {
    await fs.mkdir(this.data.storageDirectory, { recursive: true });
    const inventory = await scanModels(this.data.storageDirectory);
    const models = [...this.data.models];
    const archives = [...this.data.archives];
    for (const file of inventory.files) {
      if (!models.some(m => m.path === file.path)) models.push({ ...file, id: randomUUID(), aliases: [], createdAt: new Date().toISOString() });
    }
    async function visit(folder) {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile() && /\.html?$/i.test(entry.name) && !archives.some(a => a.path === file)) {
          const candidates = models.filter(m => path.dirname(m.path) === folder && path.parse(m.fileName).name.toLowerCase() === path.parse(entry.name).name.toLowerCase());
          archives.push({ id: randomUUID(), path: file, fileName: entry.name, title: path.parse(entry.name).name, modelId: candidates.length === 1 ? candidates[0].id : null, createdAt: new Date().toISOString() });
        }
      }
    }
    await visit(inventory.directory);
    if (models.length !== this.data.models.length || archives.length !== this.data.archives.length) await this.commit({ ...this.data, models, archives });
  }

  async compare() {
    this.comparison = await compareFolders(this.data.storageDirectory, this.data.deploymentDirectory);
    return this.comparison;
  }

  async copyMissing(ids, side, directory) {
    const results = await copyCompared(this.comparison, ids, side, directory);
    await this.refreshRepository();
    this.comparison = null;
    return results;
  }

  async exportZip(output, prompts) {
    return exportWarehouse(this.data.storageDirectory, output, { library: this.data, prompts });
  }

  async scanInventory(side = 'deployment') {
    if (!['storage', 'deployment'].includes(side)) throw new Error('请选择 LoRA 仓库或 ComfyUI 文件夹');
    const directory = side === 'storage' ? this.data.storageDirectory : this.data.deploymentDirectory;
    if (!directory) return { files: [], directory: '', warnings: [], side };
    await this.refreshRepository();
    const inventory = await scanModels(directory);
    inventory.files = inventory.files.map(file => {
      const managed = this.data.models.find(model => model.path === file.path || model.sourcePath === file.path);
      return managed ? { ...file, name: managed.name, aliases: managed.aliases } : file;
    });
    inventory.side = side;
    inventory.files = inventory.files.map(file => ({ ...file, htmlPaths: this.data.archives.filter(a => this.data.models.some(m => m.id === a.modelId && m.path === file.path)).map(a => a.path) }));
    this.inventory = inventory;
    return inventory;
  }

  async linkPrompt(fileId, promptId, mode) {
    if (typeof promptId !== 'string' || !promptId || !['link', 'unlink', 'auto'].includes(mode)) throw new Error('无效的匹配操作');
    const file = this.inventory?.files.find(item => item.id === fileId);
    if (!file) throw new Error('文件列表已变化，请重新扫描后匹配');
    await fs.access(file.path);
    const links = { ...this.data.inventoryLinks };
    const previous = links[file.path] || {};
    const promptIds = new Set(previous.promptIds || []);
    const excluded = new Set(previous.excluded || []);
    promptIds.delete(promptId); excluded.delete(promptId);
    if (mode === 'link') promptIds.add(promptId);
    if (mode === 'unlink') excluded.add(promptId);
    links[file.path] = { promptIds: [...promptIds], excluded: [...excluded] };
    await this.commit({ ...this.data, inventoryLinks: links });
  }

  async deploy(id) {
    const model = this.model(id);
    if (!this.data.deploymentDirectory) throw new Error('请先选择本地 AI 的 LoRA 目录');
    const destination = path.join(this.data.deploymentDirectory, model.fileName);
    try {
      await fs.access(destination);
      const sourceHash = await hashFile(model.path);
      if (sourceHash === await hashFile(destination)) return { copied: false, destination };
      throw new Error(`目标目录已有不同内容的同名文件：${model.fileName}。请先在文件管理器中处理，软件不会覆盖它。`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Exclusive creation prevents overwriting a file that appears after checking.
    await fs.copyFile(model.path, destination, constants.COPYFILE_EXCL);
    return { copied: true, destination };
  }

  async importModels(selected) {
    const models = [...this.data.models];
    const known = new Set(models.flatMap(item => [item.path, item.sourcePath].filter(Boolean)));
    const warnings = [];
    let added = 0;
    const storageDirectory = this.data.storageDirectory;
    await fs.mkdir(storageDirectory, { recursive: true });
    const realStorage = await fs.realpath(storageDirectory);
    const created = [];
    async function visit(file) {
      try {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) return;
        if (stat.isDirectory()) {
          for (const name of await fs.readdir(file)) await visit(path.join(file, name));
        } else if (stat.isFile() && modelExtensions.has(path.extname(file).toLowerCase())) {
          const real = await fs.realpath(file);
          if (known.has(real)) return;
          const fileName = path.basename(real);
          const id = randomUUID();
          const target = inside(realStorage, real) ? real : path.join(storageDirectory, fileName);
          if (target !== real) { await fs.copyFile(real, target, constants.COPYFILE_EXCL); created.push(target); }
          known.add(real);
          models.push({ id, name: path.parse(fileName).name, fileName, path: target, sourcePath: real, size: stat.size, aliases: [], createdAt: new Date().toISOString() });
          added++;
        }
      } catch (error) { warnings.push(`${file}: ${error.message}`); }
    }
    for (const selectedPath of selected) await visit(selectedPath);
    try { await this.commit({ ...this.data, models }); }
    catch (error) {
      for (const folder of created) await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
    return { added, warnings };
  }

  async rename(id, name) {
    const model = this.model(id);
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('请输入 1–200 字的名称');
    const updated = { ...model, name: name.trim(), aliases: [...new Set([...model.aliases, model.name])] };
    await this.commit({ ...this.data, models: this.data.models.map(item => item.id === id ? updated : item) });
  }

  async importArchive(source, modelId = null) {
    if (modelId) this.model(modelId);
    if (!/\.html?$/i.test(source) || !(await fs.lstat(source)).isFile()) throw new Error('请选择 HTML 文件');
    const id = randomUUID();
    const model = modelId ? this.model(modelId) : null;
    const directory = model ? path.dirname(model.path) : this.data.storageDirectory;
    const { target, created } = await copyHtml(source, directory);
    try {
      const existing = this.data.archives.find(a => a.path === target);
      const archive = { id: existing?.id || id, title: path.parse(source).name, fileName: path.basename(source), path: target, modelId, createdAt: existing?.createdAt || new Date().toISOString() };
      await this.commit({ ...this.data, archives: [...this.data.archives.filter(a => a.id !== archive.id), archive] });
    } catch (error) {
      for (const item of created.reverse()) await fs.rm(item, { recursive: true, force: true });
      throw error;
    }
  }

  async linkArchive(id, modelId) {
    if (modelId) this.model(modelId);
    const archive = this.data.archives.find(item => item.id === id);
    if (!archive) throw new Error('找不到网页存档');
    const directory = modelId ? path.dirname(this.model(modelId).path) : this.data.storageDirectory;
    const { target, created } = await copyHtml(this.archivePath(id), directory);
    try {
      await this.commit({ ...this.data, archives: this.data.archives.map(a => a.id === id ? { ...a, modelId: modelId || null, path: target } : a) });
    } catch (error) { for (const item of created.reverse()) await fs.rm(item, { recursive: true, force: true }); throw error; }
  }

  async cleanupPreview() {
    const root = this.data.storageDirectory;
    const items = [];
    for (const model of this.data.models) {
      if (path.dirname(model.path) === path.join(root, model.id)) items.push({ kind: 'model', id: model.id, source: model.path, target: path.join(root, model.fileName) });
    }
    for (const archive of this.data.archives) {
      const source = this.archivePath(archive.id);
      if (inside(root, source) && path.basename(path.dirname(source)).startsWith(`html-${archive.id}`)) {
        const model = this.data.models.find(m => m.id === archive.modelId);
        const planned = items.find(i => i.id === model?.id);
        const directory = planned ? root : model ? path.dirname(model.path) : root;
        items.push({ kind: 'html', id: archive.id, source, target: path.join(directory, archive.fileName) });
      }
    }
    const seen = new Set();
    for (const item of items) {
      const targets = [item.target];
      if (item.kind === 'html') for (const suffix of ['_files', '.files']) {
        const source = path.join(path.dirname(item.source), path.parse(item.source).name + suffix);
        if (await fs.lstat(source).catch(() => null)) targets.push(path.join(path.dirname(item.target), path.basename(source)));
      }
      item.conflict = false;
      for (const target of targets) {
        const key = target.normalize('NFKC').toLowerCase();
        if (seen.has(key) || await fs.lstat(target).catch(() => null)) item.conflict = true;
        seen.add(key);
      }
    }
    this.cleanupPlan = items;
    return items;
  }

  async cleanupLegacy() {
    const previous = JSON.stringify(this.cleanupPlan);
    const items = await this.cleanupPreview();
    if (previous !== JSON.stringify(items)) throw new Error('整理内容已变化，请重新预览。');
    if (items.some(i => i.conflict)) throw new Error('存在同名文件或网页资源冲突，请先处理后重新预览。');
    const created = [];
    try {
      for (const item of items) {
        if (item.kind === 'html') created.push(...(await copyHtml(item.source, path.dirname(item.target))).created);
        else { await fs.copyFile(item.source, item.target, constants.COPYFILE_EXCL); created.push(item.target); if (await hashFile(item.source) !== await hashFile(item.target)) throw new Error(`模型复制校验失败：${item.source}`); }
      }
      const links = { ...this.data.inventoryLinks };
      for (const item of items.filter(i => i.kind === 'model')) if (links[item.source]) links[item.target] = links[item.source];
      const relocate = list => list.map(record => { const item = items.find(i => i.id === record.id); return item ? { ...record, path: item.target } : record; });
      await this.commit({ ...this.data, models: relocate(this.data.models), archives: relocate(this.data.archives), inventoryLinks: links });
    } catch (error) { for (const item of created.reverse()) await fs.rm(item, { recursive: true, force: true }); throw error; }
    const warnings = [];
    for (const item of items) {
      try {
        await fs.unlink(item.source);
        if (item.kind === 'html') for (const suffix of ['_files', '.files']) await fs.rm(path.join(path.dirname(item.source), path.parse(item.source).name + suffix), { recursive: true, force: true });
      } catch (error) { warnings.push(`${item.source}: ${error.message}`); }
    }
    for (const item of [...items].reverse()) await fs.rmdir(path.dirname(item.source)).catch(() => {});
    this.cleanupPlan = null;
    return { count: items.length, warnings };
  }

  archivePath(id) {
    const archive = this.data.archives.find(item => item.id === id);
    if (!archive || !/^[\w-]+$/.test(archive.id) || path.basename(archive.fileName) !== archive.fileName) throw new Error('无效的网页存档');
    return archive.path || path.join(this.root, 'archives', archive.id, archive.fileName);
  }
}


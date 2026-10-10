import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';

const modelExtensions = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf']);
export class Library {
  constructor(root) {
    this.root = root;
    this.dbPath = path.join(root, 'library.json');
    this.data = { models: [], archives: [], storageDirectory: path.join(root, 'files'), deploymentDirectory: null };
  }

  async load() {
    await fs.mkdir(this.root, { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.dbPath, 'utf8'));
      if (!Array.isArray(data.models) || !Array.isArray(data.archives)) throw new Error('仓库数据格式错误');
      this.data = { ...this.data, ...data };
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
      models: await Promise.all(this.data.models.map(async model => {
        try { await fs.access(model.path); return { ...model, missing: false }; }
        catch { return { ...model, missing: true }; }
      })),
    };
  }

  async setDirectory(kind, directory) {
    if (!['storage', 'deployment'].includes(kind)) throw new Error('无效的目录类型');
    const real = await fs.realpath(directory);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('请选择文件夹');
    await fs.access(real, constants.W_OK);
    if (kind === 'deployment') {
      await this.commit({ ...this.data, deploymentDirectory: real });
      return;
    }
    if (path.resolve(real) === path.resolve(this.data.storageDirectory)) return;
    const current = await fs.realpath(this.data.storageDirectory).catch(() => this.data.storageDirectory);
    const relative = path.relative(current, real);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('请选择当前仓库以外的目录，避免循环复制');
    // Copy first, then switch metadata atomically. Old copies remain recoverable.
    const models = [];
    const archives = [];
    const created = [];
    try {
      for (const model of this.data.models) {
        const folder = path.join(real, model.id);
        await fs.mkdir(folder); // Refuse collisions with any existing repository.
        created.push(folder);
        const target = path.join(folder, model.fileName);
        await fs.copyFile(model.path, target, constants.COPYFILE_EXCL);
        models.push({ ...model, path: target });
      }
      for (const archive of this.data.archives) {
        const model = models.find(item => item.id === archive.modelId);
        const folder = model ? path.join(path.dirname(model.path), `html-${archive.id}`) : path.join(real, `html-${archive.id}`);
        await fs.mkdir(folder);
        created.push(folder);
        await copyContents(path.dirname(this.archivePath(archive.id)), folder);
        archives.push({ ...archive, path: path.join(folder, archive.fileName) });
      }
      await this.commit({ ...this.data, storageDirectory: real, models, archives });
    } catch (error) {
      for (const folder of created.reverse()) await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
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
          if (await fs.realpath(file) === realStorage) return;
          for (const name of await fs.readdir(file)) await visit(path.join(file, name));
        } else if (stat.isFile() && modelExtensions.has(path.extname(file).toLowerCase())) {
          const real = await fs.realpath(file);
          if (known.has(real)) return;
          const fileName = path.basename(real);
          const id = randomUUID();
          const folder = path.join(storageDirectory, id);
          await fs.mkdir(folder);
          created.push(folder);
          const target = path.join(folder, fileName);
          await fs.copyFile(real, target, constants.COPYFILE_EXCL);
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
    const directory = path.join(model ? path.dirname(model.path) : this.data.storageDirectory, `html-${id}`);
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.copyFile(source, path.join(directory, path.basename(source)));
      const stem = path.parse(source).name;
      // Chrome/Firefox "Webpage, complete" companions; SingleFile needs no folder.
      for (const suffix of ['_files', '.files']) {
        const companion = path.join(path.dirname(source), stem + suffix);
        try {
          const stat = await fs.lstat(companion);
          if (stat.isDirectory() && !stat.isSymbolicLink()) {
            await fs.cp(companion, path.join(directory, stem + suffix), {
              recursive: true,
              filter: async file => !(await fs.lstat(file)).isSymbolicLink(),
            });
          }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const archive = { id, title: stem, fileName: path.basename(source), path: path.join(directory, path.basename(source)), modelId, createdAt: new Date().toISOString() };
      await this.commit({ ...this.data, archives: [...this.data.archives, archive] });
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async linkArchive(id, modelId) {
    if (modelId) this.model(modelId);
    const archive = this.data.archives.find(item => item.id === id);
    if (!archive) throw new Error('找不到网页存档');
    const source = this.archivePath(id);
    if ((archive.modelId || null) === (modelId || null)) return;
    const directory = path.join(modelId ? path.dirname(this.model(modelId).path) : this.data.storageDirectory, `html-${id}-${randomUUID().slice(0, 8)}`);
    const target = path.join(directory, archive.fileName);
    const relocated = path.resolve(source) !== path.resolve(target);
    if (relocated) {
      await fs.mkdir(directory);
      try { await copyContents(path.dirname(source), directory); }
      catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
    }
    try {
      await this.commit({ ...this.data, archives: this.data.archives.map(item => item.id === id ? { ...item, modelId: modelId || null, path: target } : item) });
    } catch (error) {
      if (relocated) await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
    // Do not delete source copies; re-linking can be undone without losing files.
  }

  archivePath(id) {
    const archive = this.data.archives.find(item => item.id === id);
    if (!archive || !/^[\w-]+$/.test(archive.id) || path.basename(archive.fileName) !== archive.fileName) throw new Error('无效的网页存档');
    return archive.path || path.join(this.root, 'archives', archive.id, archive.fileName);
  }
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function copyContents(source, target) {
  for (const name of await fs.readdir(source)) {
    await fs.cp(path.join(source, name), path.join(target, name), {
      recursive: true, force: false, errorOnExist: true,
      filter: async file => !(await fs.lstat(file)).isSymbolicLink(),
    });
  }
}

import { app, BrowserWindow, dialog, ipcMain, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Library } from './library.js';

export function registerLibrary(getWindow, getPrompts) {
  const library = new Library(path.join(app.getPath('userData'), 'repository'));
  const ready = library.load();
  ready.catch(() => {}); // Report initialization failures through the UI, never overwrite a damaged database.
  let queue = Promise.resolve();
  // A single queue keeps dialogs, import copies and atomic metadata writes ordered.
  function handle(channel, action) {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) return { success: false, error: '无法访问仓库' };
      const task = queue.then(() => ready).then(() => action(...args));
      queue = task.catch(() => {});
      return task.then(async result => ({ success: true, data: await library.list(), ...result }), error => ({ success: false, error: error.message }));
    });
  }
  handle('library-scan', async (side) => ({ inventory: await library.scanInventory(side) }));
  handle('library-link-prompt', async (fileId, promptId, mode) => {
    if (!getPrompts().some(prompt => prompt.id === promptId)) throw new Error('这个 tag 已不存在，请刷新页面');
    await library.linkPrompt(fileId, promptId, mode);
  });
  handle('library-reveal-inventory', async id => {
    const file = library.inventory?.files.find(item => item.id === id);
    if (!file) throw new Error('请先重新扫描');
    await fs.access(file.path);
    shell.showItemInFolder(file.path);
  });
  handle('library-list', async () => { await library.refreshRepository(); return {}; });
  handle('library-compare', async () => ({ comparison: await library.compare() }));
  handle('library-copy-missing', async (ids, side) => {
    if (!library.comparison || !['storage', 'deployment'].includes(side)) throw new Error('请先核对两个文件夹');
    const target = side === 'storage' ? library.comparison.deployment : library.comparison.storage;
    const result = await dialog.showOpenDialog(getWindow(), { title: side === 'storage' ? '复制到 ComfyUI 的 LoRA 模型文件夹：选择目标子文件夹' : '复制到 LoRA 仓库文件夹：选择目标子文件夹', defaultPath: target, properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return { canceled: true };
    const copyResults = await library.copyMissing(ids, side, result.filePaths[0]);
    return { copyResults };
  });
  handle('library-cleanup-preview', async () => ({ cleanup: await library.cleanupPreview() }));
  handle('library-cleanup', async () => ({ cleanupResult: await library.cleanupLegacy() }));
  handle('library-export-zip', async () => {
    const result = await dialog.showSaveDialog(getWindow(), { title: '导出 LoRA 仓库的全部模型、HTML 和网页资源', defaultPath: `LoRA仓库-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: 'ZIP 文件', extensions: ['zip'] }] });
    if (result.canceled) return { canceled: true };
    return { exported: await library.exportZip(result.filePath, getPrompts()) };
  });
  handle('library-set-directory', async kind => {
    const result = await dialog.showOpenDialog(getWindow(), { title: kind === 'storage' ? '选择 LoRA 仓库文件夹（存放模型和 HTML 使用说明）' : '选择 ComfyUI 的 LoRA 模型文件夹（包含子文件夹，不存放 HTML）', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return { canceled: true };
    await library.setDirectory(kind, result.filePaths[0]);
  });
  handle('library-deploy', async id => library.deploy(id));
  handle('library-import-models', async (folder = false) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: folder ? '选择 LoRA 文件夹（含子目录）' : '选择 LoRA 文件',
      properties: folder ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters: [{ name: '模型文件', extensions: ['safetensors', 'ckpt', 'pt', 'pth', 'bin', 'gguf'] }],
    });
    return result.canceled ? { canceled: true } : library.importModels(result.filePaths);
  });
  handle('library-rename', async (id, name) => library.rename(id, name));
  handle('library-import-archive', async modelId => {
    const result = await dialog.showOpenDialog(getWindow(), { title: '保存 HTML 网页存档', properties: ['openFile'], filters: [{ name: '网页存档', extensions: ['html', 'htm'] }] });
    if (result.canceled) return { canceled: true };
    await library.importArchive(result.filePaths[0], modelId);
  });
  handle('library-link-archive', async (id, modelId) => library.linkArchive(id, modelId));
  handle('library-reveal', async (kind, id) => {
    const target = kind === 'model' ? library.model(id).path : library.archivePath(id);
    await fs.access(target);
    shell.showItemInFolder(target);
  });
  handle('library-preview', async id => {
    const file = library.archivePath(id);
    await fs.access(file);
    const directory = path.dirname(file);
    const previewSession = session.fromPartition(`archive-${randomUUID()}`);
    previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    previewSession.setPermissionCheckHandler(() => false);
    previewSession.on('will-download', event => event.preventDefault());
    previewSession.webRequest.onBeforeRequest((details, callback) => {
      let allowed = details.url.startsWith('data:');
      try {
        const relative = path.relative(directory, fileURLToPath(details.url));
        allowed = !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
      } catch { /* Only archive-local files and inline resources are allowed. */ }
      callback({ cancel: !allowed });
    });
    const preview = new BrowserWindow({ width: 1000, height: 760, title: 'HTML 网页存档', webPreferences: { session: previewSession, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, webSecurity: true } });
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    preview.webContents.on('will-navigate', event => event.preventDefault());
    await preview.loadFile(file);
  });
  return () => queue;
}

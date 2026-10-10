import { app, BrowserWindow, dialog, ipcMain, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Library } from './library.js';

export function registerLibrary(getWindow) {
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
  handle('library-list', async () => ({}));
  handle('library-set-directory', async kind => {
    const result = await dialog.showOpenDialog(getWindow(), { title: kind === 'storage' ? '选择仓库目录（模型 + HTML）' : '选择本地 AI 的 LoRA 目录（仅模型）', properties: ['openDirectory', 'createDirectory'] });
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
}

import { app, ipcMain, dialog } from 'electron';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
export function registerTagLookup(getWindow) {
  const worker = new Worker(new URL('./tag-worker.js', import.meta.url), { workerData: { file: path.join(app.getPath('userData'), 'danbooru-tags.sqlite') } });
  let next = 0, failure;
  const pending = new Map();
  worker.on('message', ({ id, data, error }) => {
    const request = pending.get(id); if (!request) return;
    pending.delete(id); error ? request.reject(new Error(error)) : request.resolve(data);
  });
  const fail = error => { failure = error; for (const request of pending.values()) request.reject(error); pending.clear(); };
  worker.on('error', fail);
  worker.on('exit', () => fail(new Error('标签服务已停止，请重启应用')));
  const call = (action, args) => new Promise((resolve, reject) => {
    if (failure) return reject(failure);
    const id = ++next; pending.set(id, { resolve, reject }); worker.postMessage({ id, action, args });
  });
  let busy = false;
  ipcMain.handle('tag-lookup', async (event, action, args) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) return { error: '无法访问标签服务' };
    if (!['status', 'models', 'import', 'search', 'prompts'].includes(action)) return { error: '未知操作' };
    if (busy) return { error: '标签服务忙，请稍后重试' };
    busy = true;
    try {
      if (action === 'import') {
        const files = [];
        for (const title of ['选择 Danbooru tags CSV（或 CSV.gz）', '选择 Danbooru tag_aliases CSV（或 CSV.gz）']) {
          const result = await dialog.showOpenDialog(getWindow(), { title, properties: ['openFile'], filters: [{ name: 'CSV / gzip', extensions: ['csv', 'gz'] }] });
          if (result.canceled) return { canceled: true };
          files.push(result.filePaths[0]);
        }
        args = files;
      }
      return { data: await call(action, args) };
    } catch (error) { return { error: error.message }; }
    finally { busy = false; }
  });
  app.once('before-quit', () => worker.terminate());
}

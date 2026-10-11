import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validatePackage, validateIdentity, requireNewerVersion } from './update-validation.js';

const exec = promisify(execFile);
const command = (file, args, options = {}) => exec(file, args, { timeout: 120000, maxBuffer: 1024 * 1024, ...options });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function registerUpdater(getWindow, drainLibrary) {
  let busy = false;
  const resultPath = path.join(app.getPath('userData'), 'local-update-result.json');
  const validSender = event => event.sender === getWindow()?.webContents && event.senderFrame === event.sender.mainFrame;
  ipcMain.handle('update-info', async event => {
    if (!validSender(event)) return { success: false, error: '无法访问更新功能' };
    let previous = null;
    try { previous = JSON.parse(await fs.readFile(resultPath, 'utf8')); } catch { /* No previous update. */ }
    return { success: true, version: app.getVersion(), platform: process.platform, packaged: app.isPackaged, previous };
  });
  ipcMain.handle('update-install', async event => {
    if (!validSender(event)) return { success: false, error: '无法访问更新功能' };
    if (busy) return { success: false, error: '已有更新正在处理' };
    if (!app.isPackaged) return { success: false, error: '请在安装后的桌面版中使用更新功能' };
    busy = true;
    let cleanup = async () => {};
    let handedOff = false;
    try {
      const platform = process.platform;
      if (!['darwin', 'win32'].includes(platform)) throw new Error('此平台暂不支持本地更新');
      const selected = await dialog.showOpenDialog(getWindow(), { title: '选择新版 Prompt Manager 安装包', properties: ['openFile'], filters: [{ name: 'Prompt Manager 安装包', extensions: [platform === 'win32' ? 'exe' : 'dmg'] }] });
      if (selected.canceled) return { success: true, canceled: true };
      const file = selected.filePaths[0];
      await validatePackage(file, platform);
      let version, install;
      if (platform === 'win32') {
        const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-manager-update-'));
        cleanup = () => fs.rm(scratch, { recursive: true, force: true });
        const installer = path.join(scratch, 'Prompt-Manager-Setup.exe');
        await fs.copyFile(file, installer, constants.COPYFILE_EXCL);
        // Version metadata is read without executing the selected program.
        const { stdout } = await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:PROMPT_MANAGER_UPDATE_FILE); @{product=$v.ProductName; version=$v.ProductVersion} | ConvertTo-Json -Compress'], { windowsHide: true, env: { ...process.env, PROMPT_MANAGER_UPDATE_FILE: installer } });
        const info = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
        version = info.version;
        validateIdentity(info.product, version, app.getVersion());
        install = async () => {
          const error = await shell.openPath(installer);
          if (error) throw new Error(`无法启动安装程序：${error}`);
          // NSIS owns installation, elevation and relaunch. Keep its temporary file alive.
        };
      } else {
        const prepared = await prepareMacUpdate(file, resultPath);
        cleanup = prepared.cleanup; version = prepared.version; install = prepared.install;
      }
      const confirmation = await dialog.showMessageBox(getWindow(), { type: 'question', title: '安装更新', message: `从 ${app.getVersion()} 更新到 ${version}？`, detail: `${path.basename(file)}\n请仅使用你信任的 Prompt Manager 安装包。\n\n${platform === 'win32' ? '软件将退出并启动安装向导，请沿用原安装目录完成安装。' : '软件将退出，替换当前应用并重新打开；旧应用会保留为备份。'}\nPrompt、tag、LoRA 关联与模型文件会保留。`, buttons: ['取消', '更新并退出'], defaultId: 1, cancelId: 0 });
      if (confirmation.response !== 1) return { success: true, canceled: true };
      await drainLibrary();
      await install();
      handedOff = true;
      setTimeout(() => app.quit(), 250);
      return { success: true, started: true };
    } catch (error) { return { success: false, error: error.message }; }
    finally {
      if (!handedOff) await cleanup().catch(() => {});
      busy = false;
    }
  });
}

async function prepareMacUpdate(file, resultPath) {
  const target = path.resolve(path.dirname(process.execPath), '../..');
  if (!target.endsWith('.app') || target.startsWith('/Volumes/') || target.includes('/AppTranslocation/')) throw new Error('请先把当前应用安装到“应用程序”或可写文件夹，再使用更新功能');
  const parent = path.dirname(target);
  try { await fs.access(parent, constants.W_OK); }
  catch { throw new Error('当前应用目录没有写入权限，请手动打开 DMG 安装，或将应用移到你有权限的目录'); }
  const mounted = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-manager-dmg-'));
  let attached = false, staging;
  const cleanup = async () => {
    if (attached) {
      try { await command('/usr/bin/hdiutil', ['detach', mounted]); attached = false; } catch { /* Keep mounted files if detaching fails. */ }
    }
    if (!attached) await fs.rm(mounted, { recursive: true, force: true });
    if (staging) await fs.rm(staging, { recursive: true, force: true });
  };
  try {
    await command('/usr/bin/hdiutil', ['attach', file, '-readonly', '-nobrowse', '-mountpoint', mounted]);
    attached = true;
    const candidates = (await fs.readdir(mounted, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.endsWith('.app'));
    const apps = [];
    for (const candidate of candidates) {
      const source = path.join(mounted, candidate.name);
      const { stdout } = await command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(source, 'Contents/Info.plist')]);
      const info = JSON.parse(stdout);
      if (info.CFBundleIdentifier === 'com.antigravity.promptmanager') apps.push({ source, info });
    }
    if (apps.length !== 1) throw new Error('DMG 中没有找到唯一的 Prompt Manager 应用');
    const { source, info } = apps[0];
    const version = info.CFBundleShortVersionString;
    requireNewerVersion(version, app.getVersion());
    if (typeof info.CFBundleExecutable !== 'string' || path.basename(info.CFBundleExecutable) !== info.CFBundleExecutable) throw new Error('应用执行文件信息无效');
    const { stdout: architectures } = await command('/usr/bin/lipo', ['-archs', path.join(source, 'Contents/MacOS', info.CFBundleExecutable)]);
    const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    if (!architectures.trim().split(/\s+/).includes(architecture)) throw new Error('安装包与当前 Mac 架构不兼容，请选择对应版本');
    staging = await fs.mkdtemp(path.join(parent, '.prompt-manager-update-'));
    const staged = path.join(staging, path.basename(target));
    await command('/usr/bin/ditto', [source, staged]);
    await command('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged]);
    await command('/usr/bin/hdiutil', ['detach', mounted]); attached = false;
    await fs.rm(mounted, { recursive: true, force: true });
    const helper = path.join(staging, 'install.sh');
    await fs.copyFile(fileURLToPath(new URL('./mac-update.sh', import.meta.url)), helper);
    const backup = path.join(parent, `.Prompt-Manager-backup-${Date.now()}.app`);
    const ready = path.join(staging, 'ready');
    const success = JSON.stringify({ success: true, version, backup, message: `已更新到 ${version}` });
    const failure = JSON.stringify({ success: false, backup, staging, message: '更新未完成，原应用已尽可能恢复。请检查应用目录权限或手动安装。' });
    return { version, cleanup, install: async () => {
      const child = spawn('/bin/sh', [helper, String(process.pid), staged, target, backup, resultPath, success, failure, ready, app.getPath('userData')], { detached: true, stdio: 'ignore' });
      let spawnError;
      child.on('error', error => { spawnError = error; });
      // A ready marker ensures the helper is running before the app exits.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (spawnError) throw spawnError;
        if (await fs.access(ready).then(() => true, () => false)) { child.unref(); return; }
        await delay(100);
      }
      child.kill();
      throw new Error('更新助手未启动，当前应用没有被修改');
    } };
  } catch (error) { await cleanup(); throw error; }
}

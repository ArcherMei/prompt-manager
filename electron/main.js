import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Store } from './store.js';
import { registerLibrary } from './library-ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

let store;
let mainWindow;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 675,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  
  mainWindow.setAspectRatio(16 / 9);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  store = new Store({
    configName: 'user-preferences',
    defaults: {
      categories: [
        { id: 'cat-1', name: 'Art Style', parentId: null },
        { id: 'cat-2', name: 'Subject', parentId: null }
      ],
      flowNodes: [
        { id: 'f-1', title: 'Core Subject', desc: 'Main character, object, or entity' },
        { id: 'f-2', title: 'Subject Description', desc: 'Clothes, hair, emotions, mechanics' },
        { id: 'f-3', title: 'Action / Pose', desc: 'What is the subject doing?' },
        { id: 'f-4', title: 'Environment', desc: 'Background layout, time of day' },
        { id: 'f-5', title: 'Camera & Lighting', desc: 'Angles, cinematic, studio light' },
        { id: 'f-6', title: 'Art Style / Medium', desc: 'Anime, oil painting, 3D render' },
        { id: 'f-7', title: 'Post-Processing', desc: '8k, highly detailed, masterpiece' },
        { id: 'f-8', title: 'LoRA / Network Drives', desc: 'Injected model pathways' }
      ],
      prompts: [
        { id: 'p-1', categoryId: 'cat-1', text: 'cyberpunk', note: 'sci-fi neon style' },
        { id: 'p-2', categoryId: 'cat-1', text: 'watercolor', note: '' },
        { id: 'p-3', categoryId: 'cat-2', text: '<lora:Cyborg_Samurai:1.0>', note: 'Cyborg Samurai Armor LoRA' }
      ]
    }
  });

  ipcMain.handle('get-data', () => {
    return store.get();
  });
  
  ipcMain.handle('set-always-on-top', (event, flag) => {
    if (mainWindow) mainWindow.setAlwaysOnTop(flag);
    return true;
  });

  ipcMain.handle('save-data', (event, data) => {
    store.set(data);
    return true;
  });

  ipcMain.handle('export-data', async (event, dataToExport) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Prompt Database Backup',
      defaultPath: path.join(app.getPath('documents'), 'prompt_manager_backup.json'),
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(dataToExport, null, 2));
      return { success: true, path: filePath };
    }
    return { success: false };
  });

  ipcMain.handle('export-category', async (event, dataToExport, categoryName) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Category Package',
      defaultPath: path.join(app.getPath('documents'), `${categoryName.replace(/ /g, '_')}_prompts.json`),
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(dataToExport, null, 2));
      return { success: true, path: filePath };
    }
    return { success: false };
  });

  ipcMain.handle('import-data', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Import Prompt Packages',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      try {
        const rawData = fs.readFileSync(filePaths[0], 'utf-8');
        const importedData = JSON.parse(rawData);
        // It's up to the React layer to merge the duplicates safely
        if (importedData.categories && importedData.prompts) {
           return { success: true, data: importedData };
        } else {
           return { success: false, error: 'Invalid file format' };
        }
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false };
  });

  createWindow();
  registerLibrary(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

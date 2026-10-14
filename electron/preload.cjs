const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  tags: (action, args) => ipcRenderer.invoke('tag-lookup', action, args),
  updates: { info: () => ipcRenderer.invoke('update-info'), install: () => ipcRenderer.invoke('update-install') },
  library: {
    scan: (side) => ipcRenderer.invoke('library-scan', side),
    compare: () => ipcRenderer.invoke('library-compare'),
    copyMissing: (ids, side) => ipcRenderer.invoke('library-copy-missing', ids, side),
    exportZip: () => ipcRenderer.invoke('library-export-zip'),
    cleanupPreview: () => ipcRenderer.invoke('library-cleanup-preview'),
    cleanup: () => ipcRenderer.invoke('library-cleanup'),
    linkPrompt: (fileId, promptId, mode) => ipcRenderer.invoke('library-link-prompt', fileId, promptId, mode),
    revealInventory: (id) => ipcRenderer.invoke('library-reveal-inventory', id),
    setDirectory: (kind) => ipcRenderer.invoke('library-set-directory', kind),
    deploy: (id) => ipcRenderer.invoke('library-deploy', id),
    list: () => ipcRenderer.invoke('library-list'),
    importModels: (folder) => ipcRenderer.invoke('library-import-models', folder),
    rename: (id, name) => ipcRenderer.invoke('library-rename', id, name),
    importArchive: (modelId) => ipcRenderer.invoke('library-import-archive', modelId),
    linkArchive: (id, modelId) => ipcRenderer.invoke('library-link-archive', id, modelId),
    reveal: (kind, id) => ipcRenderer.invoke('library-reveal', kind, id),
    preview: (id) => ipcRenderer.invoke('library-preview', id),
  },
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  exportCategory: (data, catName) => ipcRenderer.invoke('export-category', data, catName),
  importData: () => ipcRenderer.invoke('import-data'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag)
});

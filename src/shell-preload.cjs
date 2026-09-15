const { contextBridge, ipcRenderer } = require('electron');
const operations = new Set(['initial', 'navigate', 'back', 'reload', 'copy', 'settings-open', 'settings-save', 'extension-select', 'plugin-add', 'plugin-action']);
contextBridge.exposeInMainWorld('mizu', {
  invoke: (name, ...args) => { if (!operations.has(name)) return Promise.reject(Error('未対応の操作')); return ipcRenderer.invoke(name, ...args); },
  onState: callback => ipcRenderer.on('state', (_event, value) => callback(value)),
  onNotice: callback => ipcRenderer.on('notice', (_event, value) => callback(value))
});

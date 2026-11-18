const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hive', {
  request: async (method, args = {}) => {
    const result = await ipcRenderer.invoke('hive:request', { method, args });
    if (!result.ok) { const error = new Error(result.error.message); error.code = result.error.code; error.requestId = result.error.requestId; throw error; }
    return result.value;
  },
  subscribe: listener => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('hive:event', handler);
    return () => ipcRenderer.removeListener('hive:event', handler);
  }
});

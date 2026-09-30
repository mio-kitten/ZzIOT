/**
 * Electron 预加载脚本
 * 在渲染进程和主进程之间建立安全通信桥梁
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: (info) => ipcRenderer.invoke('download-update', info),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, data) => callback(data))
  },
  removeUpdateProgress: () => {
    ipcRenderer.removeAllListeners('update-progress')
  }
})
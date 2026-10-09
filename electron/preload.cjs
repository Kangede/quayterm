const { contextBridge, ipcRenderer, webUtils } = require('electron')
const allowed = new Set([
  'bootstrap',
  'hostSave',
  'hostDelete',
  'knownDelete',
  'knownList',
  'knownImport',
  'settings',
  'sessionStart',
  'sessionClose',
  'hostVerify',
  'filesList',
  'fileRead',
  'fileOpenLocal',
  'fileWrite',
  'fileOperation',
  'transfer',
  'transferCancel',
  'chooseUploadPaths',
  'chooseDownloadDirectory',
  'fileReveal',
  'clipboardRead',
  'clipboardWrite',
  'windowControl',
  'quit'
])
contextBridge.exposeInMainWorld('quay', {
  invoke: async (method, input) => {
    if (!allowed.has(method)) throw new Error('操作不可用')
    const result = await ipcRenderer.invoke('quay:invoke', method, input)
    if (!result.ok) throw new Error(result.error)
    return result.value
  },
  terminal: (action, data) => {
    if (['write', 'resize', 'ack', 'focus'].includes(action)) ipcRenderer.send('quay:terminal', action, data)
  },
  onEvent: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('quay:event', handler)
    return () => ipcRenderer.removeListener('quay:event', handler)
  },
  filePath: (file) => webUtils.getPathForFile(file)
})

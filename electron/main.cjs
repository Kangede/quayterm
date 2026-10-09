const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  clipboard,
  dialog,
  protocol,
  net,
  Menu,
  shell
} = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { Store } = require('./store.cjs')
const { KnownHosts } = require('./known-hosts.cjs')
const { Sessions } = require('./sessions.cjs')
const { Files } = require('./files.cjs')
const { safePath } = require('./validation.cjs')

app.setName('QuayTerm')
if (process.env.QUAYTERM_DATA_DIR) app.setPath('userData', path.resolve(process.env.QUAYTERM_DATA_DIR))
protocol.registerSchemesAsPrivileged([
  { scheme: 'quay', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])
let window,
  store,
  known,
  sessions,
  files,
  terminalFocused = false,
  quitting = false
const send = (event) => {
  if (window && !window.isDestroyed()) window.webContents.send('quay:event', event)
}
function authorize(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame)
    throw new Error('访问被拒绝')
  const url = new URL(event.senderFrame.url)
  if (
    !(url.protocol === 'quay:' && url.hostname === 'app') &&
    !(!app.isPackaged && url.origin === 'http://127.0.0.1:5178')
  )
    throw new Error('来源无效')
}
function createWindow() {
  window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 850,
    minHeight: 550,
    title: 'QuayTerm · 泊岸',
    backgroundColor: '#edf1f3',
    frame: process.platform === 'darwin',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 16 } }
      : {}),
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('before-input-event', (_event, input) => {
    // Preserve native Quit/Hide/Minimize while the terminal owns only its edit keys.
    const terminalShortcut =
      process.platform === 'darwin' &&
      terminalFocused &&
      input.meta &&
      ['a', 'c', 'v', 'f'].includes(input.key.toLowerCase())
    window.webContents.setIgnoreMenuShortcuts(Boolean(terminalShortcut))
  })
  window.webContents.on('will-navigate', (e) => e.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.on('render-process-gone', () => {
    files.cancelAll()
    sessions.closeAll()
  })
  window.on('close', (e) => {
    if (!quitting && (sessions.items.size || files.transfers.size || files.openings.size)) {
      e.preventDefault()
      send({ type: 'quit-request' })
    }
  })
  if (!app.isPackaged && process.env.QUAYTERM_DEV === '1') window.loadURL('http://127.0.0.1:5178')
  else window.loadURL('quay://app/index.html')
}
app.whenReady().then(() => {
  const dist = path.resolve(__dirname, '../dist')
  protocol.handle('quay', (request) => {
    const url = new URL(request.url)
    const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname))
    if (url.hostname !== 'app' || !file.startsWith(dist + path.sep))
      return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  try {
    store = new Store(app.getPath('userData'), safeStorage)
  } catch (error) {
    dialog.showErrorBox('无法读取本地数据', error.message)
    app.exit(1)
    return
  }
  known = new KnownHosts(store)
  sessions = new Sessions(store, known)
  files = new Files(sessions)
  if (!app.isPackaged && process.env.QUAYTERM_TEST_SEED) {
    const hosts = JSON.parse(fs.readFileSync(process.env.QUAYTERM_TEST_SEED, 'utf8'))
    for (const host of hosts) store.upsert({ ...host, rememberPassword: false })
  }
  sessions.on('event', send)
  files.on('event', send)
  const methods = {
    bootstrap: () => ({
      hosts: store.list(),
      knownHosts: known.list(),
      settings: store.data.settings,
      secureStorage: store.secure(),
      platform: process.platform,
      version: app.getVersion()
    }),
    hostSave: (input) => store.upsert(input),
    hostDelete: ({ id }) => store.remove(id),
    knownDelete: ({ id }) => known.remove(id),
    knownList: () => known.list(),
    knownImport: async () => {
      const result = await dialog.showOpenDialog(window, {
        title: '导入 OpenSSH known_hosts',
        properties: ['openFile']
      })
      if (result.canceled) return null
      const p = result.filePaths[0]
      if (fs.statSync(p).size > 4 * 1024 * 1024) throw new Error('文件大于 4 MiB')
      return known.import(fs.readFileSync(p, 'utf8'))
    },
    settings: (input) => store.settings(input),
    sessionStart: (input) => sessions.start(input),
    sessionClose: ({ id }) => sessions.close(id),
    hostVerify: ({ challengeId, accept }) => sessions.respond(challengeId, accept === true),
    filesList: ({ endpoint, path }) => files.list(endpoint, path),
    fileRead: async ({ endpoint, path }) => {
      try {
        return await files.readText(endpoint, path)
      } catch (error) {
        // contextBridge does not preserve custom properties on thrown Errors.
        // Send the expected editor fallback as data; I/O failures still reject.
        if (['FILE_BINARY', 'FILE_ENCODING'].includes(error.code))
          return { external: true, reason: error.message }
        throw error
      }
    },
    fileOpenLocal: ({ endpoint, path }) => files.openLocal(endpoint, path, (p) => shell.openPath(p)),
    fileWrite: ({ endpoint, path, text, hash }) => files.writeText(endpoint, path, text, hash),
    fileOperation: (input) => files.operate(input),
    transfer: (input) => files.transfer(input),
    transferCancel: ({ id }) => files.cancel(id),
    chooseUploadPaths: async ({ folder }) => {
      const result = await dialog.showOpenDialog(window, {
        title: folder ? '选择上传的文件夹' : '选择上传的文件',
        properties: [folder ? 'openDirectory' : 'openFile', 'multiSelections']
      })
      return result.canceled ? [] : result.filePaths
    },
    chooseDownloadDirectory: async () => {
      const result = await dialog.showOpenDialog(window, {
        title: '选择下载位置',
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? null : result.filePaths[0]
    },
    fileReveal: ({ path: p }) => shell.showItemInFolder(safePath(p)),
    clipboardRead: () => clipboard.readText(),
    clipboardWrite: ({ text }) => {
      if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) throw new Error('剪贴板内容过大')
      clipboard.writeText(text)
    },
    windowControl: ({ action }) => {
      if (action === 'minimize') window.minimize()
      else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
      else if (action === 'close') window.close()
    },
    quit: () => {
      quitting = true
      files.cancelAll()
      sessions.closeAll()
      app.quit()
    }
  }
  ipcMain.handle('quay:invoke', async (event, method, input = {}) => {
    authorize(event)
    if (!Object.hasOwn(methods, method)) throw new Error('未知操作')
    try {
      return { ok: true, value: await methods[method](input) }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })
  ipcMain.on('quay:terminal', (event, action, data) => {
    try {
      authorize(event)
      if (action === 'write') sessions.write(data.id, data.data, data.binary === true)
      else if (action === 'resize') sessions.resize(data.id, data.cols, data.rows)
      else if (action === 'ack') sessions.ack(data.id, data.bytes)
      else if (action === 'focus') {
        terminalFocused = data.active === true
        if (!terminalFocused) window.webContents.setIgnoreMenuShortcuts(false)
      }
    } catch (error) {
      if (action !== 'ack' && sessions.items.get(data.id)?.state === 'ready')
        send({ type: 'session-status', id: data.id, state: 'error', message: error.message })
    }
  })
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          {
            label: 'QuayTerm',
            submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }]
          },
          { role: 'editMenu' },
          { role: 'windowMenu' }
        ])
      : null
  )
  createWindow()
})
app.on('window-all-closed', () => {
  files?.cancelAll()
  sessions?.closeAll()
  app.quit()
})
app.on('before-quit', (event) => {
  if (!quitting && (sessions?.items.size || files?.transfers.size || files?.openings.size)) {
    event.preventDefault()
    send({ type: 'quit-request' })
  }
})

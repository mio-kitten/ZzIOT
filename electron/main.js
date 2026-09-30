/**
 * Electron 主进程
 * 负责窗口管理、IPC 通信、以及自动更新流程
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { exec } = require('child_process')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'dist', 'favicon.ico'),
    title: 'ZzIOT 物联网可视化面板',
    autoHideMenuBar: true
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const protocol = url.startsWith('https') ? https : http

    const request = protocol.get(url, { headers: { 'User-Agent': 'ZzIOT-Updater' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        fs.unlink(destPath, () => {})
        downloadFile(response.headers.location, destPath, onProgress).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlink(destPath, () => {})
        reject(new Error(`下载失败，状态码: ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0

      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (onProgress && totalSize > 0) {
          onProgress({
            downloaded: downloadedSize,
            total: totalSize,
            percent: Math.round((downloadedSize / totalSize) * 100)
          })
        }
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close()
        resolve(destPath)
      })

      file.on('error', (err) => {
        file.close()
        fs.unlink(destPath, () => {})
        reject(err)
      })
    })

    request.on('error', (err) => {
      file.close()
      fs.unlink(destPath, () => {})
      reject(err)
    })

    request.setTimeout(300000, () => {
      request.destroy()
      file.close()
      fs.unlink(destPath, () => {})
      reject(new Error('下载超时'))
    })
  })
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const AdmZip = require('adm-zip')
    try {
      const zip = new AdmZip(zipPath)
      zip.extractAllTo(destDir, true)
      resolve(destDir)
    } catch (err) {
      reject(err)
    }
  })
}

function generateUpdaterBat(extractDir, appDir, exeName) {
  const batContent = `@echo off
chcp 65001 > nul
title ZzIOT 更新中...

echo.
echo ╔══════════════════════════════════════╗
echo ║     ZzIOT 正在更新，请稍候...        ║
echo ╚══════════════════════════════════════╝
echo.

echo [1/3] 等待主程序退出...
:waitloop
tasklist /FI "IMAGENAME eq ${exeName}" 2>NUL | find /I "${exeName}" >NUL
if %ERRORLEVEL% EQU 0 (
    timeout /t 1 /nobreak > nul
    goto waitloop
)

echo [2/3] 正在替换文件...
xcopy /E /Y /Q "${extractDir}\\*" "${appDir}\\" > nul

echo [3/3] 清理临时文件...
rmdir /S /Q "${extractDir}" > nul 2>&1

echo.
echo ╔══════════════════════════════════════╗
echo ║     更新完成！正在启动新版本...      ║
echo ╚══════════════════════════════════════╝
echo.

start "" "${appDir}\\${exeName}"

timeout /t 2 /nobreak > nul
del "%~f0"
`

  const batPath = path.join(extractDir, '..', 'updater.bat')
  fs.writeFileSync(batPath, batContent, 'utf-8')
  return batPath
}

ipcMain.handle('check-for-update', async () => {
  try {
    const result = await new Promise((resolve, reject) => {
      const url = 'https://api.github.com/repos/mio-kitten/ZzIOT/releases'
      const req = https.get(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ZzIOT-Updater'
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('超时')) })
    })
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('download-update', async (event, { downloadUrl, filename }) => {
  try {
    const tempDir = path.join(app.getPath('temp'), 'zziot-update')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const zipPath = path.join(tempDir, filename)
    const extractDir = path.join(tempDir, 'extracted')

    mainWindow.webContents.send('update-progress', {
      stage: 'downloading',
      percent: 0,
      message: '正在下载更新包...'
    })

    await downloadFile(downloadUrl, zipPath, (progress) => {
      mainWindow.webContents.send('update-progress', {
        stage: 'downloading',
        percent: progress.percent,
        message: `正在下载... ${progress.percent}%`
      })
    })

    mainWindow.webContents.send('update-progress', {
      stage: 'extracting',
      percent: 100,
      message: '正在解压更新包...'
    })

    await extractZip(zipPath, extractDir)

    fs.unlink(zipPath, () => {})

    const appDir = path.dirname(app.getPath('exe'))
    const exeName = path.basename(app.getPath('exe'))

    const batPath = generateUpdaterBat(extractDir, appDir, exeName)

    mainWindow.webContents.send('update-progress', {
      stage: 'installing',
      percent: 100,
      message: '准备安装更新...'
    })

    exec(`start "" "${batPath}"`, { shell: true })

    setTimeout(() => {
      app.quit()
    }, 500)

    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url)
})
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const STABLE_REGEX = /^\d+\.\d+\.\d+\.\d+$/
const TEST_REGEX = /^\d+\.\d+\.\d+$/

function extractNumeric(v) {
  v = v.replace(/^[Vv]/, '')
  const m4 = v.match(/^(\d+\.\d+\.\d+\.\d+)/)
  if (m4) return m4[1]
  const m3 = v.match(/^(\d+\.\d+\.\d+)/)
  if (m3) return m3[1]
  return v
}

function getVersionType(v) {
  return STABLE_REGEX.test(v) ? 'stable' : 'test'
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function httpGet(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('重定向过多'))
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'ZzIOT-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode))
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function downloadFile(url, destPath, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('重定向过多'))
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    let total = 0
    let downloaded = 0
    let lastPct = -1
    let timedOut = false

    const req = mod.get(url, { headers: { 'User-Agent': 'ZzIOT-Updater' } }, (res) => {
      if (timedOut) return
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { fs.unlinkSync(destPath) } catch (e) { /* ignore */ }
        return downloadFile(res.headers.location, destPath, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(destPath) } catch (e) { /* ignore */ }
        return reject(new Error('HTTP ' + res.statusCode))
      }
      total = parseInt(res.headers['content-length'] || '0', 10)
      res.on('data', (chunk) => {
        downloaded += chunk.length
        file.write(chunk)
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100)
          if (pct !== lastPct) {
            lastPct = pct
            process.stdout.write('\r下载进度: ' + pct + '%')
          }
        }
      })
      res.on('end', () => {
        file.end()
        process.stdout.write('\n')
        resolve()
      })
      res.on('error', (err) => {
        if (timedOut) return
        file.close()
        try { fs.unlinkSync(destPath) } catch (e) { /* ignore */ }
        reject(err)
      })
    })

    req.setTimeout(30000, () => {
      timedOut = true
      req.destroy()
      file.close()
      try { fs.unlinkSync(destPath) } catch (e) { /* ignore */ }
      reject(new Error('连接超时(30s)'))
    })

    req.on('error', (err) => {
      if (timedOut) return
      file.close()
      try { fs.unlinkSync(destPath) } catch (e) { /* ignore */ }
      reject(err)
    })
  })
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}

function showBanner(title) {
  console.log('')
  console.log('================================================')
  console.log('  ' + title)
}

function waitForInput() {
  // 在 Node.js 中无法直接实现 pause，由 bat 文件的 pause 处理
}

async function main() {
  // 读取当前版本
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const currentVer = extractNumeric(pkg.version)
  const currentType = getVersionType(currentVer)
  const typeLabel = currentType === 'stable' ? '稳定版' : '测试版'

  // 获取 Release 列表
  let releases
  try {
    releases = JSON.parse(await httpGet('https://api.github.com/repos/mio-kitten/ZzIOT/releases'))
  } catch (e) {
    console.log('')
    console.log('检查失败，请检查网络连接后重试。')
    console.log('错误: ' + (e.message || e))
    return
  }

  if (!Array.isArray(releases) || releases.length === 0) {
    console.log('')
    console.log('暂无发布版本，请稍后重试。')
    return
  }

  // 过滤同类型版本并排序
  const matchReleases = releases
    .filter((r) => {
      const tag = extractNumeric(r.tag_name || '')
      return currentType === 'stable' ? STABLE_REGEX.test(tag) : TEST_REGEX.test(tag)
    })
    .sort((a, b) =>
      compareVersions(extractNumeric(b.tag_name || ''), extractNumeric(a.tag_name || ''))
    )

  if (matchReleases.length === 0) {
    console.log('')
    console.log('暂无' + typeLabel + ' Release。')
    return
  }

  const latest = matchReleases[0]
  const latestTag = extractNumeric(latest.tag_name || '')

  // 比较版本
  if (compareVersions(latestTag, currentVer) <= 0) {
    showBanner('已是最新' + typeLabel + '！')
    console.log('  > 当前版本: ' + currentVer)
    console.log('================================================')
    return
  }

  // 发现新版本
  showBanner('发现新' + typeLabel + '！')
  console.log('  > 当前版本: ' + currentVer)
  console.log('  >> 最新版本: ' + latestTag)
  console.log('================================================')

  // 用户确认
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answer = await new Promise((resolve) => {
    readline.question('\n是否更新？(Y/N): ', (ans) => {
      readline.close()
      resolve(ans)
    })
  })

  if (answer.toUpperCase() !== 'Y') {
    console.log('已取消更新。')
    return
  }

  // 找到下载资源
  let zipAsset = null
  if (latest.assets && Array.isArray(latest.assets)) {
    zipAsset = latest.assets.find(
      (a) => (a.name || '').endsWith('.zip') || (a.name || '').endsWith('.7z') || (a.name || '').endsWith('.rar')
    )
  }
  const downloadPath = zipAsset
    ? zipAsset.browser_download_url
    : latest.zipball_url || ''

  if (!downloadPath) {
    console.log('')
    console.log('未找到下载文件，请手动更新。')
    return
  }

  // 下载
  const tempDir = process.env.TEMP || process.env.TMP || '.'
  const ext = downloadPath.match(/\.(zip|7z|rar)(\?|$)/i)
  const suffix = ext ? ext[1] : 'zip'
  const zipFile = path.join(tempDir, 'zziot_update.' + suffix)
  const extractDir = path.join(tempDir, 'zziot_extract')

  // 多镜像 + 直连兜底，依次尝试
  const downloadPathGh = downloadPath.replace('https://github.com/', '')
  const MIRRORS = [
    { name: '直连 GitHub', url: downloadPath },
    { name: 'ghproxy 线路1', url: 'https://ghproxy.com/https://github.com/' + downloadPathGh },
    { name: 'ghproxy 线路2', url: 'https://mirror.ghproxy.com/https://github.com/' + downloadPathGh },
  ]

  let downloadSuccess = false
  for (let i = 0; i < MIRRORS.length; i++) {
    const mirror = MIRRORS[i]
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log('')
      console.log('[' + mirror.name + '] 下载中... (第' + attempt + '次尝试)')
      try {
        await downloadFile(mirror.url, zipFile)
        downloadSuccess = true
        break
      } catch (e) {
        console.log('[' + mirror.name + '] 失败: ' + (e.message || e))
        if (attempt < 2) {
          console.log('等待 2 秒后重试...')
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    }
    if (downloadSuccess) break
  }

  if (!downloadSuccess) {
    console.log('')
    console.log('所有下载方式均失败，请检查网络或手动下载更新。')
    return
  }

  console.log('下载完成，正在解压...')

  // 解压
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
  fs.mkdirSync(extractDir, { recursive: true })

  try {
    if (suffix === 'zip') {
      execSync(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path \'' + zipFile + '\' -DestinationPath \'' + extractDir + '\' -Force"',
        { stdio: 'pipe' }
      )
    } else {
      execSync(
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "' +
        '$shell = New-Object -ComObject Shell.Application; ' +
        '$zip = $shell.NameSpace(\'' + zipFile + '\'); ' +
        '$dest = $shell.NameSpace(\'' + extractDir + '\'); ' +
        '$dest.CopyHere($zip.Items(), 16); ' +
        'do { Start-Sleep -Milliseconds 300 } while (@($dest.Items()).Count -lt @($zip.Items()).Count)' +
        '"',
        { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
      )
    }
  } catch (e) {
    console.log('解压失败: ' + (e.message || e))
    try { fs.unlinkSync(zipFile) } catch (e2) { /* ignore */ }
    return
  }

  // 找到解压后的实际内容目录
  let innerDir = extractDir
  const entries = fs.readdirSync(extractDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory())
  if (dirs.length === 1 && entries.every((e) => e.isDirectory() || (e.name || '').match(/\.(zip|7z|rar)$/i))) {
    innerDir = path.join(extractDir, dirs[0].name)
  }

  console.log('正在覆盖文件...')

  // 覆盖文件
  const projectDir = process.cwd()
  const innerEntries = fs.readdirSync(innerDir, { withFileTypes: true })
  for (const entry of innerEntries) {
    const s = path.join(innerDir, entry.name)
    const d = path.join(projectDir, entry.name)
    if (entry.isDirectory()) {
      copyDir(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }

  // 清理临时文件
  try { fs.unlinkSync(zipFile) } catch (e) { /* ignore */ }
  try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch (e) { /* ignore */ }

  showBanner('更新成功！请重新启动项目。')
}

main().catch((e) => {
  console.log('')
  console.log('更新过程出错: ' + (e.message || e))
})
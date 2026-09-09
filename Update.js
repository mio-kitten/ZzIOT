const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

// ========== 配置 ==========
const GITEE_API = 'https://gitee.com/api/v5/repos/XUELING-NORTH/ZzIOT/releases?page=1&per_page=100'
const GITHUB_API = 'https://api.github.com/repos/mio-kitten/ZzIOT/releases'
const GITEE_REPO = 'XUELING-NORTH/ZzIOT'
const STABLE_REGEX = /^\d+\.\d+\.\d+\.\d+$/
const TEST_REGEX = /^\d+\.\d+\.\d+$/

// ========== 工具函数 ==========

function showBanner(msg) {
  console.log('')
  console.log('================================================')
  console.log('  ' + msg)
  console.log('================================================')
}

function extractNumeric(tag) {
  return (tag || '').replace(/^[vV]/, '')
}

function compareVersions(a, b) {
  const ap = a.split('.').map(Number)
  const bp = b.split('.').map(Number)
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const d = (ap[i] || 0) - (bp[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'ZzIOT-Updater',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode))
      }
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function downloadFile(url, destPath, expectedSize) {
  return new Promise((resolve, reject) => {
    try {
      execSync(
        'curl.exe -L -f -o "' + destPath + '"' +
        ' --max-time 7200 --connect-timeout 30' +
        ' --retry 3 --retry-delay 10' +
        ' -A "ZzIOT-Updater"' +
        ' "' + url + '"',
        { stdio: 'inherit', timeout: 7500000 }
      )
      const stats = fs.statSync(destPath)
      if (expectedSize > 0 && stats.size !== expectedSize) {
        try { fs.unlinkSync(destPath) } catch (e) { /* ignore */ }
        throw new Error('size mismatch (expected ' + (expectedSize / 1024 / 1024).toFixed(1) + 'MB, got ' + (stats.size / 1024 / 1024).toFixed(1) + 'MB)')
      }
      resolve()
    } catch (e) {
      try { fs.unlinkSync(destPath) } catch (e2) { /* ignore */ }
      reject(new Error(e.message || 'download failed'))
    }
  })
}

// ========== 主流程 ==========

async function main() {
  // 解析参数
  const args = process.argv.slice(2)
  const isTest = args.includes('test') || args.includes('--test')
  const currentType = isTest ? 'test' : 'stable'
  const typeLabel = isTest ? '测试版' : '稳定版'

  // 清理上次更新残留的旧文件
  try { fs.unlinkSync(path.join(__dirname, '一键更新.old.bat')) } catch (e) { /* ignore */ }
  try { fs.unlinkSync(path.join(__dirname, '一键更新.old.js')) } catch (e) { /* ignore */ }

  // 读取本地版本
  const pkgPath = path.join(__dirname, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    console.log('未找到 package.json，请确保在项目目录下运行。')
    return
  }
  const currentVer = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version || '0'

  let releases = null

  // 方式 1：Gitee API
  try {
    const raw = await httpGet(GITEE_API)
    const data = JSON.parse(raw)
    if (Array.isArray(data) && data.length > 0) {
      // 统一字段名（Gitee 用 download_url，GitHub 用 browser_download_url）
      releases = data.map((r) => ({
        tag_name: r.tag_name,
        name: r.name || r.tag_name,
        assets: (r.assets || []).map((a) => ({
          name: a.name,
          browser_download_url: a.browser_download_url || a.download_url || a.url,
          size: a.size || 0,
        })),
        zipball_url: r.zipball_url || r.tarball_url || '',
      }))
    }
  } catch (e) {
    // Gitee 失败，静默降级
  }

  // 方式 2：GitHub API（兜底）
  if (!releases) {
    try {
      releases = JSON.parse(await httpGet(GITHUB_API))
    } catch (e) {
      // GitHub 也失败
    }
  }

  if (!Array.isArray(releases) || releases.length === 0) {
    console.log('暂无发布版本。')
    return
  }

  // 过滤 + 排序
  const matchReleases = releases
    .filter((r) => {
      const tag = extractNumeric(r.tag_name || '')
      return currentType === 'stable' ? STABLE_REGEX.test(tag) : TEST_REGEX.test(tag)
    })
    .sort((a, b) =>
      compareVersions(extractNumeric(b.tag_name || ''), extractNumeric(a.tag_name || ''))
    )

  if (matchReleases.length === 0) {
    console.log('暂无' + typeLabel + ' Release。')
    return
  }

  const latest = matchReleases[0]
  const latestTag = extractNumeric(latest.tag_name || '')

  // 版本比较
  if (compareVersions(latestTag, currentVer) <= 0) {
    console.log('')
    console.log('================================================')
    console.log('  已是最新' + typeLabel + '！')
    console.log('  > 当前版本: ' + currentVer)
    console.log('================================================')
    return
  }

  // 发现新版本
  console.log('')
  console.log('================================================')
  console.log('  发现新' + typeLabel + '！')
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
  const githubUrl = zipAsset ? zipAsset.browser_download_url : latest.zipball_url || ''
  if (!githubUrl) {
    console.log('未找到下载文件，请手动更新。')
    return
  }

  // 准备下载
  const tempDir = process.env.TEMP || process.env.TMP || '.'
  const ext = githubUrl.match(/\.(zip|7z|rar)(\?|$)/i)
  const suffix = ext ? ext[1] : '7z'
  const zipFile = path.join(tempDir, 'zziot_update.' + suffix)
  const extractDir = path.join(tempDir, 'zziot_extract')
  const expectedSize = zipAsset ? zipAsset.size : 0
  const assetName = zipAsset ? zipAsset.name : githubUrl.split('/').pop()?.split('?')[0] || 'update.' + suffix

  const giteeUrl = 'https://gitee.com/' + GITEE_REPO + '/releases/download/' + latest.tag_name + '/' + assetName
  const mirrors = [
    { name: '线路 1', url: giteeUrl },
    { name: '线路 2', url: githubUrl },
  ]

  console.log('')
  console.log('文件: ' + assetName + ' (' + (expectedSize / 1024 / 1024).toFixed(1) + ' MB)')

  // 依次尝试下载
  let downloadSuccess = false
  for (let i = 0; i < mirrors.length; i++) {
    const m = mirrors[i]
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log('')
      console.log('[' + m.name + '] 下载中... (第' + attempt + '次尝试)')
      try {
        await downloadFile(m.url, zipFile, expectedSize)
        downloadSuccess = true
        break
      } catch (e) {
        console.log('[' + m.name + '] 失败: ' + (e.message || e))
        if (attempt < 2) {
          console.log('等待 3 秒后重试...')
          await new Promise(r => setTimeout(r, 3000))
        }
      }
    }
    if (downloadSuccess) break
  }

  if (!downloadSuccess) {
    console.log('')
    console.log('所有下载方式均失败，请检查网络或手动下载。')
    return
  }

  // 解压
  console.log('')
  console.log('下载完成，正在解压...')
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
  fs.mkdirSync(extractDir, { recursive: true })

  let extracted = false

  // 尝试 1：7z
  const sevenZipPaths = ['7z', '7z.exe', 'C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe']
  for (const zp of sevenZipPaths) {
    try {
      execSync('"' + zp + '" x "' + zipFile + '" -o"' + extractDir + '" -aoa -y', { stdio: 'pipe', timeout: 120000 })
      extracted = true
      console.log('使用 7z 解压完成')
      break
    } catch (e) { /* try next */ }
  }

  // 尝试 2：WinRAR
  if (!extracted) {
    const wrPaths = ['WinRAR', 'WinRAR.exe', 'C:\\Program Files\\WinRAR\\WinRAR.exe', 'C:\\Program Files (x86)\\WinRAR\\WinRAR.exe']
    for (const wr of wrPaths) {
      try {
        execSync('"' + wr + '" x -o+ "' + zipFile + '" "' + extractDir + '"', { stdio: 'pipe', timeout: 120000 })
        extracted = true
        console.log('使用 WinRAR 解压完成')
        break
      } catch (e) { /* try next */ }
    }
  }

  // 尝试 3：系统工具
  if (!extracted) {
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
          'do { Start-Sleep -Milliseconds 300 } while (@($dest.Items()).Count -lt @($zip.Items()).Count); ' +
          'Start-Sleep -Seconds 3' +
          '"',
          { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }
        )
      }
      extracted = true
      console.log('使用系统工具解压完成')
    } catch (e) {
      console.log('解压失败: ' + (e.message || e))
      try { fs.unlinkSync(zipFile) } catch (e2) { /* ignore */ }
      return
    }
  }

  // 验证解压结果
  const extractEntries = fs.readdirSync(extractDir, { withFileTypes: true })
  if (extractEntries.length === 0) {
    console.log('解压失败：目录为空')
    try { fs.unlinkSync(zipFile) } catch (e) { /* ignore */ }
    return
  }
  console.log('解压目录包含 ' + extractEntries.length + ' 个条目')

  // 定位实际内容目录
  let innerDir = extractDir
  const dirs = extractEntries.filter((e) => e.isDirectory())
  const archives = extractEntries.filter((e) => !e.isDirectory() && (e.name || '').match(/\.(zip|7z|rar)$/i))
  if (dirs.length === 1 && extractEntries.length === dirs.length + archives.length) {
    innerDir = path.join(extractDir, dirs[0].name)
    console.log('自动进入子目录: ' + dirs[0].name)
  }

  // 覆盖文件
  console.log('')
  console.log('正在覆盖文件...')
  const projectDir = process.cwd()

  try {
    execSync(
      'robocopy "' + innerDir + '" "' + projectDir + '" /E /R:3 /W:2 /NP /NDL /NJH /NJS /NS /NC',
      { stdio: 'pipe', timeout: 120000 }
    )
    console.log('文件覆盖完成')
  } catch (e) {
    if (e.status >= 8) {
      console.log('robocopy 部分失败，尝试备用方式...')
      try {
        execSync(
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item -Path \'' + innerDir + '\\*\' -Destination \'' + projectDir + '\' -Recurse -Force -ErrorAction SilentlyContinue"',
          { stdio: 'pipe', timeout: 120000 }
        )
        console.log('备用方式覆盖完成')
      } catch (e2) {
        console.log('文件覆盖失败: ' + (e2.message || e2))
        return
      }
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
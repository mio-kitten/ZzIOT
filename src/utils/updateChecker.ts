/**
 * 更新检查工具
 * 通过 GitHub API 检查是否有新版本 Release
 *
 * 版本类型规则：
 * - 测试版格式：X.X.X（如 2.4.1）或 X.X.X-后缀（如 2.4.1-Y）
 * - 稳定版格式：X.X.XX.XXX（如 2.4.27.903，后两组为年月日）
 *
 * 重要：测试版只检查测试版更新，稳定版只检查稳定版更新，互不干扰
 */
import { APP_VERSION } from '@/version'

const GITHUB_OWNER = 'mio-kitten'
const GITHUB_REPO = 'ZzIOT'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`

const TEST_VERSION_REGEX = /^\d+\.\d+\.\d+$/
const STABLE_VERSION_REGEX = /^\d+\.\d+\.\d+\.\d+$/

const DOWNLOAD_MIRRORS = [
  { name: 'GitHub 直连', url: '' },
  { name: 'ghproxy 加速', url: 'https://ghproxy.com/' },
  { name: 'mirror.ghproxy 加速', url: 'https://mirror.ghproxy.com/' },
]

export interface ReleaseInfo {
  tag: string
  version: string
  name: string
  body: string
  publishedAt: string
  downloadUrl: string
  filename: string
  mirrors: { name: string; url: string }[]
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  versionType: 'stable' | 'test'
  latestRelease: ReleaseInfo | null
  error?: string
}

function extractNumericVersion(versionStr: string): string {
  const cleaned = versionStr.replace(/^[Vv]/, '')
  const match4 = cleaned.match(/^(\d+\.\d+\.\d+\.\d+)/)
  if (match4) return match4[1]
  const match3 = cleaned.match(/^(\d+\.\d+\.\d+)/)
  if (match3) return match3[1]
  return cleaned
}

function parseVersion(version: string): number[] {
  return version.split('.').map(Number)
}

function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a)
  const partsB = parseVersion(b)
  const maxLen = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < maxLen; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function getVersionType(version: string): 'stable' | 'test' {
  if (STABLE_VERSION_REGEX.test(version)) return 'stable'
  return 'test'
}

function isStableVersion(tag: string): boolean {
  return STABLE_VERSION_REGEX.test(tag)
}

function isTestVersion(tag: string): boolean {
  return TEST_VERSION_REGEX.test(tag)
}

function getVersionTypeLabel(type: 'stable' | 'test'): string {
  return type === 'stable' ? '稳定版' : '测试版'
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentNumeric = extractNumericVersion(APP_VERSION)
  const currentType = getVersionType(currentNumeric)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(GITHUB_API + '?_t=' + Date.now(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ZzIOT-UpdateChecker'
      }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        hasUpdate: false,
        currentVersion: currentNumeric,
        versionType: currentType,
        latestRelease: null,
        error: `GitHub API 请求失败 (${response.status})`
      }
    }

    const releases = await response.json()

    if (!Array.isArray(releases) || releases.length === 0) {
      return {
        hasUpdate: false,
        currentVersion: currentNumeric,
        versionType: currentType,
        latestRelease: null,
        error: '暂无 Release 发布'
      }
    }

    const matchTypeReleases = releases
      .filter((r: any) => {
        const tag = extractNumericVersion(r.tag_name || '')
        if (currentType === 'stable') {
          return isStableVersion(tag)
        } else {
          return isTestVersion(tag)
        }
      })
      .sort((a: any, b: any) => {
        const tagA = extractNumericVersion(a.tag_name || '')
        const tagB = extractNumericVersion(b.tag_name || '')
        return compareVersions(tagB, tagA)
      })

    if (matchTypeReleases.length === 0) {
      return {
        hasUpdate: false,
        currentVersion: currentNumeric,
        versionType: currentType,
        latestRelease: null,
        error: `暂无${getVersionTypeLabel(currentType)} Release`
      }
    }

    const latest = matchTypeReleases[0]
    const latestTag = extractNumericVersion(latest.tag_name || '')
    const zipAsset = latest.assets?.find((a: any) =>
  a.name?.endsWith('.zip') || a.name?.endsWith('.7z') || a.name?.endsWith('.rar')
)

    const directUrl = zipAsset?.browser_download_url || latest.zipball_url || ''

    const latestRelease: ReleaseInfo = {
      tag: latest.tag_name || latestTag,
      version: latestTag,
      name: latest.name || latest.tag_name || '',
      body: latest.body || '',
      publishedAt: latest.published_at || '',
      downloadUrl: directUrl,
      filename: zipAsset?.name || `${latestTag}.zip`,
      mirrors: DOWNLOAD_MIRRORS.map(m => ({
        name: m.name,
        url: m.url ? m.url + directUrl.replace(/^https?:\/\//, '') : directUrl
      }))
    }

    const hasUpdate = compareVersions(latestTag, currentNumeric) > 0

    return {
      hasUpdate,
      currentVersion: currentNumeric,
      versionType: currentType,
      latestRelease
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        hasUpdate: false,
        currentVersion: currentNumeric,
        versionType: currentType,
        latestRelease: null,
        error: '请求超时'
      }
    }
    return {
      hasUpdate: false,
      currentVersion: currentNumeric,
      versionType: currentType,
      latestRelease: null,
      error: error.message || '网络错误'
    }
  }
}

export { checkForUpdates, extractNumericVersion, compareVersions, isStableVersion, isTestVersion, getVersionType, getVersionTypeLabel }
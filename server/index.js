 /**
 * 内网 MQTT 服务端
 * 基于 Aedes MQTT Broker 和 Express 的本地服务器
 * 功能：内网 MQTT 消息中转（WS/TCP）、WiFi热点管理、数据持久化存储、Web 数据管理界面
 * 端口：Web界面 8080、MQTT WebSocket 1853、MQTT TCP 1883
 */
const express = require('express')
const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const net = require('net')
const WebSocket = require('ws')
const mqtt = require('mqtt')
const { execSync, spawn } = require('child_process')

const WEB_PORT = 8080
const BROKER_WS_PORT = 1853
const BROKER_TCP_PORT = 1883
const DATA_DIR = path.join(__dirname, 'data')
const AP_CONFIG_PATH = path.join(DATA_DIR, 'ap-config.json')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadApConfig() {
  try {
    if (fs.existsSync(AP_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(AP_CONFIG_PATH, 'utf-8'))
    }
  } catch (e) {
    console.error('读取AP配置失败:', e.message)
  }
  return { ssid: '', password: '', restartCount: 0 }
}

function saveApConfig(config) {
  try {
    fs.writeFileSync(AP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('保存AP配置失败:', e.message)
  }
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function runPowerShell(script) {
  const tmpFile = path.join(DATA_DIR, '_ps_temp.ps1')
  fs.writeFileSync(tmpFile, script, 'utf-8')
  try {
    const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000
    })
    return result
  } catch (e) {
    const errMsg = [e.stderr, e.stdout].filter(Boolean).join('\n').trim() || e.message
    throw new Error(errMsg)
  } finally {
    try { fs.unlinkSync(tmpFile) } catch (e) {}
  }
}

function force24GHzBand() {
  console.log('\x1b[36m[2.4G] 强制设置2.4GHz频段...\x1b[0m')
  
  try {
    // 方法1：HostedNetworkSettings 注册表
    execSync('reg add "HKLM\\Software\\Microsoft\\WlanSvc\\Parameters\\HostedNetworkSettings" /v Band /t REG_DWORD /d 1 /f', {
      stdio: 'ignore', timeout: 5000
    })
    console.log('\x1b[90m[2.4G]   ✓ HostedNetworkSettings/Band=1\x1b[0m')
  } catch(e) {}
  
  try {
    // 方法2：服务级注册表
    execSync('reg add "HKLM\\System\\CurrentControlSet\\Services\\WlanSvc\\Parameters\\HostedNetworkSettings" /v Band /t REG_DWORD /d 1 /f', {
      stdio: 'ignore', timeout: 5000
    })
    console.log('\x1b[90m[2.4G]   ✓ WlanSvc/Band=1\x1b[0m')
  } catch(e) {}
  
  try {
    // 方法3：移动热点设置 - 首选2.4G
    execSync('reg add "HKLM\\SOFTWARE\\Microsoft\\WlanSvc\\Parameters\\MobileOperatorHotspot" /v PreferredBandType /t REG_DWORD /d 1 /f', {
      stdio: 'ignore', timeout: 5000
    })
    console.log('\x1b[90m[2.4G]   ✓ PreferredBandType=1 (2.4G)\x1b[0m')
  } catch(e) {}
  
  try {
    // 方法4：禁用双频
    execSync('reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\WlanSvc\\Parameters\\MobileOperatorHotspot" /v EnableDualBand /t REG_DWORD /d 0 /f', {
      stdio: 'ignore', timeout: 5000
    })
    console.log('\x1b[90m[2.4G]   ✓ EnableDualBand=0 (禁用5G)\x1b[0m')
  } catch(e) {}
  
  try {
    // 方法5：Windows 11 设置应用数据库
    const settingsPath = require('path').join(require('os').env.LOCALAPPDATA || '', 'Packages', 'windows.immersivecontrolpanel_cw5n1h2txyewy', 'LocalState', 'indexed', 'settings.dat')
    if (require('fs').existsSync(settingsPath)) {
      console.log('\x1b[90m[2.4G]   ℹ 找到Windows设置数据库\x1b[0m')
    }
  } catch(e) {}
  
  console.log('\x1b[32m[2.4G] ✅ 已完成所有2.4GHz强制设置\x1b[0m')
}

function startHostedNetwork(ssid, password) {
  // 先强制设置2.4GHz频段
  force24GHzBand()
  
  // 方式1：传统托管网络（netsh wlan hostednetwork）- 强制2.4GHz
  try {
    execSync(`netsh wlan set hostednetwork mode=allow ssid="${ssid}" key="${password}" channel=6`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 10000
    })
    execSync('netsh wlan start hostednetwork', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 10000
    })
    console.log(`\x1b[32m[托管网络] WiFi热点已启动: ${ssid} (2.4GHz)\x1b[0m`)
    return true
  } catch (e) {
    console.log(`\x1b[33m[托管网络] 传统方式不支持此网卡，尝试 Windows 移动热点...\x1b[0m`)
  }

  // 方式2：Windows 10/11 移动热点 - 通过 GetConnectionProfiles 找到 WLAN Profile
  {
    const script = `$ErrorActionPreference = 'Continue'
Write-Output '=== Mobile Hotspot: GetConnectionProfiles ==='
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime] | Out-Null
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime] | Out-Null
[Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime] | Out-Null

Write-Output 'STEP1: Get all connection profiles...'
$allProfiles = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles()
Write-Output "  Total profiles: $($allProfiles.Count)"

$tm = $null
foreach ($p in $allProfiles) {
  Write-Output "  Profile: $($p.ProfileName) [WLAN=$($p.IsWlanConnectionProfile), WWAN=$($p.IsWwanConnectionProfile)]"
  if ($p.IsWlanConnectionProfile) {
    try {
      $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
      if ($tm) {
        Write-Output "  SUCCESS: TetheringManager from WLAN profile: $($p.ProfileName)"
        break
      }
    } catch {
      Write-Output "  FAILED: $($_.Exception.Message)"
    }
  }
}

if (-not $tm) {
  Write-Output 'STEP1b: try all profiles...'
  foreach ($p in $allProfiles) {
    try {
      $tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($p)
      if ($tm) { Write-Output "  SUCCESS: $($p.ProfileName)"; break }
    } catch {}
  }
}

if (-not $tm) {
  Write-Output 'FAIL: Cannot create TetheringManager'
  exit 1
}

Write-Output 'STEP2: Ensure icssvc is running...'
try {
  $svc = Get-Service -Name 'icssvc' -ErrorAction Stop
  if ($svc.Status -ne 'Running') {
    Start-Service -Name 'icssvc'
    Start-Sleep -Seconds 1
    Write-Output "  icssvc started: $((Get-Service -Name 'icssvc').Status)"
  } else {
    Write-Output '  icssvc already running'
  }
} catch {
  Write-Output "  icssvc: $_"
}

Write-Output 'STEP3: Stop any existing tethering first...'
try {
  $tm.StopTetheringAsync() | Out-Null
  Start-Sleep -Seconds 1
  Write-Output '  Stopped'
} catch {
  Write-Output '  No existing tethering to stop'
}

Write-Output 'STEP4: Force 2.4GHz band via registry...'
try {
  reg add "HKLM\Software\Microsoft\WlanSvc\Parameters\HostedNetworkSettings" /v Band /t REG_DWORD /d 1 /f | Out-Null
  Write-Output '  Forced 2.4GHz band'
} catch {
  Write-Output "  Registry set failed: $_"
}

Write-Output 'STEP5: Configure hotspot with custom SSID and password...'
try {
  $apConfig = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration]::new()
  $apConfig.Ssid = '${ssid}'
  $apConfig.Passphrase = '${password}'
  $tm.ConfigureAccessPointAsync($apConfig) | Out-Null
  Start-Sleep -Seconds 1
  Write-Output "  Configured: ${ssid}"
} catch {
  Write-Output "  Configure failed: $_"
}

Write-Output 'STEP6: Try start tethering...'
try {
  $startTask = $tm.StartTetheringAsync()
  try {
    $t2 = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeSystemExtensions]::AsTask($startTask)
    $t2.Wait()
    Write-Output "  Start OK"
  } catch {
    Write-Output "  AsTask failed, waiting 5s..."
    Start-Sleep -Seconds 5
    Write-Output "  Start wait done"
  }
} catch {
  Write-Output "  Start FAILED: $_"
  exit 1
}

Write-Output 'STEP6: Check for virtual adapter IP...'
Start-Sleep -Seconds 2
$virtualIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -and $_.IPAddress -notlike '*.0' -and $_.IPAddress -notlike '*.255' }
if ($virtualIPs) {
  foreach ($ip in $virtualIPs) {
    Write-Output "  IP: $($ip.IPAddress) on $($ip.InterfaceAlias)"
  }
} else {
  Write-Output '  No 192.168.x.x IP found, but tethering may still work'
}
Write-Output 'OK-TETHER'`
    try {
      const result = runPowerShell(script)
      if (result.includes('OK-TETHER')) {
        console.log(`\x1b[32m[移动热点] WiFi热点已启动: ${ssid}\x1b[0m`)
        return true
      }
      console.log(`\x1b[33m[移动热点] ${result.trim()}\x1b[0m`)
    } catch (e) {
      console.log(`\x1b[33m[移动热点] 异常: ${e.stderr || e.message}\x1b[0m`)
    }
  }

  // 方式3：WiFi Direct Legacy AP（兜底方案）
  {
    const script = `$ErrorActionPreference = 'Stop'
Write-Output '=== WiFi Direct Legacy AP ==='

Write-Output 'STEP0: Clean up any stale WiFi Direct state...'
try {
  $oldPub = [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher]::new()
  $oldPub.Stop()
  Start-Sleep -Seconds 1
  Write-Output '  Old publisher stopped'
} catch {
  Write-Output '  No old publisher (OK)'
}

Write-Output 'STEP1: Create publisher and start...'
try {
  $pub = [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher]::new()
  $pub.Advertisement.IsAutonomousGroupOwnerEnabled = $true
  $pub.Advertisement.LegacySettings.IsEnabled = $true
  $pub.Advertisement.LegacySettings.Ssid = '${ssid}'
  $pass = [Windows.Security.Credentials.PasswordCredential]::new()
  $pass.Password = '${password}'
  $pub.Advertisement.LegacySettings.Passphrase = $pass
  $pub.Start()
  Write-Output '  Publisher started, waiting 4s...'
} catch {
  Write-Output "FAIL: Cannot create publisher: $_"
  exit 1
}

Start-Sleep -Seconds 4
Write-Output "  Status: $($pub.Status)"
if ($pub.Status -ne 'Started') { Write-Output "FAIL: status=$($pub.Status)"; exit 1 }

Write-Output 'STEP2: Find virtual adapter (with InterfaceDescription)...'
$allAdapters = Get-NetAdapter | ForEach-Object {
  Write-Output "  $($_.Name) [$($_.Status)] Desc: $($_.InterfaceDescription)"
  $_
}
$vAdapter = $allAdapters | Where-Object {
  $_.InterfaceDescription -like '*Direct*' -or
  $_.InterfaceDescription -like '*Virtual*' -or
  $_.Name -like '*Wi-Fi Direct*' -or
  $_.Name -like '*Virtual*'
} | Select-Object -First 1

if (-not $vAdapter) {
  Write-Output 'STEP2b: Try hidden adapters...'
  $hidden = Get-NetAdapter -IncludeHidden | Where-Object {
    $_.InterfaceDescription -like '*Direct*' -or $_.Name -like '*Direct*'
  }
  if ($hidden) {
    foreach ($h in $hidden) {
      Write-Output "  Hidden: $($h.Name) [$($h.Status)] Desc: $($h.InterfaceDescription)"
      if ($h.Status -ne 'Up') {
        try { Enable-NetAdapter -Name $h.Name -Confirm:$false -EA 0; Start-Sleep 2; Write-Output "  Enabled: $($h.Name)" } catch {}
      }
    }
    $vAdapter = Get-NetAdapter | Where-Object {
      $_.InterfaceDescription -like '*Direct*' -or $_.Name -like '*Direct*'
    } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
  }
}

if (-not $vAdapter) {
  Write-Output 'STEP2c: Check for any adapter with 192.168.x.x IP...'
  $ipAdapter = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -and $_.IPAddress -notlike '*.0' -and $_.IPAddress -notlike '*.255' }
  if ($ipAdapter) {
    foreach ($ip in $ipAdapter) {
      Write-Output "  Found IP: $($ip.IPAddress) on $($ip.InterfaceAlias) [Idx=$($ip.InterfaceIndex)]"
    }
    $vAdapter = Get-NetAdapter -InterfaceIndex $ipAdapter[0].InterfaceIndex -ErrorAction SilentlyContinue
    if ($vAdapter) { Write-Output "  Using adapter: $($vAdapter.Name)" }
  }
}

if (-not $vAdapter) {
  Write-Output 'FAIL: Cannot find virtual adapter for WiFi Direct'
  Write-Output 'INFO: WiFi Direct advertisement is running but no usable adapter found'
  exit 1
}

Write-Output "  Selected: $($vAdapter.Name) [Idx=$($vAdapter.InterfaceIndex)]"

Write-Output 'STEP3: Configure IP 192.168.4.1...'
$existingIP = Get-NetIPAddress -InterfaceIndex $vAdapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
if ($existingIP) {
  Write-Output "  Existing IP: $($existingIP.IPAddress)"
  if ($existingIP.IPAddress -ne '192.168.4.1') {
    Remove-NetIPAddress -InterfaceIndex $vAdapter.InterfaceIndex -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
    New-NetIPAddress -InterfaceIndex $vAdapter.InterfaceIndex -IPAddress 192.168.4.1 -PrefixLength 24 -ErrorAction Stop | Out-Null
    Write-Output '  IP changed to 192.168.4.1'
  }
} else {
  New-NetIPAddress -InterfaceIndex $vAdapter.InterfaceIndex -IPAddress 192.168.4.1 -PrefixLength 24 -ErrorAction Stop | Out-Null
  Write-Output '  IP set to 192.168.4.1'
}

Write-Output 'STEP4: Stop publisher and hand over to keep-alive...'
$pub.Stop()
Start-Sleep -Seconds 1
Write-Output 'OK-WIFIDIRECT'`
    try {
      const result = runPowerShell(script)
      if (result.includes('OK-WIFIDIRECT')) {
        console.log(`\x1b[32m[WiFi Direct] 热点已启动: ${ssid} (2.4GHz, IP: 192.168.4.1)\x1b[0m`)
        // 启动后台保活进程，防止 PowerShell 脚本退出后热点消失
        startWifiDirectKeepAlive(ssid, password)
        return true
      }
      console.log(`\x1b[33m[WiFi Direct] ${result.trim()}\x1b[0m`)
    } catch (e) {
      console.log(`\x1b[33m[WiFi Direct] 异常: ${e.stderr || e.message}\x1b[0m`)
    }
  }

  return false
}

function stopHostedNetwork() {
  // 停止传统托管网络
  try {
    execSync('netsh wlan stop hostednetwork', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 10000
    })
    console.log('[托管网络] WiFi热点已停止')
  } catch (e) {
    // 忽略停止失败
  }

  // 停止WiFi Direct AP
  try {
    const script = `$ErrorActionPreference = 'SilentlyContinue'
# 1. Stop publisher in current process
try {
  [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher,Windows.Devices.WiFiDirect,ContentType=WindowsRuntime] | Out-Null
  $pub = [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher]::new()
  $pub.Stop()
  Start-Sleep -Seconds 1
} catch {}

# 2. Kill orphaned keep-alive PowerShell processes
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
  $_.CommandLine -like '*WiFiDirectAdvertisementPublisher*' -or $_.CommandLine -like '*KEEPALIVE*'
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Output "  Killed orphan keep-alive PID: $($_.ProcessId)"
}

# 3. Reset WiFi Direct virtual adapter to clear stale broadcast
$adapters = Get-NetAdapter -IncludeHidden | Where-Object {
  $_.Name -like '*Direct*' -or $_.InterfaceDescription -like '*Direct*'
}
foreach ($a in $adapters) {
  Write-Output "  Resetting adapter: $($a.Name)"
  Disable-NetAdapter -Name $a.Name -Confirm:$false -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Enable-NetAdapter -Name $a.Name -Confirm:$false -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}`
    runPowerShell(script)
    console.log('[WiFi Direct] WiFi热点已停止')
  } catch (e) {
    // 忽略停止失败
  }

  // 停止Windows移动热点
  try {
    const script = `$ErrorActionPreference = 'SilentlyContinue'
# 停止 ICS 服务关闭 Windows 移动热点（不重启，避免自动恢复默认设置）
$svc = Get-Service -Name 'icssvc' -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
  Stop-Service -Name 'icssvc' -Force -ErrorAction SilentlyContinue
  Write-Output 'icssvc stopped'
}`
    runPowerShell(script)
    console.log('[移动热点] WiFi热点已停止')
  } catch (e) {
    // 忽略停止失败
  }

  // 停止WiFi Direct后台保活进程
  if (wifiDirectKeepAlive) {
    try {
      wifiDirectKeepAlive.kill()
    } catch (e) {
      try {
        execSync(`taskkill /PID ${wifiDirectKeepAlive.pid} /F /T`, { stdio: 'ignore' })
      } catch (e2) {}
    }
    console.log('[WiFi Direct] 后台保活进程已终止')
    wifiDirectKeepAlive = null
  }
}

function startWifiDirectKeepAlive(ssid, password) {
  try {
    const keepAliveScript = `[Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher,Windows.Devices.WiFiDirect,ContentType=WindowsRuntime] | Out-Null
[Windows.Security.Credentials.PasswordCredential,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
$pub = [Windows.Devices.WiFiDirect.WiFiDirectAdvertisementPublisher]::new()
$pub.Advertisement.IsAutonomousGroupOwnerEnabled = $true
$pub.Advertisement.LegacySettings.IsEnabled = $true
$pub.Advertisement.LegacySettings.Ssid = '${ssid}'
$pass = [Windows.Security.Credentials.PasswordCredential]::new()
$pass.Password = '${password}'
$pub.Advertisement.LegacySettings.Passphrase = $pass
$pub.Start()
Write-Output 'KEEPALIVE_OK'
while ($true) { Start-Sleep -Seconds 60 }`

    wifiDirectKeepAlive = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', keepAliveScript
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let started = false
    wifiDirectKeepAlive.stdout.on('data', (data) => {
      if (data.toString().includes('KEEPALIVE_OK') && !started) {
        started = true
        console.log(`\x1b[32m[WiFi Direct] 后台保活进程已启动 (PID: ${wifiDirectKeepAlive.pid})\x1b[0m`)
      }
    })

    wifiDirectKeepAlive.on('error', (err) => {
      console.log(`\x1b[33m[WiFi Direct] 保活进程错误: ${err.message}\x1b[0m`)
    })

    wifiDirectKeepAlive.on('close', (code) => {
      console.log(`\x1b[33m[WiFi Direct] 保活进程已退出 (code=${code})，热点可能已关闭\x1b[0m`)
      wifiDirectKeepAlive = null
    })

    wifiDirectKeepAlive.unref()
  } catch (e) {
    console.log(`\x1b[33m[WiFi Direct] 启动保活进程失败: ${e.message}\x1b[0m`)
  }
}

function getHostedNetworkIP() {
  const interfaces = os.networkInterfaces()
  // WiFi Direct / 移动热点常见的IP段
  const hotspotRanges = ['192.168.137.', '192.168.0.', '192.168.1.', '192.168.2.', '172.16.']
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        for (const range of hotspotRanges) {
          if (iface.address.startsWith(range)) {
            return iface.address
          }
        }
      }
    }
  }
  // 返回任意非内部IP
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '192.168.137.1'
}

function getOrGenerateApConfig() {
  const config = loadApConfig()
  const prevCount = config.restartCount || 0
  config.restartCount = prevCount + 1
  
  const willReset = !config.ssid || !config.password || config.restartCount > 10
  
  if (willReset) {
    // 重置确认：不分系统，输入 iot 确认
    console.log('')
    console.log('\x1b[43m\x1b[30m' + '='.repeat(60) + '\x1b[0m')
    console.log('\x1b[43m\x1b[30m  ⚠️  即将重置无网热点名称、密码\x1b[0m')
    console.log('\x1b[43m\x1b[30m' + '='.repeat(60) + '\x1b[0m')
    console.log('')
    console.log('\x1b[33m  要重置无网热点的名称密码，输入iot确认（无论大小写）\x1b[0m')
    console.log('')
    
    try {
      execSync('powershell -NoProfile -Command "Write-Host \'  \' -NoNewline; $input = Read-Host; if ($input -eq \'iot\' -or $input -eq \'IOT\' -or $input -eq \'Iot\') { Write-Host \'  ✓ 确认重置！\' -ForegroundColor Green; exit 0 } else { Write-Host \'  ✗ 已取消重置\' -ForegroundColor Yellow; exit 1 }"', {
        stdio: 'inherit'
      })
    } catch (e) {
      // 用户取消或输入错误，跳过重置
      console.log('')
      console.log('\x1b[33m  已跳过重置，继续使用现有配置...\x1b[0m')
      console.log('')
      config.restartCount = prevCount  // 回滚计数
      saveApConfig(config)
      return config
    }
    
    config.ssid = `IoT-AP-${generateRandomString(6)}`
    config.password = generateRandomString(8)
    config.restartCount = 0
    console.log(`\x1b[91m已重置，请注意更改配置\x1b[0m`)
    console.log(`\x1b[36m[无网AP] 生成新的随机WiFi: ${config.ssid} 密码: ${config.password}\x1b[0m`)
  } else {
    const remaining = 10 - prevCount
    console.log('')
    console.log(`\x1b[91m断网AP重启${remaining}次后会重置WiFi名称、密码\x1b[0m`)
    console.log(`\x1b[36m[无网AP] 使用已有的WiFi: ${config.ssid} 密码: ${config.password}\x1b[0m`)
    console.log('')
  }
  
  saveApConfig(config)
  return config
}

function getApConfig() {
  return loadApConfig()
}

// 判断是否为"假"IP（虚拟适配器、APIPA等，没有真正的互联网连接）
function isFakeIP(addr) {
  if (addr.startsWith('169.254.')) return true   // APIPA（DHCP失败自动分配）
  if (addr.startsWith('2.0.0.')) return true      // 虚拟机/虚拟适配器残留
  if (addr.startsWith('192.168.4.')) return true   // WiFi Direct 虚拟适配器
  if (addr.startsWith('192.168.137.')) return true // Windows 移动热点（自己创建的）
  return false
}

function isOffline() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !isFakeIP(iface.address)) {
        return false
      }
    }
  }
  return true
}

// 检测 Windows 移动热点是否已运行（检查是否有 137.x 网段接口）
function isHotspotAlreadyRunning() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.137.')) {
        return true
      }
    }
  }
  return false
}

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  // 优先返回 137 网段（最稳定），其次192.168.x（排除假IP），最后其他
  let fallback192 = null
  let fallbackAny = null
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !isFakeIP(iface.address)) {
        if (iface.address.startsWith('192.168.137.')) return iface.address
        if (iface.address.startsWith('192.168.') && !iface.address.startsWith('192.168.4.')) {
          fallback192 = fallback192 || iface.address
        }
        fallbackAny = fallbackAny || iface.address
      }
    }
  }
  return fallback192 || fallbackAny || getHostedNetworkIP()
}

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})
app.use(express.static(path.join(__dirname, 'public')))

let broker = null
let wsServer = null
let tcpServer = null
let publishClient = null
let clientCount = 0
const connectedClients = new Set()

function getDataFilePath() {
  return path.join(DATA_DIR, 'iot-data.json')
}

function loadData() {
  try {
    if (fs.existsSync(getDataFilePath())) {
      return JSON.parse(fs.readFileSync(getDataFilePath(), 'utf-8'))
    }
  } catch (e) {
    console.error('读取数据文件失败:', e.message)
  }
  return []
}

function saveData(topics) {
  fs.writeFileSync(getDataFilePath(), JSON.stringify(topics, null, 2), 'utf-8')
}

function addSystemMessage(payload) {
  const topics = loadData()
  const sysTopic = topics.find(t => t.topic === '系统信息')
  const message = { timestamp: Date.now(), payload }
  if (sysTopic) {
    sysTopic.messages.push(message)
    if (sysTopic.messages.length > 500) {
      sysTopic.messages = sysTopic.messages.slice(-500)
    }
  } else {
    topics.push({ topic: '系统信息', mode: 'siot', messages: [message] })
  }
  saveData(topics)
}

function ensureSystemTopic() {
  let topics = loadData()
  topics = topics.filter(t => !t.topic.startsWith('$SYS/'))
  if (!topics.find(t => t.topic === '系统信息')) {
    const offline = isOffline()
    let msg = '内网服务已启动'
    if (offline || apHotspotStarted) {
      const apConfig = getApConfig()
      msg = `内网服务已启动（无网AP模式）—— WiFi: ${apConfig.ssid}  密码: ${apConfig.password}`
    }
    topics.push({ topic: '系统信息', mode: 'siot', messages: [{ timestamp: Date.now(), payload: msg }] })
  }
  saveData(topics)
}

async function startBroker() {
  if (broker) {
    return { wsPort: BROKER_WS_PORT, tcpPort: BROKER_TCP_PORT, status: 'already_running' }
  }
  const { Aedes } = await import('aedes')
  broker = await Aedes.createBroker({
    id: 'iot-panel-broker',
    concurrency: 100,
    authenticate: (client, username, password, callback) => {
      // 匿名连接（可视化面板自己用）
      if (!username) {
        return callback(null, true)
      }
      // 接受默认 SIoT 凭证（Mind+ 用）
      const user = username.toString()
      const pass = password ? password.toString() : ''
      if (user === 'siot' && pass === 'dfrobot') {
        return callback(null, true)
      }
      // 其他凭证拒绝
      return callback(null, false)
    }
  })

  broker.on('client', (client) => {
    if (client.id === 'iot-server-publisher') return
    if (!connectedClients.has(client.id)) {
      connectedClients.add(client.id)
      clientCount = connectedClients.size
      addSystemMessage(`设备已连接 (ID: ${client.id})`)
    }
  })

  broker.on('clientDisconnect', (client) => {
    if (client.id === 'iot-server-publisher') return
    connectedClients.delete(client.id)
    clientCount = connectedClients.size
    addSystemMessage(`设备已断开 (ID: ${client.id})`)
  })

  broker.on('publish', (packet, client) => {
    if (packet.topic && packet.payload && !packet.topic.startsWith('$SYS/')) {
      const topics = loadData()
      const topicName = packet.topic
      const payload = packet.payload.toString()

      const existing = topics.find(t => t.topic === topicName)
      const message = { timestamp: Date.now(), payload }
      if (existing) {
        existing.messages.push(message)
        if (existing.messages.length > 500) {
          existing.messages = existing.messages.slice(-500)
        }
      } else {
        const newTopic = {
          topic: topicName,
          mode: 'siot',
          messages: [message]
        }
        topics.push(newTopic)
      }
      saveData(topics)
    }
  })

  return new Promise((resolve, reject) => {
    // WebSocket 服务器（浏览器 MQTT.js 用）
    wsServer = new WebSocket.Server({ port: BROKER_WS_PORT, host: '0.0.0.0' })
    wsServer.on('connection', (ws) => {
      const stream = WebSocket.createWebSocketStream(ws)
      broker.handle(stream)
    })
    wsServer.on('listening', () => {
      console.log(`MQTT Broker (WebSocket) 已启动，端口 ${BROKER_WS_PORT}`)
    })
    wsServer.on('error', (err) => {
      console.error('WebSocket 服务器启动失败:', err.message)
    })

    // TCP 服务器（Mind+ / ESP32 用）
    tcpServer = net.createServer(broker.handle)
    tcpServer.listen(BROKER_TCP_PORT, '0.0.0.0', () => {
      console.log(`MQTT Broker (TCP) 已启动，端口 ${BROKER_TCP_PORT}`)
      addSystemMessage(`MQTT Broker 已启动 (WebSocket:${BROKER_WS_PORT}, TCP:${BROKER_TCP_PORT})`)
      
      // 创建持久 MQTT 客户端，用于 HTTP API 发布消息
      publishClient = mqtt.connect(`mqtt://127.0.0.1:${BROKER_TCP_PORT}`, {
        clientId: 'iot-server-publisher',
        clean: true,
        protocolVersion: 4,
        reconnectPeriod: 3000,
        connectTimeout: 5000
      })
      publishClient.on('connect', () => {
        console.log('发布客户端已连接到 MQTT Broker')
      })
      publishClient.on('error', (err) => {
        console.error('发布客户端错误:', err.message)
      })
      publishClient.on('offline', () => {
        console.warn('发布客户端离线')
      })
      
      resolve({ wsPort: BROKER_WS_PORT, tcpPort: BROKER_TCP_PORT, status: 'started' })
    })
    tcpServer.on('error', (err) => {
      console.error('TCP 服务器启动失败:', err.message)
      wsServer.close()
      wsServer = null
      tcpServer = null
      broker = null
      reject(err)
    })
  })
}

function stopBroker() {
  return new Promise((resolve) => {
    if (broker) {
      broker.close(() => {
        if (publishClient) {
          publishClient.end(true)
          publishClient = null
        }
        if (wsServer) {
          wsServer.close()
          wsServer = null
        }
        if (tcpServer) {
          tcpServer.close()
          tcpServer = null
        }
        broker = null
        connectedClients.clear()
        clientCount = 0
        addSystemMessage('MQTT Broker 已停止')
        console.log('MQTT Broker 已停止')
        resolve({ status: 'stopped' })
      })
    } else {
      resolve({ status: 'not_running' })
    }
  })
}

function getBrokerStatus() {
  return {
    running: !!broker,
    wsPort: BROKER_WS_PORT,
    tcpPort: BROKER_TCP_PORT,
    clients: clientCount
  }
}

app.get('/api/status', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  const ip = getLocalIP()
  const offline = isOffline()
  const esp32IP = apHotspotStarted && hotspotIP ? hotspotIP : ip
  let apInfo = null
  if (offline || apHotspotStarted) {
    apInfo = getApConfig()
  }
  const accessUrl = offline ? `http://localhost:${WEB_PORT}` : `http://${ip}:${WEB_PORT}`
  res.json({
    ip,
    esp32IP,
    webPort: WEB_PORT,
    broker: getBrokerStatus(),
    accessUrl: accessUrl,
    isOffline: offline,
    hotspotStarted: apHotspotStarted,
    apInfo: apInfo ? { ssid: apInfo.ssid, password: apInfo.password } : null
  })
})

app.post('/api/broker/start', async (req, res) => {
  try {
    const result = await startBroker()
    res.json({ success: true, ...result, ip: getLocalIP() })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.post('/api/broker/stop', async (req, res) => {
  try {
    const result = await stopBroker()
    res.json({ success: true, ...result })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

app.get('/api/topics/modes', (req, res) => {
  const topics = loadData()
  const modes = {}
  topics.forEach(t => {
    if (t.topic !== '系统信息' && !t.topic.startsWith('$SYS/')) {
      modes[t.topic] = {
        mode: t.mode || 'siot',
        originalTopic: t.originalTopic || null
      }
    }
  })
  res.json(modes)
})

app.get('/api/topics', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  let topics = loadData()
  topics = topics.filter(t => !t.topic.startsWith('$SYS/'))
  const sysIdx = topics.findIndex(t => t.topic === '系统信息')
  if (sysIdx > 0) {
    const sysTopic = topics.splice(sysIdx, 1)[0]
    topics.unshift(sysTopic)
  }
  res.json(topics)
})

app.get('/api/topics/:topic', (req, res) => {
  const topics = loadData()
  const topic = topics.find(t => t.topic === req.params.topic)
  if (topic) {
    res.json(topic)
  } else {
    res.status(404).json({ error: '主题不存在' })
  }
})

app.delete('/api/topics/:topic', (req, res) => {
  if (req.params.topic === '系统信息') {
    return res.status(403).json({ error: '系统信息主题不可删除' })
  }
  let topics = loadData()
  topics = topics.filter(t => t.topic !== req.params.topic)
  saveData(topics)
  res.json({ success: true })
})

app.delete('/api/topics/:topic/messages', (req, res) => {
  const topics = loadData()
  const topic = topics.find(t => t.topic === req.params.topic)
  if (topic) {
    topic.messages = []
    saveData(topics)
    res.json({ success: true })
  } else {
    res.status(404).json({ error: '主题不存在' })
  }
})

app.delete('/api/topics', (req, res) => {
  const sysTopic = loadData().find(t => t.topic === '系统信息')
  saveData(sysTopic ? [sysTopic] : [])
  res.json({ success: true })
})

// ========== 项目文件管理 API ==========
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')

if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true })
}

function getProjectFilePath(projectName) {
  const safeName = projectName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
  return path.join(PROJECTS_DIR, `${safeName}.json`)
}

app.get('/api/projects', (req, res) => {
  try {
    const files = fs.readdirSync(PROJECTS_DIR)
    const projects = files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const content = fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf-8')
          const project = JSON.parse(content)
          return project
        } catch {
          return null
        }
      })
      .filter(p => p !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    res.json(projects)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/projects/:name', (req, res) => {
  try {
    const filePath = getProjectFilePath(req.params.name)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      res.json(JSON.parse(content))
    } else {
      res.status(404).json({ error: '项目不存在' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/projects', (req, res) => {
  try {
    const project = req.body
    if (!project || !project.name) {
      return res.status(400).json({ error: '项目名称不能为空' })
    }
    const filePath = getProjectFilePath(project.name)
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8')
    res.json({ success: true, project })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/api/projects/:name', (req, res) => {
  try {
    const project = req.body
    const filePath = getProjectFilePath(req.params.name)
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8')
      res.json({ success: true, project })
    } else {
      res.status(404).json({ error: '项目不存在' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/projects/:name', (req, res) => {
  try {
    const filePath = getProjectFilePath(req.params.name)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      res.json({ success: true })
    } else {
      res.status(404).json({ error: '项目不存在' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/topics/:topic/publish', (req, res) => {
  const { payload } = req.body
  if (!payload) {
    return res.status(400).json({ error: 'payload 不能为空' })
  }
  const topicName = req.params.topic

  const topics = loadData()
  let existingTopic = topics.find(t => t.topic === topicName)
  if (!existingTopic) {
    topics.push({ topic: topicName, mode: 'siot', messages: [] })
    saveData(topics)
  }

  if (broker) {
    const packet = { topic: topicName, payload, qos: 0, retain: false }
    packet.__fromHttp = true
    broker.publish(packet, () => {
      console.log(`[发布] 主题: ${topicName}, 内容: ${payload}`)
    })
  }

  res.json({ success: true })
})

// 测试发布消息（用于调试）
app.post('/api/test/publish', async (req, res) => {
  const { topic, payload } = req.body
  if (!topic || !payload) {
    return res.status(400).json({ error: 'topic 和 payload 不能为空' })
  }

  console.log(`测试发布: 主题=${topic}, 内容=${payload}`)

  // 检查订阅者
  if (broker && broker.persistence) {
    try {
      const subs = await broker.persistence.subscriptionsByTopic(topic)
      console.log(`主题 ${topic} 的订阅者:`, JSON.stringify(subs.map((s) => ({ clientId: s.clientId, topic: s.topic }))))
    } catch (e) {
      console.log('无法查询订阅者:', e)
    }
  }

  // 同时使用两种方式发布
  let results = []

  // 方式1: broker.publish
  if (broker) {
    broker.publish({ topic, payload, qos: 0, retain: false }, () => {
      console.log(`broker.publish 完成: ${topic}`)
      results.push('broker.publish:OK')
    })
  }

  // 方式2: publishClient
  if (publishClient && publishClient.connected) {
    publishClient.publish(topic, payload, { qos: 0, retain: false }, (err) => {
      if (err) {
        console.error('publishClient 发布失败:', err.message)
        results.push('publishClient:FAIL')
      } else {
        console.log(`publishClient 发布成功: ${topic}`)
        results.push('publishClient:OK')
      }
    })
  } else {
    results.push('publishClient:NOT_CONNECTED')
  }

  res.json({ success: true, message: `消息已发布到主题 ${topic}`, results })
})

// 启动时：先检测断网，关闭已有热点（避免干扰新AP创建），再创建真实WiFi热点

// Windows 11 检测：提示用户手动设置2.4GHz频段
// 使用 PowerShell Read-Host 阻塞等待（npm run 会吃掉 Node.js 的 stdin）
function checkWin11AndPrompt() {
  try {
    const release = os.release()
    const buildNumber = parseInt(release.split('.')[2]) || 0
    
    // 只有无网模式下才需要提示（有网时不需要创建热点）
    if (buildNumber >= 22000 && isOffline()) {
      console.log('')
      console.log('\x1b[43m\x1b[30m' + '='.repeat(60) + '\x1b[0m')
      console.log('\x1b[43m\x1b[30m  ⚠️  检测到 Windows 11 系统\x1b[0m')
      console.log('\x1b[43m\x1b[30m' + '='.repeat(60) + '\x1b[0m')
      console.log('')
      console.log('\x1b[33m  ESP32 只能连接 2.4GHz WiFi，但 Win11 默认可能创建 5GHz 热点！\x1b[0m')
      console.log('')
      console.log('\x1b[36m  请手动设置（否则主板无法连接）：\x1b[0m')
      console.log('\x1b[36m  Windows 设置 → 网络和 Internet → 移动热点 → 高级设置\x1b[0m')
      console.log('\x1b[36m  将 "频段" 从 "任何可用" 改为 "2.4 GHz"\x1b[0m')
      console.log('')
      
      execSync('powershell -NoProfile -Command "Write-Host \'  设置好后请输入 IOT 继续: \' -ForegroundColor Green -NoNewline; $input = Read-Host; if ($input -eq \'IOT\') { Write-Host \'  ✓ 收到！正在启动内网服务...\' -ForegroundColor Green; Write-Host \'\' } else { Write-Host \'  ℹ 已继续（请确保已设置为2.4GHz）\' -ForegroundColor Yellow; Write-Host \'\' }"', {
        stdio: 'inherit'
      })
    }
  } catch (e) {
    // 忽略错误
  }
}

let apHotspotStarted = false
let hotspotIP = null
let wifiDirectKeepAlive = null

async function startOfflineHotspot() {
  console.log(`\x1b[90m[启动前] 清理已有热点，避免干扰...\x1b[0m`)
  stopHostedNetwork()
  
  console.log('\x1b[36m[启动前] 强制设置2.4GHz频段（ESP32兼容）...\x1b[0m')
  force24GHzBand()
  
  try {
    execSync('net stop wlan /y', { stdio: 'ignore', timeout: 10000 })
    execSync('net start wlan', { stdio: 'ignore', timeout: 10000 })
    console.log('\x1b[36m[2.4G] WLAN服务已重启\x1b[0m')
    await new Promise(resolve => setTimeout(resolve, 3000))
  } catch (e) {
    console.log('\x1b[33m[2.4G] WLAN服务重启失败（继续尝试）\x1b[0m')
  }
  
  const apConfig = getOrGenerateApConfig()
  apHotspotStarted = startHostedNetwork(apConfig.ssid, apConfig.password)
  
  if (apHotspotStarted) {
    console.log('[托管网络] 等待WiFi热点就绪（最多等待5秒）...')
    const waitStart = Date.now()
    let detectedIP = null
    while (Date.now() - waitStart < 5000) {
      const currentIP = getHostedNetworkIP()
      if (currentIP) {
        detectedIP = currentIP
        break
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      const interfaces = os.networkInterfaces()
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            detectedIP = iface.address
            break
          }
        }
        if (detectedIP) break
      }
      if (detectedIP) break
    }
    hotspotIP = detectedIP || getHostedNetworkIP()
    
    console.log(`\x1b[36m[网络诊断] 当前所有网卡IP:\x1b[0m`)
    const allIfs = os.networkInterfaces()
    for (const name of Object.keys(allIfs)) {
      for (const iface of allIfs[name]) {
        if (iface.family === 'IPv4') {
          const tag = iface.internal ? '(内部)' : iface.address === hotspotIP ? '← 热点IP' : ''
          console.log(`\x1b[90m  - ${name}: ${iface.address} ${tag}\x1b[0m`)
        }
      }
    }
    console.log(`\x1b[32m[网络诊断] 使用热点IP: ${hotspotIP}\x1b[0m`)
    
    console.log('\x1b[36m[诊断] 检查热点频段...\x1b[0m')
    try {
      execSync('netsh wlan show networks mode=bssid > "%TEMP%\\wifi_scan.txt"', {
        stdio: 'ignore', timeout: 10000
      })
      
      const scanResult = fs.readFileSync(path.join(os.tmpdir(), 'wifi_scan.txt'), 'utf-8')
      const lines = scanResult.split('\n')
      let currentSSID = ''
      let foundInfo = null
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('SSID')) {
          currentSSID = trimmed.split(':')[1]?.trim() || ''
        }
        if (currentSSID === apConfig.ssid && trimmed.includes('信道') && trimmed.includes(':')) {
          const channelMatch = trimmed.match(/(\d+)/)
          if (channelMatch) {
            const ch = parseInt(channelMatch[1])
            foundInfo = `Channel=${ch} (${ch <= 14 ? '2.4GHz' : '5GHz'})`
            break
          }
        }
      }
      
      if (foundInfo) {
        console.log(`\x1b[90m[诊断] 热点 ${apConfig.ssid}: ${foundInfo}\x1b[0m`)
        if (foundInfo.includes('5GHz')) {
          console.log('\x1b[31m[警告] ⚠️ 热点是5GHz！ESP32无法连接！\x1b[0m')
          console.log('\x1b[33m[建议] 手动设置: Windows设置→网络和Internet→移动热点→高级→改为2.4GHz\x1b[0m')
        } else {
          console.log('\x1b[32m[确认] ✅ 热点已使用2.4GHz\x1b[0m')
        }
      } else {
        console.log('\x1b[90m[诊断] 未扫描到热点（可能需要等待）\x1b[0m')
      }
    } catch (e) {
      console.log('\x1b[33m[诊断] 频段检测失败: ' + e.message.slice(0,50) + '\x1b[0m')
    }
  }
}

(async function startupCheck() {
  try {
    const hotspotRunning = isHotspotAlreadyRunning()
    
    if (isOffline()) {
      checkWin11AndPrompt()
      await startOfflineHotspot()
    } else if (hotspotRunning) {
      // 热点已运行（上一次cmd窗口关闭后热点保留），直接复用
      console.log(`\x1b[32m[检测] Windows 移动热点已运行，直接复用\x1b[0m`)
      apHotspotStarted = true
      hotspotIP = getLocalIP()
      const apConfig = getApConfig()
      console.log(`\x1b[36m[信息] 热点IP: ${hotspotIP}\x1b[0m`)
      if (apConfig.ssid) {
        console.log(`\x1b[36m[信息] WiFi名称: ${apConfig.ssid}\x1b[0m`)
      }
    } else {
      checkWin11AndPrompt()
    }
  } catch (err) {
    console.error('\x1b[31m[启动错误]', err.message, '\x1b[0m')
    process.exit(1)
  }
})()

// 检测：有网但IP是4.1 → 旧热点残留，禁止启动
if (!isOffline() && !apHotspotStarted && getLocalIP() === '192.168.4.1') {
  console.error(`\x1b[31m============================================\x1b[0m`)
  console.error(`\x1b[31m  请关掉先前的热点再重新打开程序！！！！！！\x1b[0m`)
  console.error(`\x1b[31m============================================\x1b[0m`)
  process.exit(1)
}

const httpServer = http.createServer(app)
ensureSystemTopic()

// 处理端口占用等错误，防止崩溃后触发热点清理
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[错误] 端口 ${WEB_PORT} 已被占用，请先关闭正在运行的旧进程！\x1b[0m`)
    console.error(`\x1b[31m       运行命令: taskkill /F /IM node.exe  或重启电脑\x1b[0m`)
  } else {
    console.error(`\x1b[31m[错误] HTTP服务器启动失败: ${err.message}\x1b[0m`)
  }
  process.exit(1)
})

httpServer.listen(WEB_PORT, '0.0.0.0', () => {
  const ip = getLocalIP()
  const offline = isOffline()
  const esp32IP = apHotspotStarted && hotspotIP ? hotspotIP : ip

  console.log(`============================================`)
  console.log(`  IoT 内网服务已启动`)
  console.log(``)
  if (offline || apHotspotStarted) {
    const apConfig = getApConfig()
    if (offline && !apHotspotStarted) {
      console.log(`\x1b[33m  ⚠ 当前电脑无网络连接，已启用模拟AP模式\x1b[0m`)
    }
    if (apHotspotStarted) {
      console.log(`\x1b[32m  ✓ WiFi热点已创建（真实AP模式）\x1b[0m`)
      console.log(`\x1b[32m  （设备需连接到上方WiFi后，通过 ${esp32IP} 访问）\x1b[0m`)
    }
    console.log(`\x1b[36m  WiFi名称: ${apConfig.ssid}\x1b[0m`)
    console.log(`\x1b[36m  WiFi密码: ${apConfig.password}\x1b[0m`)
    console.log(`\x1b[36m  本机访问:  http://localhost:${WEB_PORT}\x1b[0m`)
    if (apHotspotStarted && hotspotIP) {
      console.log(`\x1b[36m  设备IP:    http://${esp32IP}:${WEB_PORT}（设备需连接上方WiFi）\x1b[0m`)
      console.log(`  MQTT Broker:   ${esp32IP}:${BROKER_TCP_PORT} (TCP) / ${esp32IP}:${BROKER_WS_PORT} (WebSocket)`)
    } else {
      console.log(`\x1b[36m  设备访问:  http://${ip}:${WEB_PORT}（设备需连接上方WiFi）\x1b[0m`)
      console.log(`  MQTT Broker:   ${ip}:${BROKER_TCP_PORT} (TCP) / ${ip}:${BROKER_WS_PORT} (WebSocket)`)
    }
  } else {
    console.log(`  数据管理页面: http://${ip}:${WEB_PORT}`)
    console.log(`  MQTT Broker:   ${ip}:${BROKER_TCP_PORT} (TCP) / ${ip}:${BROKER_WS_PORT} (WebSocket)`)
  }
  console.log(`  本地访问:      http://localhost:${WEB_PORT}`)
  console.log(``)
  console.log(`\x1b[33m============================================\x1b[0m`)
  console.log(`  ESP32/Mind+ 连接: IP ${esp32IP}  端口 ${BROKER_TCP_PORT}  账号 siot  密码 dfrobot`)
  console.log(`\x1b[33m============================================\x1b[0m`)
  
  console.log(``)
  console.log(`\x1b[94m提示: 在可视化面板中点击"内网服务"可开关MQTT Broker\x1b[0m`)
  console.log(``)
  console.log(`\x1b[33m注意: 完全打开内网需要用可视化面板打开 Broker 服务！否则主板将无法连接！\x1b[0m`)
  console.log(``)
  console.log(`\x1b[31m警告: 关闭此窗口将停止所有服务\x1b[0m`)
  console.log(`============================================`)
})

// 进程退出时关闭托管网络
process.on('exit', () => {
  if (apHotspotStarted) {
    stopHostedNetwork()
  }
})
process.on('SIGINT', () => {
  if (apHotspotStarted) {
    stopHostedNetwork()
  }
  process.exit()
})
process.on('SIGTERM', () => {
  if (apHotspotStarted) {
    stopHostedNetwork()
  }
  process.exit()
})
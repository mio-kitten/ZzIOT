@echo off
chcp 65001 >nul 2>&1
title ZzIOT-内网服务 ^> 启动
cd /d "%~dp0"

echo.
echo ================================================
echo          ZzIOT-内网服务 ^> 启动
echo ================================================
echo.

whoami /groups 2>nul | find "S-1-16-12288" >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请以管理员身份运行此程序！
    echo.
    echo 右键点击"启动内网服务.bat"，选择"以管理员身份运行"
    echo.
    pause
    exit /b
)
echo [OK] 已获取管理员权限
echo.

echo [注意] 请确保 WiFi 开关处于开启状态（即使不连接网络）
echo 正在检查 WiFi 状态...

> "%TEMP%\wifi_check.ps1" echo $w=Get-NetAdapter -Physical ^| Where-Object {($_.InterfaceType -eq 71^) -or ($_.Name -match 'Wi-Fi^|WLAN^|Wireless^|802.11^|WiFi^|无线'^)} ^| Select-Object -First 1
>> "%TEMP%\wifi_check.ps1" echo if(-not $w){'NO_WIFI'}elseif($w.Status -eq 'Up'){'WIFI_OK'}elseif($w.Status -eq 'Disabled'){Enable-NetAdapter -Name $w.Name -Confirm:$false -EA 0;sleep 2;$w2=Get-NetAdapter -Name $w.Name;if($w2.Status -eq 'Up'){'WIFI_ENABLED'}else{'WIFI_FAIL'}}else{'WIFI_NOT_UP:'+$w.Status}

powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\wifi_check.ps1" > "%TEMP%\wifi_check.txt"
set /p WIFI_STATUS=<"%TEMP%\wifi_check.txt" 2>nul
del "%TEMP%\wifi_check.ps1" 2>nul
del "%TEMP%\wifi_check.txt" 2>nul

if "%WIFI_STATUS%"=="" goto :SKIP_WIFI
if "%WIFI_STATUS%"=="NO_WIFI" goto :SKIP_WIFI
if "%WIFI_STATUS%"=="WIFI_FAIL" (
    echo [错误] WiFi 开关已关闭，尝试自动开启失败
    echo 请手动打开 WiFi 开关后重新运行
    echo.
    echo 按下任意键退出...
    pause >nul
    exit /b
)
if "%WIFI_STATUS%"=="WIFI_ENABLED" (
    echo [OK] WiFi 已自动开启
    echo.
)
if "%WIFI_STATUS%"=="WIFI_OK" (
    echo [OK] WiFi 已开启
    echo.
)
:SKIP_WIFI

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo 请运行"检查安装依赖"或者在文件夹中安装对应 node 安装包
    echo.
    echo 按下任意键退出...
    pause >nul
    exit /b
)

REM 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [错误] 项目依赖未安装
    echo 请先运行"检查安装依赖.bat"安装项目依赖
    echo.
    echo 按下任意键退出...
    pause >nul
    exit /b
)

echo 启动内网服务后端...
start "ZzIOT-内网数据面板" cmd /k "cd /d ""%~dp0"" && npm run server"
echo.
echo ================================================
echo         内网服务启动完成！
echo ================================================
echo.
echo 数据管理页面: http://localhost:8080
echo 提示: 在可视化面板中点击"内网服务"可开关MQTT Broker
echo.
echo 本窗口将在 3 秒后自动关闭...
timeout /t 3 /nobreak >nul
exit
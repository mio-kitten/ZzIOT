@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title ZzIOT-可视化面板集合工具

echo.
echo ================================================
echo        ZzIOT ^> 一键检查依赖安装
echo ================================================
echo.

REM 检测是否是 x86（32位）系统
if /i "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if not defined PROCESSOR_ARCHITEW6432 (
        echo 此系统是X86，无法安装
        pause
        exit /b
    )
)

REM 检测 Windows 版本是否支持 Node.js（Node v26 需要 Windows 10 或更高版本）
for /f "skip=1 tokens=2 delims==" %%v in ('wmic os get Version /value 2^>nul') do (
    set "OS_VERSION=%%v"
    goto :check_ver
)
:check_ver
if defined OS_VERSION (
    for /f "tokens=1 delims=." %%m in ("%OS_VERSION%") do (
        if %%m lss 10 (
            echo 此系统是无法运行node，无法安装
            echo 当前系统版本: %OS_VERSION%（Node.js v26 需要 Windows 10 或更高版本）
            pause
            exit /b
        )
    )
)

echo.

REM 保存脚本所在目录，也将作为工作目录
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo 工作目录: %SCRIPT_DIR%
echo.

REM 预先检测架构（在 if 块外赋值，避免变量展开问题）
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
echo 当前架构: %ARCH%

set "NODE_MSI=%SCRIPT_DIR%node-v26.8.1-%ARCH%.msi"

where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js 已安装
    node --version
    goto :installed
)

echo [WARNING] Node.js 未安装

if exist "%NODE_MSI%" (
    echo 开始本地安装node......
    echo 安装包: node-v26.8.1-%ARCH%.msi
    echo 正在启动安装程序，请稍候...
    start /wait "" msiexec /i "%NODE_MSI%" /passive /norestart
    echo.
    echo 继续检查安装中，请勿关闭窗口……
    echo.
    REM 等待安装完成并刷新注册表（最多等30秒）
    set "CHECK_COUNT=0"
    :wait_node
    for /f "skip=2 tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Node.js" /v InstallPath 2^>nul') do set "NODE_PATH=%%b"
    if defined NODE_PATH goto :node_found
    set /a CHECK_COUNT+=1
    if !CHECK_COUNT! geq 30 goto :node_not_found
    timeout /t 1 /nobreak >nul
    goto :wait_node
    :node_found
    echo 检测到安装路径: %NODE_PATH%
    set "PATH=%PATH%;%NODE_PATH%"
    where node >nul 2>&1
    if %errorlevel% neq 0 (
        echo [警告] 路径已找到但 node 命令未生效，请重启此窗口后重试
        pause
        exit /b
    )
    echo [OK] Node.js 安装完成
    node --version
    goto :installed
    :node_not_found
    echo [错误] Node.js 安装超时，请手动安装后重新运行
    pause
    exit /b
) else (
    echo [错误] 未找到对应架构的安装包: %NODE_MSI%
    echo 请确保安装包文件与脚本在同一目录下
    pause
    exit /b
)

:installed
echo.

REM 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [信息] 检测到项目依赖未安装，正在安装 vite、vue 等依赖...
    echo 请稍等片刻
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络后重新运行本程序
        pause
        exit /b
    )
    echo.
echo [OK] 项目依赖安装完成
echo.
)

REM 检查 JSZip 是否安装
if not exist "node_modules\jszip\" (
    echo [信息] JSZip 未安装，正在安装...
    call npm install jszip
    if %errorlevel% neq 0 (
        echo [警告] JSZip 安装失败，图片导出功能将不可用
    ) else (
        echo [OK] JSZip 安装完成
    )
) else (
    echo [OK] JSZip 已安装
)

echo.
echo ================================================
echo       依赖已全部安装，请依需求选择启动可视化面板或者启动内网服务
echo ================================================
echo.
pause
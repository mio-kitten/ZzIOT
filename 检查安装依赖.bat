@echo off
chcp 65001 >nul
title ZzIOT-可视化面板 启动器

echo.
echo ================================================
echo        ZzIOT-可视化面板 - 一键启动器
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

REM 检测 Windows 版本是否支持 Node.js（Node v24 需要 Windows 10 或更高版本）
for /f "skip=1 tokens=2 delims==" %%v in ('wmic os get Version /value 2^>nul') do (
    set "OS_VERSION=%%v"
    goto :check_ver
)
:check_ver
if defined OS_VERSION (
    for /f "tokens=1 delims=." %%m in ("%OS_VERSION%") do (
        if %%m lss 10 (
            echo 此系统是无法运行node，无法安装
            echo 当前系统版本: %OS_VERSION%（Node.js v24 需要 Windows 10 或更高版本）
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

set "NODE_MSI=%SCRIPT_DIR%node-v24.18.0-%ARCH%.msi"

where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js 已安装
    node --version
    goto :installed
)

echo [WARNING] Node.js 未安装

if exist "%NODE_MSI%" (
    echo 开始本地安装node......
    echo 安装包: node-v24.18.0-%ARCH%.msi
    echo 正在启动安装程序，请稍候...
    msiexec /i "%NODE_MSI%" /passive /norestart
    echo.
    echo 如果node安装进度条满了并窗口消失，则可依需求选择启动可视化面板或者启动内网服务
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
echo ================================================
echo       依赖已全部安装，请依需求选择启动可视化面板或者启动内网服务
echo ================================================
echo.
pause
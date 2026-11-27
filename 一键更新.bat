@echo off
chcp 65001 >nul
title ZzIOT - 一键更新
cd /d "%~dp0"

echo.
echo ================================================
echo        ZzIOT ^> 一键更新
echo ================================================
echo.
echo 检查更新中...

node "MORE\Update.js"
pause
exit /b

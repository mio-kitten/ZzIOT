@echo off
title ZzIOT - 一键更新
cd /d "%~dp0"

echo.
echo ================================================
echo        ZzIOT ^> 一键更新
echo ================================================
echo.
echo 检查更新中...

node "Update.js"
pause
exit /b

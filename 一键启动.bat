@echo off
for /F %%e in ('echo prompt $E ^| cmd') do set "ESC=%%e"
chcp 65001 >nul 2>&1
title IoT可视化面板 - 一键启动

cd /d "%~dp0"

echo.
echo ================================================
echo        IoT可视化面板 - 一键启动
echo ================================================
echo.

echo 检查Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] 未检测到 Node.js
    echo 正在打开安装程序...
    start "" "%~dp0检查安装依赖.bat"
    echo.
    echo 请等待安装完成后，重新运行"一键启动"
    echo.
    echo 本窗口将在 5 秒后自动关闭...
    timeout /t 5 /nobreak >nul
    exit /b
)

echo [OK] Node.js已安装
node --version
echo.

echo 安装项目依赖（含MQTT Broker、Express服务等）...
call npm install
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败，请检查网络连接后重试
    pause
    exit /b
)

echo.
echo ================================================
echo  请选择启动模式：
echo.
echo  [1] 完整启动 - 可视化面板 + 内网服务（推荐）
echo.
echo  [2] 仅可视化面板（不含内网服务）
echo.
echo  [3] 仅内网服务（数据管理 :8080）
echo.
echo  [4] 仅可视化面板（需手动打开）
echo.
echo  [5] 仅内网服务（需手动打开）
echo.
echo.
echo %ESC%[33m注意：内网服务完全打开需要用可视化面板启用 Broker 服务，如果 Broker 不打开主板将无法连接%ESC%[0m
echo.
echo ================================================
echo.

set /p MODE="请输入选项 (1/2/3/4/5): "

if "%MODE%"=="1" goto :FULL
if "%MODE%"=="2" goto :WEB
if "%MODE%"=="3" goto :SERVER
if "%MODE%"=="4" goto :WEB_NO_BROWSER
if "%MODE%"=="5" goto :SERVER_NO_BROWSER
echo 无效选项，默认完整启动...
goto :FULL

:FULL
echo.
echo 启动内网服务后端（MQTT Broker + 数据管理页面）...
start "IoT内网服务" cmd /k "cd /d ""%~dp0"" && npm run server"
echo 等待后端启动...
timeout /t 2 /nobreak >nul
echo.
echo 启动可视化面板前端...
start "IoT可视化面板" cmd /k "cd /d ""%~dp0"" && npm run dev"
echo 等待前端启动...
timeout /t 3 /nobreak >nul
echo 打开浏览器...
start http://localhost:5173
echo.
echo ================================================
echo              启动完成！
echo ================================================
echo.
echo  可视化面板: http://localhost:5173
echo  数据管理:   http://你的IP:8080
echo  MQTT (TCP): 你的IP:1883 (Mind+/ESP32)
echo  MQTT (WS):  你的IP:1853 (浏览器)
echo.
echo  提示: 在可视化面板顶栏点击"内网服务"按钮
echo        可开启/关闭 MQTT Broker
echo.
echo 本窗口将在 5 秒后自动关闭...
timeout /t 5 /nobreak >nul
exit

:WEB
echo.
echo 启动可视化面板前端...
start "IoT可视化面板" cmd /k "cd /d ""%~dp0"" && npm run dev"
echo 等待前端启动...
timeout /t 3 /nobreak >nul
echo 打开浏览器...
start http://localhost:5173
echo.
echo ================================================
echo         可视化面板启动完成！
echo ================================================
echo 浏览器将自动打开: http://localhost:5173
echo.
echo 注意: 未启动内网服务，无法使用MQTT Broker功能
echo.
echo 本窗口将在 5 秒后自动关闭...
timeout /t 5 /nobreak >nul
exit

:SERVER
echo.
echo 启动内网服务后端...
start "IoT内网服务" cmd /k "cd /d ""%~dp0"" && npm run server"
echo 等待后端启动...
timeout /t 2 /nobreak >nul
echo 打开浏览器...
start http://localhost:8080
echo.
echo ================================================
echo         内网服务启动完成！
echo ================================================
echo.
echo  数据管理页面: http://你的IP:8080
echo  MQTT (TCP):   你的IP:1883 (Mind+/ESP32)
echo  MQTT (WS):    你的IP:1853 (浏览器)
echo.
echo  提示: 如需可视化面板，请选择完整启动模式
echo.
echo 本窗口将在 5 秒后自动关闭...
timeout /t 5 /nobreak >nul
exit

:WEB_NO_BROWSER
echo.
echo 启动可视化面板前端...
start "IoT可视化面板" cmd /k "cd /d ""%~dp0"" && npm run dev"
echo.
echo ================================================
echo         可视化面板启动完成！
echo ================================================
echo 手动打开浏览器访问: http://localhost:5173
echo.
echo 注意: 未启动内网服务，无法使用MQTT Broker功能
echo 提示: 已取消自动打开浏览器
echo.
echo 本窗口将在 5 秒后自动关闭...
timeout /t 5 /nobreak >nul
exit

:SERVER_NO_BROWSER
echo.
echo 启动内网服务后端...
start "IoT内网服务" cmd /k "cd /d ""%~dp0"" && npm run server"
echo.
echo ================================================
echo         内网服务启动完成！
echo ================================================
echo.
echo  数据管理页面: http://你的IP:8080
echo  MQTT (TCP):   你的IP:1883 (Mind+/ESP32)
echo  MQTT (WS):    你的IP:1853 (浏览器)
echo.
echo  提示: 已取消自动打开浏览器
echo.
echo 本窗口将在 5 秒后自动关闭...
timeout /t 5 /nobreak >nul
exit
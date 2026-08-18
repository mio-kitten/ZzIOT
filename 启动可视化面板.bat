@echo off
for /F %%e in ('echo prompt $E ^| cmd') do set "ESC=%%e"
chcp 65001 >nul 2>&1
    title ZzIOT-可视化面板 ^> 启动

cd /d "%~dp0"

echo.
echo ================================================
echo        ZzIOT-可视化面板 ^> 启动
echo ================================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo 请运行"检查安装依赖"或者在文件夹中安装对应 node 安装包
    echo.
    echo 按下任意键退出...
    pause >nul
    exit /b
)

echo 请选择启动方式：
echo.
echo  [1] 自动打开浏览器
echo.
echo  [2] 手动打开（不自动打开浏览器）
echo.
echo  [3] 只打开浏览器（不重新启用Vue服务）
echo.
echo ================================================
echo.

set /p MODE="请输入选项 (1/2/3): "

if "%MODE%"=="1" goto :AUTO
if "%MODE%"=="2" goto :MANUAL
if "%MODE%"=="3" goto :BROWSER_ONLY
echo 无效选项，默认自动打开...
goto :AUTO

:AUTO
echo.
echo 启动可视化面板前端...
start "ZzIOT-可视化面板" cmd /k "cd /d ""%~dp0"" && npm run dev"
echo.
echo 等待前端启动...
timeout /t 3 /nobreak >nul
echo 打开浏览器...
start http://localhost:5173
echo.
echo ================================================
echo         可视化面板启动完成！
echo ================================================
echo.
echo 可视化面板: http://localhost:5173
echo.
echo 提示: 如需使用MQTT功能，请同时启动内网服务
echo.
echo 本窗口将在 3 秒后自动关闭...
timeout /t 3 /nobreak >nul
exit

:MANUAL
echo.
echo 启动可视化面板前端...
start "ZzIOT-可视化面板" cmd /k "cd /d ""%~dp0"" && npm run dev"
echo.
echo ================================================
echo         可视化面板启动完成！
echo ================================================
echo.
echo 手动打开浏览器访问: http://localhost:5173
echo.
echo 提示: 已取消自动打开浏览器
echo 提示: 如需使用MQTT功能，请同时启动内网服务
echo.
echo 本窗口将在 3 秒后自动关闭...
timeout /t 3 /nobreak >nul
exit

:BROWSER_ONLY
echo.
echo ================================================
echo         仅打开浏览器！
echo ================================================
echo.
echo 打开浏览器...
start http://localhost:5173
echo.
echo 注意: 此选项不会重新启动Vue服务
echo 如果Vue服务未运行，请使用选项1或2
echo.
echo 本窗口将在 3 秒后自动关闭...
timeout /t 3 /nobreak >nul
exit
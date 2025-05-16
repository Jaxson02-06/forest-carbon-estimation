@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title 林木碳汇测算系统 - 快速启动

:: 设置颜色
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "BLUE=[94m"
set "RESET=[0m"

cls
echo %BLUE%======================================================%RESET%
echo %BLUE%          林木碳汇测算系统 - 快速启动服务            %RESET%
echo %BLUE%======================================================%RESET%
echo.

:: 设置日志目录
if not exist "logs" mkdir logs

:: 设置端口
set FRONTEND_PORT=8080
set BACKEND_PORT=5000

:: 简单检查Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%[错误]%RESET% 未检测到Node.js，无法启动服务。
    echo %YELLOW%       请先安装Node.js，然后重新运行此批处理文件%RESET%
    goto :ERROR_EXIT
)

:: 启动前端和后端服务
echo %GREEN%[启动]%RESET% 正在启动前端服务...
start "林木碳汇测算系统 - 前端" cmd /k "color 0A && echo [前端服务] 正在启动... && npx http-server -p %FRONTEND_PORT% -c-1 --cors -o"

echo %GREEN%[启动]%RESET% 正在启动后端服务...
start "林木碳汇测算系统 - 后端" cmd /k "color 0B && echo [后端服务] 正在启动... && cd server && npm run dev"

:: 显示成功信息
echo.
echo %GREEN%[成功]%RESET% 系统启动中，请稍候...
echo.
echo %BLUE%访问地址:%RESET%
echo   前端界面: %YELLOW%http://localhost:%FRONTEND_PORT%%RESET%
echo   后端API: %YELLOW%http://localhost:%BACKEND_PORT%%RESET%
echo.
echo %BLUE%[提示]%RESET% 使用Ctrl+C可以关闭服务窗口
echo.
echo %BLUE%======================================================%RESET%

echo.
pause
exit /b 0

:ERROR_EXIT
echo.
echo %RED%[错误]%RESET% 启动服务失败，请检查上述错误信息。
echo.
pause
exit /b 1 
@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title 林木碳汇测算系统 - 系统安装与环境配置

:: 设置颜色
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "BLUE=[94m"
set "RESET=[0m"

cls
echo %BLUE%======================================================%RESET%
echo %BLUE%           林木碳汇测算系统 - 系统安装向导           %RESET%
echo %BLUE%======================================================%RESET%
echo.

:: 创建日志目录和文件
if not exist "logs" mkdir logs
set "LOG_FILE=logs\install_%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log"
set "LOG_FILE=!LOG_FILE: =0!"

echo [%date% %time%] 安装程序启动 > "%LOG_FILE%"

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo %YELLOW%[警告] 当前没有管理员权限，某些操作可能需要权限。%RESET%
    echo %YELLOW%[警告] 建议右键以管理员身份运行此脚本。%RESET%
    echo.
    echo [%date% %time%] 警告: 没有管理员权限 >> "%LOG_FILE%"
    timeout /t 3 >nul
)

:: 检查Node.js
echo %BLUE%[检查]%RESET% 正在检查Node.js安装状态...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%[错误]%RESET% 未检测到Node.js，请安装Node.js后再运行此脚本。
    echo %YELLOW%       推荐版本: v16.x LTS 或更高版本%RESET%
    echo %YELLOW%       下载地址: https://nodejs.org/zh-cn/download/%RESET%
    echo.
    echo [%date% %time%] 错误: Node.js未安装 >> "%LOG_FILE%"
    goto :ERROR_EXIT
) else (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo %GREEN%[成功]%RESET% Node.js已安装。版本: !NODE_VERSION!
    echo [%date% %time%] 检测到Node.js版本: !NODE_VERSION! >> "%LOG_FILE%"
    echo.
)

:: 检查NPM
echo %BLUE%[检查]%RESET% 正在检查NPM状态...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo %RED%[错误]%RESET% NPM未安装或异常，请重新安装Node.js。
    echo.
    echo [%date% %time%] 错误: NPM未安装 >> "%LOG_FILE%"
    goto :ERROR_EXIT
) else (
    for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
    echo %GREEN%[成功]%RESET% NPM已安装。版本: !NPM_VERSION!
    echo [%date% %time%] 检测到NPM版本: !NPM_VERSION! >> "%LOG_FILE%"
    echo.
)

:: 安装全局依赖
echo %BLUE%[安装]%RESET% 正在安装全局依赖(http-server)...
call npm install http-server -g >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo %YELLOW%[警告]%RESET% 安装http-server遇到问题，尝试通过另一种方式安装...
    echo [%date% %time%] 警告: http-server安装失败，尝试其他方式 >> "%LOG_FILE%"
    
    :: 尝试使用npx
    echo %BLUE%[安装]%RESET% 正在检查是否可以通过npx使用http-server...
    npx http-server --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo %GREEN%[成功]%RESET% 可以通过npx使用http-server，无需全局安装。
        echo [%date% %time%] 成功: 可以通过npx使用http-server >> "%LOG_FILE%"
    ) else (
        echo %YELLOW%[警告]%RESET% 如需使用http-server，请手动执行以下命令：
        echo         npm install http-server -g
        echo.
        echo [%date% %time%] 警告: npx http-server也失败 >> "%LOG_FILE%"
    )
) else (
    echo %GREEN%[成功]%RESET% http-server安装成功。
    echo [%date% %time%] 成功: http-server安装完成 >> "%LOG_FILE%"
    echo.
)

:: 创建.env文件
echo %BLUE%[配置]%RESET% 正在创建环境配置文件...
if exist server\.env (
    echo %GREEN%[信息]%RESET% 环境配置文件已存在，跳过创建。
    echo [%date% %time%] 信息: .env文件已存在 >> "%LOG_FILE%"
) else (
    (
        echo NODE_ENV=development
        echo PORT=5000
        echo JWT_SECRET=lmcj_%random%%random%
        echo # 数据库配置 - 根据实际情况修改
        echo DB_HOST=localhost
        echo DB_PORT=5432
        echo DB_NAME=lmcj_db
        echo DB_USER=postgres
        echo DB_PASSWORD=postgres
    ) > server\.env
    echo %GREEN%[成功]%RESET% 环境配置文件已创建。
    echo [%date% %time%] 成功: .env文件已创建 >> "%LOG_FILE%"
)
echo.

:: 安装后端依赖
echo %BLUE%[安装]%RESET% 正在安装后端依赖...
if not exist server (
    echo %RED%[错误]%RESET% server目录不存在！
    echo [%date% %time%] 错误: server目录不存在 >> "%LOG_FILE%"
    goto :ERROR_EXIT
)

cd server
echo [%date% %time%] 开始安装后端依赖 >> "..\%LOG_FILE%"
call npm install >> "..\%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo %RED%[错误]%RESET% 安装后端依赖失败。
    echo %YELLOW%       请查看日志文件获取详细错误信息：%LOG_FILE%%RESET%
    echo [%date% %time%] 错误: 后端依赖安装失败 >> "..\%LOG_FILE%"
    cd ..
    goto :ERROR_EXIT
) else (
    echo %GREEN%[成功]%RESET% 后端依赖安装成功。
    echo [%date% %time%] 成功: 后端依赖安装完成 >> "..\%LOG_FILE%"
    cd ..
    echo.
)

:: 系统安装完成
echo %BLUE%======================================================%RESET%
echo %GREEN%              系统安装与配置成功完成              %RESET%
echo %BLUE%======================================================%RESET%
echo.
echo %GREEN%所有检查与安装已完成，系统已准备就绪。%RESET%
echo.
echo 您可以使用以下脚本启动系统:
echo   %YELLOW%- start.bat%RESET%             完整启动系统(包含配置检查)
echo   %YELLOW%- 快速启动.bat%RESET%          直接启动前端和后端服务
echo   %YELLOW%- 仅启动前端.bat%RESET%        只启动前端服务
echo   %YELLOW%- 仅启动后端.bat%RESET%        只启动后端服务
echo.
echo %BLUE%======================================================%RESET%
echo.

echo [%date% %time%] 安装成功完成 >> "%LOG_FILE%"

:: 询问是否立即启动
set /p START=%YELLOW%是否立即启动系统? (Y/N，默认N):%RESET% 
if /i "%START%"=="Y" (
    echo %BLUE%[信息]%RESET% 正在启动系统...
    echo [%date% %time%] 用户选择立即启动系统 >> "%LOG_FILE%"
    start "林木碳汇测算系统" call start.bat
) else (
    echo %BLUE%[信息]%RESET% 您可以稍后通过运行 start.bat 启动系统。
    echo [%date% %time%] 用户选择稍后启动系统 >> "%LOG_FILE%"
)

goto :EOF

:ERROR_EXIT
echo.
echo %RED%安装过程中遇到错误，请检查上述错误信息。%RESET%
echo %BLUE%请解决问题后重新运行安装程序。%RESET%
echo.
echo [%date% %time%] 安装过程因错误终止 >> "%LOG_FILE%"
pause
exit /b 1 
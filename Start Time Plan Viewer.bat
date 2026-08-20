@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Time Plan Viewer Launcher

set "APP_DIR=%~dp0webapp"
if not exist "%APP_DIR%\start-local.ps1" (
  echo [ERROR] Cannot find webapp\start-local.ps1
  pause
  exit /b 1
)

rem Launch the dev server in its own window. The PowerShell launcher handles
rem Node.js detection without batch-parser conflicts.
start "Time Plan Viewer" /d "%APP_DIR%" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoExit -ExecutionPolicy Bypass -File "%APP_DIR%\start-local.ps1"

exit /b 0

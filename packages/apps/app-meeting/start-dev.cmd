@echo off
setlocal
cd /d "%~dp0"
title Meeting dev
echo [meeting] one-click start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [meeting] exited with code %EXIT_CODE%
  pause
)
exit /b %EXIT_CODE%

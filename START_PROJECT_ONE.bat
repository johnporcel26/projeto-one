@echo off
setlocal
cd /d "%~dp0"
title PROJECT ONE - DEVELOPMENT ENVIRONMENT
echo.
echo ========================================
echo  PROJECT ONE - DEVELOPMENT ENVIRONMENT
echo ========================================
echo.
echo Starting:
echo - Server
echo - Client
echo - Admin
echo.
call npm run dev:all
echo.
echo Development environment stopped.
pause

@echo off
setlocal
cd /d "%~dp0"
title PROJECT ONE - LAN TEST
echo.
echo ========================================
echo  PROJECT ONE - LAN TEST
echo ========================================
echo.
echo Local: http://localhost:5173
echo Other computer: use one of these IPv4 addresses:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } ^| ForEach-Object { 'http://{0}:5173  ^(Server: ws://{0}:8787^)' -f $_.IPAddress }"
echo.
echo Admin remains local only: http://127.0.0.1:5174
echo Runtime logs: logs\project-one-lan.log
echo If Windows asks about Node.js, allow Private networks only.
echo.
call npm run dev:lan
echo.
echo LAN environment stopped.
pause

@echo off
chcp 65001 >nul
title Стыдно знать
cd /d "%~dp0frontend"
call npm install
call npm run build
cd /d "%~dp0"
node server.js
pause

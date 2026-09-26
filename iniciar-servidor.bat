@echo off
REM Inicia MOUTH OF CHAOS en esta PC (Windows). Los celulares deben estar en la misma red WiFi.
cd /d "%~dp0"
set "NODEP=%USERPROFILE%\nodejs-portable"
if exist "%NODEP%\node.exe" set "PATH=%NODEP%;%PATH%"
where node >nul 2>nul || (echo No se encontro Node.js. Instala Node desde https://nodejs.org & pause & exit /b)
if not exist node_modules call npm install
node server.js
pause

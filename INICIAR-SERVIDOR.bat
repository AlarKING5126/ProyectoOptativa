@echo off
title Deportes Neon — Servidor
color 0A
cls
echo.
echo  =====================================================
echo    DEPORTES NEON  —  Iniciando servidor...
echo  =====================================================
echo.

:: Ir a la carpeta del backend
cd /d "%~dp0backend"

:: Verificar si existe node_modules
if not exist "node_modules\" (
    echo  [!] Instalando dependencias por primera vez...
    echo.
    npm install
    echo.
)

:: Verificar si el archivo .env existe
if not exist ".env" (
    echo  [ERROR] No se encontro el archivo .env en la carpeta backend.
    echo  Crea el archivo .env con tus credenciales de MySQL.
    pause
    exit /b 1
)

echo  [OK] Iniciando el servidor en http://localhost:3000
echo  [OK] Presiona Ctrl+C para detenerlo
echo.
echo  =====================================================
echo.

:: Iniciar el servidor
node server.js

echo.
echo  El servidor se detuvo. Presiona cualquier tecla para salir.
pause > nul

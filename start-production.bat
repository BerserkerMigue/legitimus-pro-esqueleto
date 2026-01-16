@echo off
echo 🚀 INICIANDO LEXCODE EN PRODUCCIÓN
echo ================================

REM Verificar que el proyecto está construido
if not exist "react-src\dist\index.html" (
    echo ❌ Frontend no construido
    echo Ejecuta primero: build-production.bat
    pause
    exit /b 1
)

if not exist "server.js" (
    echo ❌ No se encuentra server.js
    pause
    exit /b 1
)

REM Verificar variables de entorno
if not exist ".env" (
    echo ⚠️ Creando archivo .env...
    echo OPENAI_API_KEY=tu_api_key_aqui > .env
    echo.
    echo ⚠️ IMPORTANTE: Edita .env con tu API key real
    echo.
)

echo ✅ Verificaciones completadas
echo.
echo 🌐 Iniciando en: http://localhost:3000
echo 📁 Sirviendo React desde: react-src/dist/
echo.
echo 🔄 Presiona Ctrl+C para detener el servidor
echo.

REM Iniciar el servidor
node start-production.js

pause

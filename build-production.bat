@echo off
echo 🚀 CONSTRUYENDO LEXCODE PARA PRODUCCIÓN
echo =====================================

REM Verificar que Node.js está instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Error: Node.js no está instalado
    echo Descarga Node.js desde: https://nodejs.org/
    pause
    exit /b 1
)

REM Verificar que estamos en el directorio correcto
if not exist "server.js" (
    echo ❌ Error: No se encuentra server.js
    echo Ejecuta este script desde la carpeta raíz del proyecto
    pause
    exit /b 1
)

if not exist "react-src" (
    echo ❌ Error: No se encuentra la carpeta react-src
    pause
    exit /b 1
)

echo 📦 Instalando dependencias del backend...
call npm install
if errorlevel 1 (
    echo ❌ Error instalando dependencias del backend
    pause
    exit /b 1
)

echo 📦 Instalando dependencias del frontend...
cd react-src
call pnpm install
if errorlevel 1 (
    echo ❌ Error instalando dependencias del frontend
    echo Intentando con npm...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo ❌ Error instalando dependencias
        pause
        exit /b 1
    )
)

echo 🏗️ Construyendo React para producción...
call pnpm run build
if errorlevel 1 (
    call npm run build
    if errorlevel 1 (
        echo ❌ Error construyendo React
        pause
        exit /b 1
    )
)

cd ..

echo 🔧 Configurando servidor...
node build-production.js
if errorlevel 1 (
    echo ❌ Error configurando servidor
    pause
    exit /b 1
)

echo.
echo 🎉 ¡CONSTRUCCIÓN COMPLETADA!
echo ============================
echo.
echo 🚀 Para iniciar LexCode:
echo    start-production.bat
echo.
echo 🌐 URL: http://localhost:3000
echo.
pause

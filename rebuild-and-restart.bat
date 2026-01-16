@echo off
echo ========================================
echo RECONSTRUIR Y REINICIAR LEXCODE
echo ========================================
echo.

echo [1/3] Reconstruyendo frontend...
cd react-src
call pnpm run build
if errorlevel 1 (
    echo ERROR: Fallo al construir el frontend
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Frontend reconstruido exitosamente
echo.

echo [3/3] Iniciando servidor en produccion...
echo.
echo NOTA: El servidor se iniciara ahora.
echo       Presiona Ctrl+C para detenerlo cuando quieras.
echo.
pause

node start-production.js


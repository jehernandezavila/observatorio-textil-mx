@echo off
REM Observatorio Textil, Moda y Calzado MX - servidor local
cd /d "%~dp0web"
echo Abriendo http://localhost:8765  (cierra esta ventana para detener la app)
start "" http://localhost:8765
python -m http.server 8765

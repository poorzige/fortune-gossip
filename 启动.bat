@echo off
chcp 65001 >nul
setlocal
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

rem Keep this file ASCII-only with CRLF line endings.
rem cmd.exe misreads UTF-8 or LF-only .bat files and drops leading characters.

cd /d "%~dp0backend"
if errorlevel 1 goto :no_folder

rem Pick an interpreter that can actually import flask.
python -c "import flask" >nul 2>nul
if not errorlevel 1 (
    set "PY=python"
    goto :run
)
py -3 -c "import flask" >nul 2>nul
if not errorlevel 1 (
    set "PY=py -3"
    goto :run
)

python --version >nul 2>nul
if not errorlevel 1 goto :no_deps
py -3 --version >nul 2>nul
if not errorlevel 1 goto :no_deps
goto :no_python

:run
echo.
echo   BaGua MingPan  -  http://127.0.0.1:8000
echo   Press Ctrl+C to stop.
echo.
%PY% app.py
echo.
echo   Server stopped.
pause
exit /b 0

:no_folder
echo.
echo   [ERROR] Cannot enter the "backend" folder.
echo   Keep this file next to the backend and frontend folders.
echo.
pause
exit /b 1

:no_deps
echo.
echo   [ERROR] Python is installed but Flask is missing.
echo   Run this once, then start again:
echo.
echo       cd /d "%~dp0backend"
echo       python -m pip install -r requirements.txt
echo.
pause
exit /b 1

:no_python
echo.
echo   [ERROR] Python 3 not found.
echo   Install Python 3.8+ and tick "Add Python to PATH".
echo.
pause
exit /b 1

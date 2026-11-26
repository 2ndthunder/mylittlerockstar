@echo off
title My Little Rockstar server
cd /d "%~dp0"

where php >nul 2>nul
if errorlevel 1 (
  echo.
  echo  PHP is not installed yet.
  echo  Open PowerShell and run:   winget install PHP.PHP.8.4
  echo  Then close PowerShell and double-click start.bat again.
  echo.
  pause
  exit /b 1
)

rem Find PHP's real folder (winget installs a shortcut) so its "ext" folder can be used.
for /f "delims=" %%i in ('php -r "echo dirname(realpath(PHP_BINARY));"') do set "PHPDIR=%%i"

echo.
echo  My Little Rockstar is running at  http://localhost:8001
echo  Keep this window open while you play. Close it to stop the game.
echo.

start "" http://localhost:8001
php -d display_errors=0 -d extension_dir="%PHPDIR%\ext" -d extension=pdo_sqlite -d extension=pdo_mysql -S localhost:8001
pause

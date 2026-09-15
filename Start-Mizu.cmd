@echo off
setlocal
if exist "%~dp0artifacts\phase1-adblock\Mizu.YT.Player.exe" (
  start "" "%~dp0artifacts\phase1-adblock\Mizu.YT.Player.exe"
  exit /b
)
echo Build the app first: powershell -File scripts\build.ps1 -Publish
pause

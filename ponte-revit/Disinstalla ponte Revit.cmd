@echo off
rem Disinstalla il "Ponte Revit" di Ore Commesse.
setlocal
set "DEST=%LOCALAPPDATA%\OreCommesse"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*ponte-revit.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Remove-Item -LiteralPath ([Environment]::GetFolderPath('Startup') + '\Ponte Revit - Ore Commesse.lnk') -ErrorAction SilentlyContinue"
if exist "%DEST%\ponte-revit.ps1" del /q "%DEST%\ponte-revit.ps1"
echo.
echo  Ponte Revit disinstallato. I dati di Ore Commesse non sono stati toccati.
echo.
pause

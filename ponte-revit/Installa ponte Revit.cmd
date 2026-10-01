@echo off
rem Installa il "Ponte Revit" di Ore Commesse per l'utente corrente (non servono permessi di amministratore).
setlocal
set "DEST=%LOCALAPPDATA%\OreCommesse"
echo.
echo  Installazione Ponte Revit per Ore Commesse...
echo.
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0ponte-revit.ps1" "%DEST%\ponte-revit.ps1" >nul
if errorlevel 1 (
  echo  ERRORE: non trovo ponte-revit.ps1. Estrai TUTTO lo zip in una cartella e riprova.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '%DEST%\ponte-revit.ps1'; $l=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\Ponte Revit - Ore Commesse.lnk'); $l.TargetPath='powershell.exe'; $l.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%DEST%\ponte-revit.ps1\"'; $l.WindowStyle=7; $l.Description='Ponte Revit per Ore Commesse'; $l.Save()"
rem Chiude un eventuale ponte gia' in esecuzione e avvia quello nuovo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*ponte-revit.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%DEST%\ponte-revit.ps1"
echo  Fatto! Il ponte e' attivo e partira' da solo a ogni accensione del PC.
echo  Ora apri Ore Commesse: in Dati - Revit automatico deve comparire "Ponte collegato".
echo.
pause

@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%car-imports-backend"
set "FRONTEND_DIR=%ROOT%car-imports-frontend"
set "LOG_DIR=%ROOT%logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Starting Car Imports backend and frontend...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$backend = '%BACKEND_DIR%';" ^
  "$frontend = '%FRONTEND_DIR%';" ^
  "$logs = '%LOG_DIR%';" ^
  "$python = Join-Path $backend 'venv\Scripts\python.exe';" ^
  "if (-not (Test-Path $python)) { $python = 'python'; }" ^
  "$backendProcess = Start-Process -FilePath $python -ArgumentList 'app.py' -WorkingDirectory $backend -RedirectStandardOutput (Join-Path $logs 'backend.out.log') -RedirectStandardError (Join-Path $logs 'backend.err.log') -WindowStyle Hidden -PassThru;" ^
  "$backendProcess.Id | Set-Content (Join-Path $logs 'backend.pid');" ^
  "$frontendProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $frontend -RedirectStandardOutput (Join-Path $logs 'frontend.out.log') -RedirectStandardError (Join-Path $logs 'frontend.err.log') -WindowStyle Hidden -PassThru;" ^
  "$frontendProcess.Id | Set-Content (Join-Path $logs 'frontend.pid');"

echo Services started. Logs are in %LOG_DIR%.
echo Backend:  http://127.0.0.1:5000
echo Frontend: http://localhost:3000

endlocal

@echo off
setlocal

set "ROOT=%~dp0"
set "LOG_DIR=%ROOT%logs"

echo Stopping Car Imports backend and frontend...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$logs = '%LOG_DIR%';" ^
  "foreach ($name in @('frontend','backend')) {" ^
  "  $pidFile = Join-Path $logs ($name + '.pid');" ^
  "  if (Test-Path $pidFile) {" ^
  "    $processId = Get-Content $pidFile -ErrorAction SilentlyContinue;" ^
  "    if ($processId) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue; }" ^
  "    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue;" ^
  "  }" ^
  "}"

echo Done.

endlocal

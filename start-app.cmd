@echo off

echo ==============================
echo Iniciando Backend (Flask)
echo ==============================

start cmd /k "cd /d D:\car-imports\car-imports-backend && venv\Scripts\activate && python app.py"

timeout /t 2 >nul

echo ==============================
echo Iniciando Frontend (React)
echo ==============================

start cmd /k "cd /d D:\car-imports\car-imports-frontend && npm start"

echo ==============================
echo Todo iniciado 🚀
echo ==============================
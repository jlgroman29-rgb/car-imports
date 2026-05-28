# Car Imports

Aplicacion full-stack para gestionar inventario, costos, ventas, cotizaciones, facturas, usuarios, auditoria, reportes e indicadores financieros de importacion de vehiculos.

## Requisitos

- Windows 10/11
- Python 3.11 o compatible
- Node.js y npm
- PostgreSQL disponible localmente o en red

## Configuracion Backend

El backend vive en `car-imports-backend`.

1. Crear entorno virtual:

```powershell
cd D:\car-imports\car-imports-backend
python -m venv venv
venv\Scripts\activate
```

2. Instalar dependencias:

```powershell
pip install -r requirements.txt
```

3. Crear configuracion local:

```powershell
copy .env.example .env
```

Variables soportadas:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`
- `FLASK_ENV`

Si no existe `.env`, el backend mantiene el fallback local actual:

- host `127.0.0.1`
- puerto `5433`
- base `car_imports`
- usuario `postgres`
- password `postgres`

## Crear Usuario Admin Inicial

Con el entorno virtual activo:

```powershell
cd D:\car-imports\car-imports-backend
$env:FLASK_APP="app.py"
flask create-user admin@example.com --name "Administrador" --role admin
```

El comando pedira el password en consola.

## Configuracion Frontend

El frontend vive en `car-imports-frontend`.

```powershell
cd D:\car-imports\car-imports-frontend
npm install
npm start
```

Para compilar:

```powershell
npm run build
```

## Iniciar la App

Opcion manual:

1. Backend:

```powershell
cd D:\car-imports\car-imports-backend
venv\Scripts\activate
python app.py
```

2. Frontend:

```powershell
cd D:\car-imports\car-imports-frontend
npm start
```

Opcion con scripts:

```powershell
StartCar.cmd
StopCar.cmd
```

`StartCar.cmd` inicia backend y frontend en segundo plano y escribe logs en `logs/`.
`StopCar.cmd` detiene los procesos iniciados por `StartCar.cmd`.

Tambien existe `start-app.cmd`, que abre ventanas de consola para backend y frontend. Se mantiene como script legacy/local.

## Pruebas Basicas

Backend:

```powershell
cd D:\car-imports
python -m py_compile car-imports-backend\app.py
```

Frontend:

```powershell
cd D:\car-imports\car-imports-frontend
npm run build
```

Chequeo rapido del backend:

```powershell
curl http://127.0.0.1:5000/
curl http://127.0.0.1:5000/test-db
```

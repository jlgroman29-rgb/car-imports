# Autenticacion inicial

Este modulo agrega login incremental sin proteger todavia los endpoints existentes.

## Configuracion recomendada

Define una llave para firmar tokens antes de iniciar Flask:

```powershell
$env:AUTH_TOKEN_SECRET="cambia-esto-por-un-secreto-largo"
```

Opcionalmente puedes ajustar la duracion del token en segundos:

```powershell
$env:AUTH_TOKEN_EXPIRES_SECONDS="86400"
```

Si no defines `AUTH_TOKEN_SECRET`, el backend usa un secreto local de desarrollo.

## Crear usuario inicial

Desde la raiz del proyecto:

```powershell
python -m flask --app car-imports-backend/app.py create-user admin@example.com --name "Admin" --role admin
```

El comando pedira el password en consola, creara la tabla `users` si no existe y guardara el password con hash seguro de Werkzeug. Por defecto crea/actualiza el usuario como `admin`; tambien puedes usar `--role user`.

## Probar en Postman

1. Crear una peticion `POST http://127.0.0.1:5000/auth/login`.
2. En `Body > raw > JSON`, enviar:

```json
{
  "email": "admin@example.com",
  "password": "tu-password"
}
```

3. Copiar `access_token` de la respuesta.
4. Crear una peticion `GET http://127.0.0.1:5000/auth/me`.
5. En `Authorization`, usar tipo `Bearer Token` y pegar el token.

Los endpoints existentes de vehicles, costs, sales, reports y exports siguen sin proteccion en este paso.


## Administracion de usuarios

Los endpoints backend de mantenimiento de usuarios estan documentados en [`docs/users-admin.md`](users-admin.md).

# Administracion de usuarios

Este cambio agrega mantenimiento backend de usuarios sin tocar el frontend y sin proteger ni modificar los endpoints existentes de vehiculos, costos, ventas, reportes o exports.

## Requisitos

- Tener el backend Flask corriendo.
- Tener un usuario activo con `role` igual a `admin`.
- Enviar el token en `Authorization: Bearer <token>` para todos los endpoints `/users`.

Si necesitas crear o promover el primer usuario administrador desde la raiz del proyecto:

```powershell
python -m flask --app car-imports-backend/app.py create-user admin@example.com --name "Admin" --role admin
```

El comando tambien actualiza un usuario existente con ese email, reactiva la cuenta y cambia su password.

## Login en Postman

1. Crear una peticion `POST http://127.0.0.1:5000/auth/login`.
2. En `Body > raw > JSON`, enviar:

```json
{
  "email": "admin@example.com",
  "password": "tu-password"
}
```

3. Copiar el valor `access_token` de la respuesta.
4. En cada peticion de administracion de usuarios, abrir la pestaña `Authorization`, seleccionar `Bearer Token` y pegar el token.

## GET /users

Lista usuarios. Requiere rol `admin`.

- Metodo: `GET`
- URL: `http://127.0.0.1:5000/users`
- Authorization: `Bearer Token`

Respuesta esperada:

```json
{
  "status": "OK",
  "data": [
    {
      "id": 1,
      "email": "admin@example.com",
      "name": "Admin",
      "role": "admin",
      "is_active": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

## POST /users

Crea usuarios. Requiere rol `admin`. El password se guarda como hash y no se devuelve en la respuesta.

- Metodo: `POST`
- URL: `http://127.0.0.1:5000/users`
- Authorization: `Bearer Token`
- Body: `raw > JSON`

```json
{
  "email": "usuario@example.com",
  "name": "Usuario Operativo",
  "password": "password-seguro",
  "role": "user",
  "is_active": true
}
```

Notas:

- `email` y `password` son requeridos.
- `role` puede ser `admin` o `user`; si no se envia, queda como `user`.
- `is_active` es opcional; si no se envia, queda en `true`.
- Si ya existe un usuario con ese email, responde `409`.

## PATCH /users/&lt;id&gt;

Edita nombre, email, rol y estado activo. Requiere rol `admin`.

- Metodo: `PATCH`
- URL: `http://127.0.0.1:5000/users/2`
- Authorization: `Bearer Token`
- Body: `raw > JSON`

Puedes enviar uno o varios de estos campos:

```json
{
  "name": "Nuevo Nombre",
  "email": "nuevo-email@example.com",
  "role": "admin",
  "is_active": false
}
```

Notas:

- No se borra usuarios desde la API; para deshabilitar acceso usa `"is_active": false`.
- Si cambias el email a uno ya existente, responde `409`.
- Si el usuario no existe, responde `404`.

## PATCH /users/&lt;id&gt;/password

Cambia la contrasena de un usuario. Requiere rol `admin`.

- Metodo: `PATCH`
- URL: `http://127.0.0.1:5000/users/2/password`
- Authorization: `Bearer Token`
- Body: `raw > JSON`

```json
{
  "password": "nuevo-password-seguro"
}
```

Notas:

- `password` es requerido.
- La respuesta no devuelve el hash ni el password.
- Si el usuario no existe, responde `404`.

## Validaciones de permisos

- Sin token: `401`.
- Token invalido o expirado: `401`.
- Usuario inactivo: `401`.
- Usuario autenticado sin rol `admin`: `403`.

from flask import Flask, request
from datetime import datetime
import base64
import hashlib
import hmac
import json
import os
import psycopg2
import time
import click
from functools import wraps
from flasgger import Swagger
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config["AUTH_TOKEN_SECRET"] = (
    os.environ.get("AUTH_TOKEN_SECRET")
    or os.environ.get("SECRET_KEY")
    or "dev-auth-secret-change-me"
)
app.config["AUTH_TOKEN_EXPIRES_SECONDS"] = int(
    os.environ.get("AUTH_TOKEN_EXPIRES_SECONDS", "86400")
)
CORS(app)

VALID_ESTADOS = [
    "comprado",
    "en_transito",
    "en_aduana",
    "en_reparacion",
    "disponible",
    "vendido",
    "inventario"
]

VALID_TIPOS_COSTO = [
    "flete",
    "aduana",
    "impuestos",
    "reparacion",
    "transporte_local",
    "comision",
    "documentacion","compra",
    "otros",
]
def get_connection():
    return psycopg2.connect(
        host="127.0.0.1",
        port=5433,
        database="car_imports",
        user="postgres",
        password="postgres",
    )


def ensure_users_table(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            role TEXT NOT NULL DEFAULT 'user',
            password_hash TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
    """)
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    """)
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    """)
    conn.commit()
    cur.close()


VALID_USER_ROLES = ["admin", "user"]


def normalize_email(email):
    return (email or "").strip().lower()


def serialize_user(row):
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row.get("name"),
        "role": row.get("role", "user"),
        "is_active": row["is_active"],
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def parse_boolean(value, field_name):
    if isinstance(value, bool):
        return value, None

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ("true", "1", "yes", "si", "sí"):
            return True, None
        if normalized in ("false", "0", "no"):
            return False, None

    return None, {
        "status": "error",
        "message": f"{field_name} debe ser booleano"
    }


def validate_user_role(role):
    if role not in VALID_USER_ROLES:
        return {
            "status": "error",
            "message": f"role invalido. Usa uno de estos: {VALID_USER_ROLES}"
        }

    return None


def base64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def base64url_decode(value):
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def create_auth_token(user):
    now = int(time.time())
    expires_in = app.config["AUTH_TOKEN_EXPIRES_SECONDS"]
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user.get("name"),
        "role": user.get("role", "user"),
        "iat": now,
        "exp": now + expires_in,
    }

    header_part = base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_part = base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    signature = hmac.new(
        app.config["AUTH_TOKEN_SECRET"].encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    return f"{header_part}.{payload_part}.{base64url_encode(signature)}", expires_in


def decode_auth_token(token):
    try:
        header_part, payload_part, signature_part = token.split(".")
    except ValueError:
        return None, "Token invalido"

    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    expected_signature = hmac.new(
        app.config["AUTH_TOKEN_SECRET"].encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    try:
        provided_signature = base64url_decode(signature_part)
    except Exception:
        return None, "Token invalido"

    if not hmac.compare_digest(expected_signature, provided_signature):
        return None, "Token invalido"

    try:
        payload = json.loads(base64url_decode(payload_part).decode("utf-8"))
    except Exception:
        return None, "Token invalido"

    if int(payload.get("exp", 0)) < int(time.time()):
        return None, "Token expirado"

    return payload, None


def get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    parts = auth_header.split()

    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]

    return None


def get_authenticated_user():
    token = get_bearer_token()
    if not token:
        return None, ({
            "status": "error",
            "message": "Authorization Bearer token requerido"
        }, 401)

    payload, token_error = decode_auth_token(token)
    if token_error:
        return None, ({
            "status": "error",
            "message": token_error
        }, 401)

    try:
        import psycopg2.extras

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, email, name, role, is_active, created_at, updated_at
            FROM users
            WHERE id = %s
            LIMIT 1;
        """, (payload.get("sub"),))
        user = cur.fetchone()

        cur.close()
        conn.close()
    except Exception as e:
        return None, ({"error": str(e)}, 500)

    if not user:
        return None, ({
            "status": "error",
            "message": "Usuario no encontrado"
        }, 401)

    return user, None


def require_admin_user():
    user, error_response = get_authenticated_user()
    if error_response:
        return None, error_response

    if not user.get("is_active"):
        return None, ({
            "status": "error",
            "message": "Usuario inactivo"
        }, 403)

    if user.get("role") != "admin":
        return None, ({
            "status": "error",
            "message": "Se requiere rol admin"
        }, 403)

    return user, None


def require_admin(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        _, error_response = require_admin_user()
        if error_response:
            return error_response
        return handler(*args, **kwargs)

    return wrapped


def require_authenticated_active_user(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        user, error_response = get_authenticated_user()
        if error_response:
            return error_response

        if not user.get("is_active"):
            return {
                "status": "error",
                "message": "Usuario inactivo"
            }, 403

        return handler(*args, **kwargs)

    return wrapped


def ensure_audit_logs_table(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            details JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    cur.close()


def get_optional_authenticated_user():
    token = get_bearer_token()
    if not token:
        return None

    payload, token_error = decode_auth_token(token)
    if token_error:
        return None

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None

    return user_id


def log_audit(conn, action, entity_type, entity_id, details=None):
    ensure_users_table(conn)
    ensure_audit_logs_table(conn)
    user_id = get_optional_authenticated_user()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
        VALUES (%s, %s, %s, %s, %s::jsonb);
        """,
        (user_id, action, entity_type, str(entity_id), json.dumps(details or {}))
    )
    cur.close()



MIN_ALLOWED_RECORD_YEAR = 2000


def validate_transaction_date(value, field_name="fecha"):
    if value in (None, ""):
        return None, None

    try:
        parsed_date = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None, ({
            "status": "error",
            "message": f"{field_name} debe tener formato YYYY-MM-DD"
        }, 400)

    today = datetime.utcnow().date()
    if parsed_date > today:
        return None, ({
            "status": "error",
            "message": f"{field_name} no puede ser una fecha futura"
        }, 400)

    if parsed_date.year < MIN_ALLOWED_RECORD_YEAR:
        return None, ({
            "status": "error",
            "message": f"{field_name} debe estar entre {MIN_ALLOWED_RECORD_YEAR} y {today.year}"
        }, 400)

    return parsed_date, None

def parse_date_filter(value, field_name):
    if not value:
        return None, None

    try:
        return datetime.strptime(value, "%Y-%m-%d").date(), None
    except ValueError:
        return None, {
            "status": "error",
            "message": f"{field_name} debe tener formato YYYY-MM-DD"
        }


def get_date_filters():
    start_date, start_error = parse_date_filter(request.args.get("start_date"), "start_date")
    if start_error:
        return None, None, (start_error, 400)

    end_date, end_error = parse_date_filter(request.args.get("end_date"), "end_date")
    if end_error:
        return None, None, (end_error, 400)

    if start_date and end_date and start_date > end_date:
        return None, None, ({
            "status": "error",
            "message": "start_date no puede ser posterior a end_date"
        }, 400)

    return start_date, end_date, None


def build_date_filter_clause(column_name, start_date, end_date, table_alias=None):
    if not column_name:
        return "", []

    qualified_column = f"{table_alias}.{column_name}" if table_alias else column_name
    filters = []
    params = []

    if start_date:
        filters.append(f"{qualified_column}::date >= %s")
        params.append(start_date)

    if end_date:
        filters.append(f"{qualified_column}::date <= %s")
        params.append(end_date)

    if not filters:
        return "", []

    return " AND " + " AND ".join(filters), params

def map_vehicle(row):
    return {
        "id": row[0],
        "vin": row[1],
        "marca": row[2],
        "modelo": row[3],
        "anio": row[4],
        "estado": row[5],
        "fecha_compra": row[6],
        "fecha_llegada": row[7],
        "precio_estimado": float(row[8]) if row[8] else 0,
        "fecha_venta": row[9],
        "created_at": row[10]
    }

def validar_estado(data):
    estado = data.get("estado")

    if estado and estado not in VALID_ESTADOS:
        return {
            "status": "error",
            "message": f"Estado inválido. Usa uno de estos: {VALID_ESTADOS}"
        }, 400

    return None




def format_cost_type_label(cost_type):
    return cost_type.replace("_", " ").title()


def serialize_cost_types_dropdown(cost_types):
    return [
        {"value": cost_type, "label": format_cost_type_label(cost_type)}
        for cost_type in cost_types
    ]

def validar_tipo_costo(data):
    tipo = data.get("tipo")

    if tipo and tipo not in VALID_TIPOS_COSTO:
        return {
            "status": "error",
            "message": f"Tipo de costo inválido. Usa uno de estos: {VALID_TIPOS_COSTO}"
        }, 400

    return None


def get_table_columns(conn, table_name):
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
    """, (table_name,))
    cols = {row[0] for row in cur.fetchall()}
    cur.close()
    return cols


def get_sales_price_column(columns):
    if "monto" in columns:
        return "monto"
    if "precio_venta" in columns:
        return "precio_venta"
    return None


def get_sales_date_column(columns):
    if "fecha_venta" in columns:
        return "fecha_venta"
    if "fecha" in columns:
        return "fecha"
    return None


def normalize_sale(row, columns):
    price_column = get_sales_price_column(columns)
    date_column = get_sales_date_column(columns)
    amount = row.get(price_column) if price_column else None
    tasa = row.get("tasa_cambio")
    return {
        "id": row.get("id"),
        "vehicle_id": row.get("vehicle_id"),
        "precio_venta": float(amount) if amount is not None else 0,
        "monto": float(amount) if amount is not None else 0,
        "moneda": row.get("moneda", "DOP"),
        "tasa_cambio": float(tasa) if tasa is not None else None,
        "fecha_venta": row.get(date_column) if date_column else None,
        "nombre_cliente": row.get("nombre_cliente"),
        "telefono_cliente": row.get("telefono_cliente"),
        "metodo_pago": row.get("metodo_pago"),
        "notas": row.get("notas"),
        "fecha": row.get(date_column) if date_column else None,
        "created_at": row.get("created_at"),
    }


def serialize_profit_row(row):
    total_costos = float(row["total_costos"]) if row["total_costos"] is not None else 0.0
    total_venta = float(row["total_venta"]) if row["total_venta"] is not None else 0.0
    ganancia_real = float(row["ganancia_real"]) if row["ganancia_real"] is not None else 0.0
    margen = (ganancia_real / total_venta * 100) if total_venta > 0 else 0.0

    return {
        "vehicle_id": row["vehicle_id"],
        "vin": row["vin"],
        "marca": row["marca"],
        "modelo": row["modelo"],
        "anio": row["anio"],
        "estado": row["estado"],
        "precio_estimado": float(row["precio_estimado"]) if row.get("precio_estimado") is not None else 0.0,
        "total_costos": total_costos,
        "total_venta": total_venta,
        "ganancia_real": ganancia_real,
        "margen_porcentaje": margen,
    }


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""

    if not email or not password:
        return {
            "status": "error",
            "message": "email y password son requeridos"
        }, 400

    try:
        import psycopg2.extras

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, email, name, role, password_hash, is_active, created_at, updated_at
            FROM users
            WHERE LOWER(email) = %s
            LIMIT 1;
        """, (email,))
        user = cur.fetchone()

        cur.close()
        conn.close()

        if not user or not user["is_active"] or not check_password_hash(user["password_hash"], password):
            return {
                "status": "error",
                "message": "Credenciales invalidas"
            }, 401

        token, expires_in = create_auth_token(user)

        return {
            "status": "OK",
            "token_type": "Bearer",
            "access_token": token,
            "expires_in": expires_in,
            "user": serialize_user(user),
        }

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/auth/me", methods=["GET"])
def auth_me():
    token = get_bearer_token()
    if not token:
        return {
            "status": "error",
            "message": "Authorization Bearer token requerido"
        }, 401

    payload, token_error = decode_auth_token(token)
    if token_error:
        return {
            "status": "error",
            "message": token_error
        }, 401

    try:
        import psycopg2.extras

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, email, name, role, is_active, created_at, updated_at
            FROM users
            WHERE id = %s
            LIMIT 1;
        """, (payload.get("sub"),))
        user = cur.fetchone()

        cur.close()
        conn.close()

        if not user or not user["is_active"]:
            return {
                "status": "error",
                "message": "Usuario no encontrado o inactivo"
            }, 401

        return {
            "status": "OK",
            "user": serialize_user(user),
        }

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/users", methods=["GET"])
@require_admin
def list_users():
    try:
        import psycopg2.extras

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, email, name, role, is_active, created_at, updated_at
            FROM users
            ORDER BY id ASC;
        """)
        users = cur.fetchall()

        cur.close()
        conn.close()

        return {
            "status": "OK",
            "data": [serialize_user(user) for user in users],
        }

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/audit-logs", methods=["GET"])
@require_admin
def list_audit_logs():
    try:
        import psycopg2.extras

        conn = get_connection()
        ensure_users_table(conn)
        ensure_audit_logs_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, user_id, action, entity_type, entity_id, details, created_at
            FROM audit_logs
            ORDER BY created_at DESC, id DESC
            LIMIT 500;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "OK", "data": rows}
    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/users", methods=["POST"])
@require_admin
def create_user():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""
    name = data.get("name")
    role = data.get("role", "user")
    is_active = data.get("is_active", True)

    if not email or not password:
        return {
            "status": "error",
            "message": "email y password son requeridos"
        }, 400

    role_error = validate_user_role(role)
    if role_error:
        return role_error, 400

    is_active, is_active_error = parse_boolean(is_active, "is_active")
    if is_active_error:
        return is_active_error, 400

    try:
        import psycopg2.extras
        from psycopg2 import errors

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            INSERT INTO users (email, name, role, password_hash, is_active)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, email, name, role, is_active, created_at, updated_at;
        """, (email, name, role, generate_password_hash(password), is_active))
        user = cur.fetchone()
        log_audit(conn, "create", "user", user["id"], {"payload": {"email": email, "name": name, "role": role, "is_active": is_active}})
        conn.commit()

        cur.close()
        conn.close()

        return {
            "status": "success",
            "message": "Usuario creado correctamente",
            "user": serialize_user(user),
        }, 201

    except errors.UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        return {
            "status": "error",
            "message": "Ya existe un usuario con ese email"
        }, 409
    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/users/<int:user_id>", methods=["PATCH"])
@require_admin
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    allowed_fields = {"name", "email", "role", "is_active"}
    provided_fields = allowed_fields.intersection(data.keys())

    if not provided_fields:
        return {
            "status": "error",
            "message": "Envia al menos uno de estos campos: name, email, role, is_active"
        }, 400

    updates = []
    params = []

    if "name" in data:
        updates.append("name = %s")
        params.append(data.get("name"))

    if "email" in data:
        email = normalize_email(data.get("email"))
        if not email:
            return {
                "status": "error",
                "message": "email no puede estar vacio"
            }, 400
        updates.append("email = %s")
        params.append(email)

    if "role" in data:
        role = data.get("role")
        role_error = validate_user_role(role)
        if role_error:
            return role_error, 400
        updates.append("role = %s")
        params.append(role)

    if "is_active" in data:
        is_active, is_active_error = parse_boolean(data.get("is_active"), "is_active")
        if is_active_error:
            return is_active_error, 400
        updates.append("is_active = %s")
        params.append(is_active)

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(user_id)

    try:
        import psycopg2.extras
        from psycopg2 import errors

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(f"""
            UPDATE users
            SET {", ".join(updates)}
            WHERE id = %s
            RETURNING id, email, name, role, is_active, created_at, updated_at;
        """, params)
        user = cur.fetchone()

        if not user:
            conn.rollback()
            cur.close()
            conn.close()
            return {
                "status": "error",
                "message": "Usuario no encontrado"
            }, 404

        action = "deactivate" if "is_active" in data and user["is_active"] is False else "update"
        log_audit(conn, action, "user", user_id, {"payload": data})
        conn.commit()
        cur.close()
        conn.close()

        return {
            "status": "OK",
            "message": "Usuario actualizado correctamente",
            "user": serialize_user(user),
        }

    except errors.UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        return {
            "status": "error",
            "message": "Ya existe un usuario con ese email"
        }, 409
    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/users/<int:user_id>/password", methods=["PATCH"])
@require_admin
def update_user_password(user_id):
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""

    if not password:
        return {
            "status": "error",
            "message": "password es requerido"
        }, 400

    try:
        import psycopg2.extras

        conn = get_connection()
        ensure_users_table(conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            UPDATE users
            SET password_hash = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, email, name, role, is_active, created_at, updated_at;
        """, (generate_password_hash(password), user_id))
        user = cur.fetchone()

        if not user:
            conn.rollback()
            cur.close()
            conn.close()
            return {
                "status": "error",
                "message": "Usuario no encontrado"
            }, 404

        conn.commit()
        cur.close()
        conn.close()

        return {
            "status": "OK",
            "message": "Password actualizado correctamente",
            "user": serialize_user(user),
        }

    except Exception as e:
        return {"error": str(e)}, 500


@app.cli.command("create-user")
@click.argument("email")
@click.password_option()
@click.option("--name", default=None, help="Nombre visible del usuario.")
@click.option(
    "--role",
    default="admin",
    type=click.Choice(VALID_USER_ROLES),
    help="Rol del usuario. Usa admin para el primer usuario administrador.",
)
def create_user_command(email, password, name, role):
    conn = get_connection()
    ensure_users_table(conn)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO users (email, name, role, password_hash)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (email)
        DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id;
    """, (normalize_email(email), name, role, generate_password_hash(password)))
    user_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    click.echo(f"Usuario listo: {normalize_email(email)} (id={user_id}, role={role})")


@app.route("/")
def home():
    return {"message": "API funcionando 🚗"}


@app.route("/test-db")
def test_db():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT version();")
        version = cur.fetchone()
        cur.close()
        conn.close()

        return {"status": "OK", "postgres": version[0]}
    except Exception as e:
        return {"error": str(e)}


@app.route("/vehicles", methods=["GET"])
def get_vehicles():
    try:
        conn = get_connection()

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute("""
            SELECT 
                id,
                vin,
                marca,
                modelo,
                anio,
                estado,
                precio_estimado,
                fecha_compra,
                fecha_llegada,
                fecha_venta,
                created_at
            FROM vehicles
            WHERE 1=1
        """)

        result = cur.fetchall()

        cur.close()
        conn.close()

        return {
            "status": "OK",
            "data": result
        }

    except Exception as e:
        return {"error": str(e)}
# ✅ ESTE VA FUERA (MISMO NIVEL)


@app.route("/vehicles", methods=["POST"])
@require_authenticated_active_user
def create_vehicle():
    try:
        data = request.json

        # 🔥 VALIDACIÓN ESTADO
        validation_error = validar_estado(data)
        if validation_error:
            return validation_error

        conn = get_connection()
        cur = conn.cursor()

        query = """
        INSERT INTO vehicles (
            vin,
            marca,
            modelo,
            anio,
            estado,
            fecha_compra,
            fecha_llegada,
            precio_estimado,
            fecha_venta,
            created_at
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
        RETURNING id;
        """

        cur.execute(query, (
            data["vin"],
            data["marca"],
            data["modelo"],
            data["anio"],
            data["estado"],
            data.get("fecha_compra"),
            data.get("fecha_llegada"),
            data.get("precio_estimado", 0),
            data.get("fecha_venta")
        ))

        vehicle_id = cur.fetchone()[0]
        log_audit(conn, "create", "vehicle", vehicle_id, {"payload": data})

        conn.commit()
        cur.close()
        conn.close()

        return {
            "status": "success",
            "message": "Vehículo creado correctamente",
            "id": vehicle_id
        }, 201

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }, 500


@app.route("/vehicles/<int:id>", methods=["PUT"])
@require_authenticated_active_user
def update_vehicle(id):
    try:
        data = request.json

        conn = get_connection()
        cur = conn.cursor()

        query = """
        UPDATE vehicles
        SET marca=%s, modelo=%s, anio=%s, estado=%s
        WHERE id=%s;
        """

        cur.execute(
            query, (data["marca"], data["modelo"],
                    data["anio"], data["estado"], id)
        )
        if cur.rowcount == 0:
            conn.commit()
            cur.close()
            conn.close()
            return {"error": "Vehículo no encontrado"}, 404
        log_audit(conn, "update", "vehicle", id, {"payload": data})

        conn.commit()
        cur.close()
        conn.close()

        return {"status": "OK", "message": "Vehículo actualizado"}

    except Exception as e:
        return {"error": str(e)}


@app.route("/vehicles/<int:id>", methods=["GET"])
def get_vehicle_by_id(id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT * FROM vehicles WHERE id = %s;", (id,))
        row = cur.fetchone()

        cur.close()
        conn.close()

        if row is None:
            return {"error": "Vehículo no encontrado"}, 404

        return {
            "status": "OK",
            "data": map_vehicle(row)
        }

    except Exception as e:
        return {"error": str(e)}


@app.route("/vehicles/<int:id>", methods=["DELETE"])
@require_authenticated_active_user
def delete_vehicle(id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("DELETE FROM vehicles WHERE id = %s RETURNING id;", (id,))
        deleted = cur.fetchone()
        if deleted is not None:
            log_audit(conn, "delete", "vehicle", id, {"deleted_id": id})

        conn.commit()
        cur.close()
        conn.close()

        if deleted is None:
            return {"error": "Vehículo no encontrado"}, 404

        return {
            "status": "OK",
            "message": f"Vehículo {id} eliminado"
        }

    except Exception as e:
        return {"error": str(e)}


@app.route("/vehicles/<int:id>", methods=["PATCH"])
@require_authenticated_active_user
def patch_vehicle(id):
    try:
        data = request.json

        conn = get_connection()
        cur = conn.cursor()

        fields = []
        values = []

        # 🔥 Construcción controlada
        if "vin" in data:
            fields.append("vin = %s")
            values.append(data["vin"])

        if "marca" in data:
            fields.append("marca = %s")
            values.append(data["marca"])

        if "modelo" in data:
            fields.append("modelo = %s")
            values.append(data["modelo"])

        if "anio" in data:
            fields.append("anio = %s")
            values.append(data["anio"])

        if "estado" in data:
            fields.append("estado = %s")
            values.append(data["estado"])

        if "precio_estimado" in data:
            fields.append("precio_estimado = %s")
            values.append(float(data["precio_estimado"]))

        if "fecha_compra" in data:
            fields.append("fecha_compra = %s")
            values.append(data["fecha_compra"])

        if "fecha_llegada" in data:
            fields.append("fecha_llegada = %s")
            values.append(data["fecha_llegada"])

        # ⚠️ Validación
        if not fields:
            return {"error": "No se enviaron datos para actualizar"}, 400

        values.append(id)

        query = f"""
        UPDATE vehicles
        SET {", ".join(fields)}
        WHERE id = %s
        RETURNING id;
        """

        cur.execute(query, tuple(values))
        updated = cur.fetchone()
        if updated is not None:
            log_audit(conn, "update", "vehicle", id, {"payload": data})

        conn.commit()
        cur.close()
        conn.close()

        if updated is None:
            return {"error": "Vehículo no encontrado"}, 404

        return {
            "status": "OK",
            "message": f"Vehículo {id} actualizado correctamente"
        }

    except Exception as e:
        return {"error": str(e)}

@app.route("/dashboard/summary", methods=["GET"])
def dashboard_summary():
    try:
        conn = get_connection()
        cur = conn.cursor()

        query = """
        SELECT
            COUNT(*) as total_vehiculos,
            COUNT(*) FILTER (WHERE estado = 'vendido') as vendidos,
            COUNT(*) FILTER (WHERE estado != 'vendido') as inventario,
            COALESCE(SUM(precio_estimado), 0) as valor_total
        FROM vehicles;
        """

        cur.execute(query)
        result = cur.fetchone()

        cur.close()
        conn.close()

        return {
            "status": "OK",
            "data": {
                "total_vehiculos": result[0],
                "vendidos": result[1],
                "inventario": result[2],
                "valor_total": float(result[3])
            }
        }

    except Exception as e:
        return {"error": str(e)}    


@app.route("/catalogs/cost-types", methods=["GET"])
def get_cost_types():
    response_format = request.args.get("format", "list")

    if response_format == "dropdown":
        return {
            "status": "OK",
            "data": serialize_cost_types_dropdown(VALID_TIPOS_COSTO)
        }

    return {"status": "OK", "data": VALID_TIPOS_COSTO}

@app.route("/sales", methods=["POST"])
@require_authenticated_active_user
def create_sale():
    """
    Crea una venta para un vehículo específico.

    Body esperado (JSON):
        - vehicle_id (int, requerido): ID del vehículo a vender.
        - precio_venta (number, requerido si no se envía monto): monto de venta.
        - monto (number, requerido si no se envía precio_venta): alias de precio_venta.
        - moneda (str, opcional): por defecto "DOP".
        - tasa_cambio (number, opcional): tasa aplicada al momento de la venta.
        - fecha_venta (date/datetime string, opcional): fecha de la venta.
        - fecha (date/datetime string, opcional): alias de fecha_venta.
        - nombre_cliente (str, opcional): nombre del cliente.
        - telefono_cliente (str, opcional): teléfono del cliente.
        - metodo_pago (str, opcional): método de pago registrado.
        - notas (str, opcional): observaciones adicionales.

    Validaciones:
        - La tabla `sales` debe contener una columna de monto válida (`monto` o `precio_venta`).
        - `vehicle_id` es obligatorio.
        - Debe enviarse `precio_venta` o `monto`.
        - El vehículo debe existir en `vehicles`.
        - Regla de negocio: un vehículo solo puede tener una venta registrada.

    Respuestas HTTP:
        - 201: venta creada correctamente.
        - 400: faltan campos obligatorios.
        - 404: el vehículo no existe.
        - 409: ya existe una venta para ese vehículo.
        - 500: error interno o inconsistencia de esquema.
    """
    try:
        data = request.get_json(silent=True) or {}

        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        price_column = get_sales_price_column(sales_columns)
        date_column = get_sales_date_column(sales_columns)

        if not price_column:
            conn.close()
            return {"status": "error", "message": "La tabla sales no tiene una columna de monto válida"}, 500

        vehicle_id = data.get("vehicle_id")
        amount = data.get("precio_venta", data.get("monto"))
        moneda = data.get("moneda", "DOP")
        tasa_cambio = data.get("tasa_cambio")
        fecha_venta = data.get("fecha_venta", data.get("fecha"))
        _, date_error = validate_transaction_date(fecha_venta, "fecha_venta")
        if date_error:
            conn.close()
            return date_error

        nombre_cliente = data.get("nombre_cliente")
        telefono_cliente = data.get("telefono_cliente")
        metodo_pago = data.get("metodo_pago")
        notas = data.get("notas")

        if not vehicle_id:
            conn.close()
            return {"status": "error", "message": "vehicle_id es obligatorio"}, 400

        if amount is None:
            conn.close()
            return {"status": "error", "message": "precio_venta es obligatorio"}, 400

        cur = conn.cursor()

        # Validación referencial: la venta solo puede asociarse a un vehículo existente.
        cur.execute("SELECT id FROM vehicles WHERE id = %s;", (vehicle_id,))
        vehicle = cur.fetchone()
        if not vehicle:
            conn.close()
            return {"status": "error", "message": f"Vehículo {vehicle_id} no existe"}, 404

        # Regla de negocio: cada vehículo puede tener una única venta.
        cur.execute("SELECT id FROM sales WHERE vehicle_id = %s LIMIT 1;", (vehicle_id,))
        existing_sale = cur.fetchone()
        if existing_sale:
            conn.close()
            return {
                "status": "error",
                "message": f"El vehículo {vehicle_id} ya tiene una venta registrada"
            }, 409

        insert_columns = ["vehicle_id", price_column]
        values = [vehicle_id, amount]
        optional_fields = {
            "moneda": moneda,
            "tasa_cambio": tasa_cambio,
            date_column: fecha_venta,
            "nombre_cliente": nombre_cliente,
            "telefono_cliente": telefono_cliente,
            "metodo_pago": metodo_pago,
            "notas": notas,
        }

        for col, val in optional_fields.items():
            if col and col in sales_columns and val is not None:
                insert_columns.append(col)
                values.append(val)

        if "created_at" in sales_columns:
            insert_columns.append("created_at")
            placeholders = ["%s"] * len(values) + ["NOW()"]
        else:
            placeholders = ["%s"] * len(values)

        # Query dinámica para soportar variaciones de columnas históricas en la tabla `sales`.
        query = f"""
            INSERT INTO sales ({", ".join(insert_columns)})
            VALUES ({", ".join(placeholders)})
            RETURNING id;
        """

        cur.execute(query, tuple(values))
        new_id = cur.fetchone()[0]
        log_audit(conn, "create", "sale", new_id, {"payload": data})
        
        # Regla de negocio: cuando se registra una venta,
        # el vehículo debe salir del inventario disponible.
        cur.execute("""
            UPDATE vehicles
            SET estado = 'vendido',
                fecha_venta = COALESCE(%s, CURRENT_DATE)
            WHERE id = %s;
        """, (fecha_venta, vehicle_id))

        conn.commit()
        cur.close()
        conn.close()

        return {"status": "success", "message": "Venta creada correctamente", "id": new_id}, 201

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/sales", methods=["GET"])
def get_sales():
    """
    Lista todas las ventas registradas.

    Parámetros:
        - No recibe parámetros de ruta ni query params.

    Comportamiento:
        - Obtiene todas las filas de `sales`.
        - Ordena por fecha de venta descendente cuando la columna de fecha existe.
        - Si no existe columna de fecha, ordena por `id` descendente.
        - Normaliza la salida para exponer un contrato consistente (`precio_venta`, `fecha_venta`, etc.).

    Respuestas HTTP:
        - 200: listado de ventas.
        - 500: error interno.
    """
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        date_column = get_sales_date_column(sales_columns)
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            conn.close()
            return date_error

        date_filter_clause, date_filter_params = build_date_filter_clause(date_column, start_date, end_date)

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if date_column:
            # Prioriza ventas más recientes usando la fecha disponible en el esquema actual.
            cur.execute(
                f"""
                SELECT *
                FROM sales
                WHERE 1=1{date_filter_clause}
                ORDER BY COALESCE({date_column}, NOW()) DESC, id DESC;
                """,
                tuple(date_filter_params)
            )
        else:
            # Fallback cuando no hay columna de fecha en la tabla.
            cur.execute("SELECT * FROM sales ORDER BY id DESC;")
        rows = cur.fetchall()

        cur.close()
        conn.close()

        data = [normalize_sale(row, sales_columns) for row in rows]
        return {"status": "success", "data": data}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/vehicles/<int:vehicle_id>/sales", methods=["GET"])
def get_sales_by_vehicle(vehicle_id):
    """
    Lista ventas asociadas a un vehículo específico.

    Parámetros de ruta:
        - vehicle_id (int, requerido): ID del vehículo.

    Validaciones:
        - El vehículo debe existir antes de consultar sus ventas.

    Comportamiento:
        - Consulta ventas filtradas por `vehicle_id`.
        - Aplica orden descendente por fecha cuando la columna de fecha existe.
        - Si no existe columna de fecha, ordena por `id` descendente.
        - Retorna datos normalizados para mantener consistencia del contrato.

    Respuestas HTTP:
        - 200: ventas del vehículo (lista, puede estar vacía).
        - 404: vehículo no existe.
        - 500: error interno.
    """
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        date_column = get_sales_date_column(sales_columns)
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            conn.close()
            return date_error

        date_filter_clause, date_filter_params = build_date_filter_clause(date_column, start_date, end_date)

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Validación explícita de existencia del recurso padre (vehículo).
        cur.execute("SELECT id FROM vehicles WHERE id = %s;", (vehicle_id,))
        vehicle = cur.fetchone()
        if not vehicle:
            conn.close()
            return {"status": "error", "message": f"Vehículo {vehicle_id} no existe"}, 404

        if date_column:
            cur.execute(f"""
                SELECT *
                FROM sales
                WHERE vehicle_id = %s{date_filter_clause}
                ORDER BY COALESCE({date_column}, NOW()) DESC, id DESC;
            """, (vehicle_id, *date_filter_params))
        else:
            cur.execute("""
                SELECT *
                FROM sales
                WHERE vehicle_id = %s
                ORDER BY id DESC;
            """, (vehicle_id,))
        rows = cur.fetchall()

        cur.close()
        conn.close()

        data = [normalize_sale(row, sales_columns) for row in rows]
        return {"status": "success", "data": data}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/vehicles/<int:vehicle_id>/profit", methods=["GET"])
def get_profit_by_vehicle(vehicle_id):
    """
    Obtiene la ganancia real de un vehículo específico.

    Parámetros de ruta:
        - vehicle_id (int, requerido): ID del vehículo.

    Fórmulas:
        - total_venta = precio_venta / COALESCE(tasa_cambio, 1)
        - total_costos = SUM(monto / COALESCE(tasa_cambio, 1))
        - ganancia_real = total_venta - total_costos
        - margen_porcentaje = (ganancia_real / total_venta) * 100 si total_venta > 0, de lo contrario 0

    Respuestas HTTP:
        - 200: resumen de ganancia del vehículo.
        - 404: vehículo no existe.
        - 500: error interno.
    """
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        sales_date_column = get_sales_date_column(sales_columns)
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            conn.close()
            return date_error

        sales_filter_clause, sales_filter_params = build_date_filter_clause(sales_date_column, start_date, end_date)
        has_date_filter = bool(start_date or end_date)

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(f"""
            SELECT
                v.id AS vehicle_id,
                v.vin,
                v.marca,
                v.modelo,
                v.anio,
                v.estado,
                v.precio_estimado,
                COALESCE(costs_agg.total_costos, 0) AS total_costos,
                COALESCE(sales_agg.total_venta, 0) AS total_venta,
                COALESCE(sales_agg.total_venta, 0) - COALESCE(costs_agg.total_costos, 0) AS ganancia_real
            FROM vehicles v
            LEFT JOIN (
                SELECT
                    vehicle_id,
                    SUM(monto / COALESCE(tasa_cambio, 1)) AS total_costos
                FROM costs
                GROUP BY vehicle_id
            ) costs_agg ON costs_agg.vehicle_id = v.id
            LEFT JOIN (
                SELECT
                    vehicle_id,
                    MAX(precio_venta / COALESCE(tasa_cambio, 1)) AS total_venta
                FROM sales
                WHERE 1=1{sales_filter_clause}
                GROUP BY vehicle_id
            ) sales_agg ON sales_agg.vehicle_id = v.id
            WHERE v.id = %s
              AND (%s = false OR sales_agg.vehicle_id IS NOT NULL);
        """, (*sales_filter_params, vehicle_id, has_date_filter))

        row = cur.fetchone()
        cur.close()
        conn.close()

        if row is None:
            return {"status": "error", "message": f"Vehículo {vehicle_id} no existe"}, 404

        return {"status": "success", "data": serialize_profit_row(row)}
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/vehicles/profit-report", methods=["GET"])
def get_profit_report():
    """
    Lista la ganancia real de todos los vehículos.

    Campos de salida por vehículo:
        - vehicle_id, vin, marca, modelo, anio, estado
        - total_costos, total_venta, ganancia_real, margen_porcentaje

    Reglas:
        - Si no hay venta, total_venta retorna 0.
        - Si no hay costos, total_costos retorna 0.
        - Evita división por cero en margen.

    Respuestas HTTP:
        - 200: reporte completo.
        - 500: error interno.
    """
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        sales_date_column = get_sales_date_column(sales_columns)
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            conn.close()
            return date_error

        sales_filter_clause, sales_filter_params = build_date_filter_clause(sales_date_column, start_date, end_date)
        has_date_filter = bool(start_date or end_date)

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(f"""
            SELECT
                v.id AS vehicle_id,
                v.vin,
                v.marca,
                v.modelo,
                v.anio,
                v.estado,
                v.precio_estimado,
                COALESCE(costs_agg.total_costos, 0) AS total_costos,
                COALESCE(sales_agg.total_venta, 0) AS total_venta,
                COALESCE(sales_agg.total_venta, 0) - COALESCE(costs_agg.total_costos, 0) AS ganancia_real
            FROM vehicles v
            LEFT JOIN (
                SELECT
                    vehicle_id,
                    SUM(monto / COALESCE(tasa_cambio, 1)) AS total_costos
                FROM costs
                GROUP BY vehicle_id
            ) costs_agg ON costs_agg.vehicle_id = v.id
            LEFT JOIN (
                SELECT
                    vehicle_id,
                    MAX(precio_venta / COALESCE(tasa_cambio, 1)) AS total_venta
                FROM sales
                WHERE 1=1{sales_filter_clause}
                GROUP BY vehicle_id
            ) sales_agg ON sales_agg.vehicle_id = v.id
            WHERE %s = false OR sales_agg.vehicle_id IS NOT NULL
            ORDER BY v.id DESC;
        """, (*sales_filter_params, has_date_filter))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        data = [serialize_profit_row(row) for row in rows]
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/sales/<int:id>", methods=["PATCH"])
@require_authenticated_active_user
def patch_sale(id):
    """
    Actualiza parcialmente una venta existente.

    Parámetros de ruta:
        - id (int, requerido): ID de la venta a actualizar.

    Body esperado (JSON, parcial):
        - vehicle_id (int, opcional)
        - precio_venta (number, opcional)
        - monto (number, opcional; alias de precio_venta)
        - moneda (str, opcional)
        - tasa_cambio (number, opcional)
        - fecha_venta (date/datetime string, opcional)
        - fecha (date/datetime string, opcional; alias de fecha_venta)
        - nombre_cliente (str, opcional)
        - telefono_cliente (str, opcional)
        - metodo_pago (str, opcional)
        - notas (str, opcional)

    Validaciones:
        - Debe enviarse al menos un campo actualizable.
        - Si se cambia `vehicle_id`, el vehículo destino debe existir.
        - Regla de negocio: un vehículo solo puede tener una venta; evita duplicados al reasignar.

    Respuestas HTTP:
        - 200: venta actualizada correctamente.
        - 400: no se enviaron campos válidos para actualizar.
        - 404: venta no encontrada o vehículo destino inexistente.
        - 409: conflicto por duplicidad de venta para el vehículo.
        - 500: error interno.
    """
    try:
        data = request.get_json(silent=True) or {}

        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        price_column = get_sales_price_column(sales_columns)
        date_column = get_sales_date_column(sales_columns)

        if "fecha_venta" in data:
            _, date_error = validate_transaction_date(data.get("fecha_venta"), "fecha_venta")
            if date_error:
                conn.close()
                return date_error
        elif "fecha" in data:
            _, date_error = validate_transaction_date(data.get("fecha"), "fecha")
            if date_error:
                conn.close()
                return date_error

        fields = []
        values = []

        allowed = ["vehicle_id", "moneda", "tasa_cambio", "nombre_cliente", "telefono_cliente", "metodo_pago", "notas"]
        for f in allowed:
            if f in data and f in sales_columns:
                fields.append(f"{f} = %s")
                values.append(data[f])

        if "precio_venta" in data and price_column:
            fields.append(f"{price_column} = %s")
            values.append(data["precio_venta"])
        elif "monto" in data and price_column:
            fields.append(f"{price_column} = %s")
            values.append(data["monto"])

        if "fecha_venta" in data and date_column:
            fields.append(f"{date_column} = %s")
            values.append(data["fecha_venta"])
        elif "fecha" in data and date_column:
            fields.append(f"{date_column} = %s")
            values.append(data["fecha"])

        if "precio_venta" in data and "precio_venta" in sales_columns and not price_column:
            fields.append("precio_venta = %s")
            values.append(data["precio_venta"])

        # Se requiere al menos un campo válido para construir un UPDATE parcial.
        if not fields:
            conn.close()
            return {"status": "error", "message": "No hay datos para actualizar"}, 400

        cur = conn.cursor()

        if "vehicle_id" in data:
            # Validación referencial al cambiar el vehículo asociado a la venta.
            cur.execute("SELECT id FROM vehicles WHERE id = %s;", (data["vehicle_id"],))
            vehicle = cur.fetchone()
            if not vehicle:
                conn.close()
                return {"status": "error", "message": f"Vehículo {data['vehicle_id']} no existe"}, 404

            # Regla de negocio: no permitir dos ventas para un mismo vehículo.
            cur.execute("SELECT id FROM sales WHERE vehicle_id = %s AND id <> %s LIMIT 1;", (data["vehicle_id"], id))
            duplicate = cur.fetchone()
            if duplicate:
                conn.close()
                return {
                    "status": "error",
                    "message": f"El vehículo {data['vehicle_id']} ya tiene una venta registrada"
                }, 409

        values.append(id)
        # Query dinámica basada en los campos provistos por el cliente.
        query = f"""
            UPDATE sales
            SET {", ".join(fields)}
            WHERE id = %s
            RETURNING id;
        """
        cur.execute(query, tuple(values))
        updated = cur.fetchone()
        if updated is not None:
            log_audit(conn, "update", "sale", id, {"payload": data})

        conn.commit()
        cur.close()
        conn.close()

        if updated is None:
            return {"status": "error", "message": "Venta no encontrada"}, 404

        return {"status": "success", "message": "Venta actualizada correctamente", "id": id}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/sales/<int:id>", methods=["DELETE"])
@require_authenticated_active_user
def delete_sale(id):
    """
    Elimina una venta por su identificador.

    Parámetros de ruta:
        - id (int, requerido): ID de la venta.

    Comportamiento:
        - Elimina la venta.
        - Si la venta existe, revierte el vehículo asociado a estado disponible.
        - Limpia fecha_venta del vehículo.

    Respuestas HTTP:
        - 200: venta eliminada.
        - 404: venta no encontrada.
        - 500: error interno.
    """
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Eliminamos la venta y recuperamos el vehículo asociado.
        cur.execute("""
            DELETE FROM sales
            WHERE id = %s
            RETURNING id, vehicle_id;
        """, (id,))

        deleted = cur.fetchone()

        if deleted is None:
            conn.commit()
            cur.close()
            conn.close()
            return {"status": "error", "message": "Venta no encontrada"}, 404

        vehicle_id = deleted[1]
        log_audit(conn, "delete", "sale", id, {"vehicle_id": vehicle_id})

        # Al eliminar la venta, el vehículo vuelve a estar disponible.
        cur.execute("""
            UPDATE vehicles
            SET estado = 'disponible',
                fecha_venta = NULL
            WHERE id = %s;
        """, (vehicle_id,))

        conn.commit()
        cur.close()
        conn.close()

        return {"status": "success", "message": f"Venta {id} eliminada"}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

@app.route("/costs", methods=["POST"])
@require_authenticated_active_user
def create_cost():
    try:
        data = request.get_json(silent=True) or {}

        validation_error = validar_tipo_costo(data)
        if validation_error:
            return validation_error

        vehicle_id = data.get("vehicle_id")
        tipo = data.get("tipo")
        monto = data.get("monto")
        moneda = data.get("moneda", "DOP")
        tasa_cambio = data.get("tasa_cambio")
        fecha = data.get("fecha")
        descripcion = data.get("descripcion")

        _, date_error = validate_transaction_date(fecha, "fecha")
        if date_error:
            return date_error

        if vehicle_id is None or not tipo or monto is None:
            return {
                "status": "error",
                "message": "vehicle_id, tipo y monto son obligatorios"
            }, 400

        conn = get_connection()
        cur = conn.cursor()

        query = """
        INSERT INTO costs (vehicle_id, tipo, monto, moneda, tasa_cambio, fecha, descripcion)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """

        cur.execute(query, (
            vehicle_id,
            tipo,
            monto,
            moneda,
            tasa_cambio,
            fecha,
            descripcion
        ))

        new_id = cur.fetchone()[0]
        log_audit(conn, "create", "cost", new_id, {"payload": data})

        conn.commit()
        cur.close()
        conn.close()

        return {
            "status": "OK",
            "id": new_id
        }

    except Exception as e:
        return {"error": str(e)}, 500    


@app.route("/vehicles/<int:vehicle_id>/costs", methods=["GET"])
def get_costs_by_vehicle(vehicle_id):
    try:
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            return date_error

        date_filter_clause, date_filter_params = build_date_filter_clause("fecha", start_date, end_date)

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT
                id,
                vehicle_id,
                tipo,
                monto,
                moneda,
                tasa_cambio,
                fecha,
                descripcion
            FROM costs
            WHERE vehicle_id = %s
        """ + date_filter_clause + """
            ORDER BY COALESCE(fecha, NOW()) DESC, id DESC;
        """, (vehicle_id, *date_filter_params))

        rows = cur.fetchall()

        cur.close()
        conn.close()

        data = []
        for row in rows:
            data.append({
                "id": row[0],
                "vehicle_id": row[1],
                "tipo": row[2],
                "monto": float(row[3]) if row[3] is not None else 0,
                "moneda": row[4],
                "tasa_cambio": float(row[5]) if row[5] is not None else None,
                "fecha": row[6],
                "descripcion": row[7]
            })

        return {"status": "OK", "data": data}

    except Exception as e:
        return {"error": str(e)}, 500

@app.route("/costs/<int:id>", methods=["DELETE"])
@require_authenticated_active_user
def delete_cost(id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("DELETE FROM costs WHERE id = %s RETURNING id;", (id,))
        deleted = cur.fetchone()
        if deleted is not None:
            log_audit(conn, "delete", "cost", id, {"deleted_id": id})

        conn.commit()
        cur.close()
        conn.close()

        if deleted is None:
            return {"error": "Costo no encontrado"}, 404

        return {"status": "OK", "message": f"Costo {id} eliminado"}

    except Exception as e:
        return {"error": str(e)}, 500
@app.route("/costs/<int:id>", methods=["PATCH"])
@require_authenticated_active_user
def patch_cost(id):
    try:
        data = request.get_json(silent=True) or {}

        print("PATCH COST ID:", id)
        print("PATCH COST DATA:", data)

        validation_error = validar_tipo_costo(data)
        if validation_error:
            print("VALIDATION ERROR:", validation_error)
            return validation_error

        fields = []
        values = []

        if "fecha" in data:
            _, date_error = validate_transaction_date(data.get("fecha"), "fecha")
            if date_error:
                return date_error

        allowed = ["tipo", "monto", "moneda", "tasa_cambio", "fecha", "descripcion"]

        for f in allowed:
            if f in data:
                fields.append(f"{f} = %s")
                values.append(data[f])

        print("FIELDS:", fields)
        print("VALUES BEFORE ID:", values)

        if not fields:
            return {
                "status": "error",
                "message": "No hay datos para actualizar"
            }, 400

        values.append(id)

        conn = get_connection()
        cur = conn.cursor()

        query = f"""
        UPDATE costs
        SET {", ".join(fields)}
        WHERE id = %s
        RETURNING id;
        """

        print("QUERY:", query)
        print("VALUES FINAL:", values)

        cur.execute(query, tuple(values))
        updated = cur.fetchone()
        if updated is not None:
            log_audit(conn, "update", "cost", id, {"payload": data})

        conn.commit()
        cur.close()
        conn.close()

        print("UPDATED:", updated)

        if updated is None:
            return {
                "status": "error",
                "message": "Costo no encontrado"
            }, 404

        return {
            "status": "OK",
            "message": f"Costo {id} actualizado"
        }

    except Exception as e:
        print("PATCH COST ERROR:", str(e))
        return {"error": str(e)}, 500

@app.route("/vehicles/<int:vehicle_id>/costs/total", methods=["GET"])
def total_costs(vehicle_id):
    try:
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            return date_error

        date_filter_clause, date_filter_params = build_date_filter_clause("fecha", start_date, end_date)

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT COALESCE(SUM(monto / COALESCE(tasa_cambio, 1)), 0)
            FROM costs
            WHERE vehicle_id = %s
        """ + date_filter_clause, (vehicle_id, *date_filter_params))

        total = cur.fetchone()[0]

        cur.close()
        conn.close()

        return {"total_cost": float(total)}

    except Exception as e:
        return {"error": str(e)}, 500            

@app.route("/vehicles/profit-real", methods=["GET"])
def vehicles_real_profit():
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        sales_date_column = get_sales_date_column(sales_columns)
        start_date, end_date, date_error = get_date_filters()
        if date_error:
            conn.close()
            return date_error

        sales_filter_clause, sales_filter_params = build_date_filter_clause(sales_date_column, start_date, end_date, "s")
        has_date_filter = bool(start_date or end_date)

        cur = conn.cursor()

        query = f"""
        WITH costs_by_vehicle AS (
            SELECT
                vehicle_id,
                COALESCE(SUM(monto / COALESCE(tasa_cambio, 1)), 0) AS total_costos
            FROM costs
            GROUP BY vehicle_id
        ),
        sales_by_vehicle AS (
            SELECT
                s.vehicle_id,
                COALESCE(SUM(
                    COALESCE(
                        NULLIF(to_jsonb(s) ->> 'monto', '')::numeric,
                        NULLIF(to_jsonb(s) ->> 'precio_venta', '')::numeric,
                        0
                    ) * COALESCE(
                        NULLIF(to_jsonb(s) ->> 'tasa_cambio', '')::numeric,
                        1
                    )
                ), 0) AS total_ventas
            FROM sales s
            WHERE 1=1{sales_filter_clause}
            GROUP BY s.vehicle_id
        )
        SELECT
            v.id,
            v.vin,
            v.marca,
            v.modelo,
            v.anio,
            COALESCE(sbv.total_ventas, 0) AS total_ventas,
            COALESCE(cbv.total_costos, 0) AS total_costos,
            COALESCE(sbv.total_ventas, 0) - COALESCE(cbv.total_costos, 0) AS ganancia_real
        FROM vehicles v
        LEFT JOIN costs_by_vehicle cbv ON cbv.vehicle_id = v.id
        LEFT JOIN sales_by_vehicle sbv ON sbv.vehicle_id = v.id
        WHERE %s = false OR sbv.vehicle_id IS NOT NULL
        ORDER BY v.id;
        """

        cur.execute(query, (*sales_filter_params, has_date_filter))
        result = cur.fetchall()

        cur.close()
        conn.close()

        data = []
        for row in result:
            data.append({
                "vehicle_id": row[0],
                "vin": row[1],
                "marca": row[2],
                "modelo": row[3],
                "anio": row[4],
                "total_ventas": float(row[5]),
                "total_costos": float(row[6]),
                "ganancia_real": float(row[7]),
            })

        return {"status": "OK", "data": data}

    except Exception as e:
        return {"error": str(e)}, 500

@app.route("/debug/db", methods=["GET"])
def debug_db():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT current_database(), inet_server_port();")
        db_info = cur.fetchone()

        cur.execute("""
            SELECT id, vehicle_id, precio_venta, fecha_venta, nombre_cliente
            FROM sales
            ORDER BY id;
        """)
        sales = cur.fetchall()

        cur.close()
        conn.close()

        return {
            "database": db_info[0],
            "port": db_info[1],
            "sales": [
                {
                    "id": r[0],
                    "vehicle_id": r[1],
                    "precio_venta": float(r[2]) if r[2] is not None else None,
                    "fecha_venta": str(r[3]) if r[3] is not None else None,
                    "nombre_cliente": r[4]
                }
                for r in sales
            ]
        }

    except Exception as e:
        return {"error": str(e)}, 500        


if __name__ == "__main__":
    Swagger(app)
    app.run(debug=True)

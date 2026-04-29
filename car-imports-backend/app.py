"""
Car Imports Backend API

Descripción:
API para la gestión de vehículos, costos y ventas.

Módulos principales:
- Vehicles: CRUD de vehículos
- Costs: gastos asociados a cada vehículo
- Sales: registro de ventas y cálculo de rentabilidad
- Invoces: Registros de facturas y Historial de ventas

Autor: Jose Gonzalez
Fecha: 2026
"""
from flask import Flask, request
import psycopg2
from flasgger import Swagger
from flask_cors import CORS

app = Flask(__name__)
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
        #"fecha": row.get("fecha"),
        "fecha_venta": row.get("fecha_venta", row.get("fecha_venta")),
        "nombre_cliente": row.get("nombre_cliente"),
        "telefono_cliente": row.get("telefono_cliente"),
        "metodo_pago": row.get("metodo_pago"),
        "notas": row.get("notas"),
        "descripcion": row.get("descripcion"),
        "fecha_venta": row.get(date_column) if date_column else None,
        "nombre_cliente": row.get("nombre_cliente"),
        "telefono_cliente": row.get("telefono_cliente"),
        "metodo_pago": row.get("metodo_pago"),
        "notas": row.get("notas"),
        "fecha": row.get(date_column) if date_column else None,
        "created_at": row.get("created_at"),
    }

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
def delete_vehicle(id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("DELETE FROM vehicles WHERE id = %s RETURNING id;", (id,))
        deleted = cur.fetchone()

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
        fecha_venta = data.get("fecha_venta", data.get("fecha_venta"))
        descripcion = data.get("descripcion")
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
            #"fecha": fecha,
            "fecha_venta": fecha_venta,
            "descripcion": descripcion,
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

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sales ORDER BY COALESCE(fecha_venta, NOW()) DESC, id DESC;")
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
                WHERE vehicle_id = %s
                ORDER BY COALESCE({date_column}, NOW()) DESC, id DESC;
            """, (vehicle_id,))
        else:
            cur.execute("""
                SELECT *
                FROM sales
                WHERE vehicle_id = %s
                ORDER BY id DESC;
            """, (vehicle_id,))
        cur.execute("""
            SELECT *
            FROM sales
            WHERE vehicle_id = %s
            ORDER BY COALESCE(fecha_venta, NOW()) DESC, id DESC;
        """, (vehicle_id,))
        rows = cur.fetchall()

        cur.close()
        conn.close()

        data = [normalize_sale(row, sales_columns) for row in rows]
        return {"status": "success", "data": data}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/sales/<int:id>", methods=["PATCH"])
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

        conn.commit()
        cur.close()
        conn.close()

        if updated is None:
            return {"status": "error", "message": "Venta no encontrada"}, 404

        return {"status": "success", "message": "Venta actualizada correctamente", "id": id}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500


@app.route("/sales/<int:id>", methods=["DELETE"])
def delete_sale(id):
    """
    Elimina una venta por su identificador.

    Parámetros de ruta:
        - id (int, requerido): ID de la venta.

    Comportamiento:
        - Ejecuta un DELETE con `RETURNING id` para confirmar si existía el registro.

    Respuestas HTTP:
        - 200: venta eliminada.
        - 404: venta no encontrada.
        - 500: error interno.
    """
    try:
        conn = get_connection()
        cur = conn.cursor()

        # Uso de RETURNING para distinguir entre "no existe" y eliminación exitosa.
        cur.execute("DELETE FROM sales WHERE id = %s RETURNING id;", (id,))
        deleted = cur.fetchone()

        conn.commit()
        cur.close()
        conn.close()

        if deleted is None:
            return {"status": "error", "message": "Venta no encontrada"}, 404

        return {"status": "success", "message": f"Venta {id} eliminada"}

    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

@app.route("/costs", methods=["POST"])
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
            ORDER BY COALESCE(fecha, NOW()) DESC, id DESC;
        """, (vehicle_id,))

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
def delete_cost(id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("DELETE FROM costs WHERE id = %s RETURNING id;", (id,))
        deleted = cur.fetchone()

        conn.commit()
        cur.close()
        conn.close()

        if deleted is None:
            return {"error": "Costo no encontrado"}, 404

        return {"status": "OK", "message": f"Costo {id} eliminado"}

    except Exception as e:
        return {"error": str(e)}, 500
@app.route("/costs/<int:id>", methods=["PATCH"])
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
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT COALESCE(SUM(monto * COALESCE(tasa_cambio, 1)), 0)
            FROM costs
            WHERE vehicle_id = %s
        """, (vehicle_id,))

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
        cur = conn.cursor()

        query = """
        WITH costs_by_vehicle AS (
            SELECT
                vehicle_id,
                COALESCE(SUM(monto * COALESCE(tasa_cambio, 1)), 0) AS total_costos
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
        ORDER BY v.id;
        """

        cur.execute(query)
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


if __name__ == "__main__":
    Swagger(app)
    app.run(debug=True)

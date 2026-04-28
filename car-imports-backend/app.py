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


def normalize_sale(row, columns):
    price_column = get_sales_price_column(columns)
    amount = row.get(price_column) if price_column else None
    tasa = row.get("tasa_cambio")
    return {
        "id": row.get("id"),
        "vehicle_id": row.get("vehicle_id"),
        "monto": float(amount) if amount is not None else 0,
        "moneda": row.get("moneda", "DOP"),
        "tasa_cambio": float(tasa) if tasa is not None else None,
        "fecha": row.get("fecha"),
        "fecha_venta": row.get("fecha_venta", row.get("fecha")),
        "nombre_cliente": row.get("nombre_cliente"),
        "telefono_cliente": row.get("telefono_cliente"),
        "metodo_pago": row.get("metodo_pago"),
        "notas": row.get("notas"),
        "descripcion": row.get("descripcion"),
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
    try:
        data = request.get_json(silent=True) or {}

        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        price_column = get_sales_price_column(sales_columns)

        if not price_column:
            conn.close()
            return {"error": "La tabla sales no tiene una columna de monto válida"}, 500

        vehicle_id = data.get("vehicle_id")
        amount = data.get("monto", data.get("precio_venta"))
        moneda = data.get("moneda", "DOP")
        tasa_cambio = data.get("tasa_cambio")
        fecha = data.get("fecha", data.get("fecha_venta"))
        descripcion = data.get("descripcion")
        nombre_cliente = data.get("nombre_cliente")
        telefono_cliente = data.get("telefono_cliente")
        metodo_pago = data.get("metodo_pago")
        notas = data.get("notas")

        if not vehicle_id:
            conn.close()
            return {"error": "vehicle_id es obligatorio"}, 400

        if amount is None:
            conn.close()
            return {"error": "monto (o precio_venta) es obligatorio"}, 400

        cur = conn.cursor()

        insert_columns = ["vehicle_id", price_column]
        values = [vehicle_id, amount]
        optional_fields = {
            "moneda": moneda,
            "tasa_cambio": tasa_cambio,
            "fecha": fecha,
            "fecha_venta": fecha,
            "descripcion": descripcion,
            "nombre_cliente": nombre_cliente,
            "telefono_cliente": telefono_cliente,
            "metodo_pago": metodo_pago,
            "notas": notas,
        }

        for col, val in optional_fields.items():
            if col in sales_columns:
                insert_columns.append(col)
                values.append(val)

        if "created_at" in sales_columns:
            insert_columns.append("created_at")
            placeholders = ["%s"] * len(values) + ["NOW()"]
        else:
            placeholders = ["%s"] * len(values)

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

        return {"status": "OK", "id": new_id}, 201

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/sales", methods=["GET"])
def get_sales():
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM sales ORDER BY COALESCE(fecha, NOW()) DESC, id DESC;")
        rows = cur.fetchall()

        cur.close()
        conn.close()

        data = [normalize_sale(row, sales_columns) for row in rows]
        return {"status": "OK", "data": data}

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/vehicles/<int:vehicle_id>/sales", methods=["GET"])
def get_sales_by_vehicle(vehicle_id):
    try:
        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")

        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT *
            FROM sales
            WHERE vehicle_id = %s
            ORDER BY COALESCE(fecha, NOW()) DESC, id DESC;
        """, (vehicle_id,))
        rows = cur.fetchall()

        cur.close()
        conn.close()

        data = [normalize_sale(row, sales_columns) for row in rows]
        return {"status": "OK", "data": data}

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/sales/<int:id>", methods=["PATCH"])
def patch_sale(id):
    try:
        data = request.get_json(silent=True) or {}

        conn = get_connection()
        sales_columns = get_table_columns(conn, "sales")
        price_column = get_sales_price_column(sales_columns)

        fields = []
        values = []

        allowed = [
            "vehicle_id",
            "moneda",
            "tasa_cambio",
            "fecha",
            "fecha_venta",
            "descripcion",
            "nombre_cliente",
            "telefono_cliente",
            "metodo_pago",
            "notas",
        ]
        for f in allowed:
            if f in data and f in sales_columns:
                fields.append(f"{f} = %s")
                values.append(data[f])

        if "monto" in data and price_column:
            fields.append(f"{price_column} = %s")
            values.append(data["monto"])
        elif "precio_venta" in data and "precio_venta" in sales_columns:
            fields.append("precio_venta = %s")
            values.append(data["precio_venta"])

        if not fields:
            conn.close()
            return {"error": "No hay datos para actualizar"}, 400

        values.append(id)
        cur = conn.cursor()
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
            return {"error": "Venta no encontrada"}, 404

        return {"status": "OK"}

    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/sales/<int:id>", methods=["DELETE"])
def delete_sale(id):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("DELETE FROM sales WHERE id = %s RETURNING id;", (id,))
        deleted = cur.fetchone()

        conn.commit()
        cur.close()
        conn.close()

        if deleted is None:
            return {"error": "Venta no encontrada"}, 404

        return {"status": "OK", "message": f"Venta {id} eliminada"}

    except Exception as e:
        return {"error": str(e)}, 500

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

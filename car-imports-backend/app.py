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

@app.route("/costs", methods=["POST"])
def create_cost():
    try:
        data = request.get_json(silent=True) or {}

        vehicle_id = data.get("vehicle_id")
        tipo = data.get("tipo")
        monto = data.get("monto")
        moneda = data.get("moneda", "DOP")
        tasa_cambio = data.get("tasa_cambio")
        fecha = data.get("fecha")
        descripcion = data.get("descripcion")

        if not vehicle_id or not tipo or not monto:
            return {"error": "vehicle_id, tipo y monto son obligatorios"}, 400

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

        fields = []
        values = []

        allowed = ["tipo", "monto", "moneda", "tasa_cambio", "fecha", "descripcion"]

        for f in allowed:
            if f in data:
                fields.append(f"{f} = %s")
                values.append(data[f])

        if not fields:
            return {"error": "No hay datos"}, 400

        values.append(id)

        conn = get_connection()
        cur = conn.cursor()

        query = f"""
        UPDATE costs
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
            return {"error": "Costo no encontrado"}, 404

        return {"status": "OK"}

    except Exception as e:
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


if __name__ == "__main__":
    Swagger(app)
    app.run(debug=True)

import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";
function App() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState({
    vin: "",
    marca: "",
    modelo: "",
    anio: "",
    estado: "inventario",
    precio_estimado: ""
  });

  // 🔥 Cargar vehículos
  const loadVehicles = () => {
    fetch("http://127.0.0.1:5000/vehicles")
      .then((res) => res.json())
      .then((data) => {
        console.log("DATA BACKEND:", data);
        setVehicles(data.data || []);
      });
  };
  const loadCosts = (vehicleId) => {
    // limpiar antes de cargar
    setCosts([]);
    setTotalCost(0);

    // 🔥 traer lista de costos
    fetch(`http://127.0.0.1:5000/vehicles/${vehicleId}/costs`)
      .then(res => res.json())
      .then(data => {
        console.log("COSTS BACKEND:", data);
        setCosts(data.data || []);
      })
      .catch(err => console.error("Error cargando costos:", err));

    // 🔥 traer total
    fetch(`http://127.0.0.1:5000/vehicles/${vehicleId}/costs/total`)
      .then(res => res.json())
      .then(data => {
        setTotalCost(data.total_cost || 0);
      })
      .catch(err => console.error("Error total costos:", err));
  };
  const handleAddCost = (e) => {
    e.preventDefault();

    if (!selectedVehicle) {
      alert("Selecciona un vehículo primero");
      return;
    }

    fetch("http://127.0.0.1:5000/costs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...costForm,
        vehicle_id: selectedVehicle.id,
        monto: Number(costForm.monto),
        tasa_cambio: costForm.tasa_cambio
          ? Number(costForm.tasa_cambio)
          : null
      })
    })
      .then((res) => res.json())
      .then(() => {
        if (selectedVehicle) {
          loadCosts(selectedVehicle.id);
        }

        // reset form
        setCostForm({
          tipo: "",
          monto: "",
          moneda: "USD",
          tasa_cambio: "",
          fecha: "",
          descripcion: ""
        });
      })
      .catch((err) => console.error(err));
  };
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [costs, setCosts] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [totalCost, setTotalCost] = useState(0);
  const [costForm, setCostForm] = useState({
    tipo: "",
    monto: "",
    moneda: "DOP",
    tasa_cambio: "",
    fecha: "",
    descripcion: ""
  });
  const handleEdit = (vehicle) => {
    setForm({
      vin: vehicle.vin || "",
      marca: vehicle.marca || "",
      modelo: vehicle.modelo || "",
      anio: vehicle.anio || "",
      estado: vehicle.estado || "inventario",

      // 🔥 FIX CORRECTO
      precio_estimado:
        vehicle.precio_estimado !== null &&
          vehicle.precio_estimado !== undefined
          ? String(vehicle.precio_estimado)
          : ""
    });

    setEditingId(vehicle.id);
  };
  useEffect(() => {
    loadVehicles();
  }, []);

  const deleteVehicle = (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este vehículo?")) return;

    fetch(`http://localhost:5000/vehicles/${id}`, {
      method: "DELETE"
    })
      .then((res) => res.json())
      .then(() => {
        loadVehicles(); // recargar tabla
      })
      .catch((err) => console.error(err));
  };

  // 🔥 Manejar cambios en inputs
  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };
  const handleCostChange = (e) => {
    setCostForm({
      ...costForm,
      [e.target.name]: e.target.value
    });
  };

  // 🔥 Crear vehículo
  const handleSubmit = (e) => {
    e.preventDefault();

    const url = editingId
      ? `http://localhost:5000/vehicles/${editingId}`
      : "http://localhost:5000/vehicles";

    const method = editingId ? "PATCH" : "POST";

    fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...form,
        anio: parseInt(form.anio),
        precio_estimado:
          form.precio_estimado === ""
            ? undefined
            : Number(form.precio_estimado)
      })
    })
      .then((res) => res.json())
      .then(() => {
        loadVehicles();

        // reset
        setForm({
          vin: "",
          marca: "",
          modelo: "",
          anio: "",
          estado: "inventario",
          precio_estimado: ""
        });

        setEditingId(null);
      })
      .catch((err) => console.error(err));
  };
  const filteredVehicles = (vehicles || []).filter((v) => {
    const matchSearch =
      v.marca.toLowerCase().includes(search.toLowerCase()) ||
      v.modelo.toLowerCase().includes(search.toLowerCase());

    const matchEstado = estadoFilter
      ? v.estado === estadoFilter
      : true;

    return matchSearch && matchEstado;
  });
  const totalInventario = vehicles.reduce((acc, v) => {
    return acc + Number(v.precio_estimado || 0);
  }, 0);
  const disponibles = vehicles.filter(v => v.estado === "disponible").length;

  const vendidos = vehicles.filter(v => v.estado === "vendido").length;

  const valorDisponible = vehicles
    .filter(v => v.estado === "disponible")
    .reduce((acc, v) => acc + Number(v.precio_estimado || 0), 0);
  const estados = [
    "inventario",
    "comprado",
    "en_transito",
    "en_aduana",
    "en_reparacion",
    "disponible",
    "vendido"
  ];

  const dataChart = estados.map((estado) => ({
    estado,
    cantidad: vehicles.filter((v) => v.estado === estado).length
  }));
  const coloresEstado = {
    inventario: "#3498db",
    comprado: "#9b59b6",
    en_transito: "#f1c40f",
    en_aduana: "#e67e22",
    en_reparacion: "#e74c3c",
    disponible: "#2ecc71",
    vendido: "#95a5a6"
  };

  const formatMoney = (value) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0
    }).format(value || 0);
  };

  const cardStyle = {
    background: "#ffffff",
    padding: "15px",
    borderRadius: "10px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
    textAlign: "center",
    minWidth: "140px",
    transition: "all 0.3s ease",
  };
  const cardStyles = {
    total: { background: "#2c3e50", color: "#fff" },
    dinero: { background: "#27ae60", color: "#fff" },
    disponible: { background: "#3498db", color: "#fff" },
    vendido: { background: "#7f8c8d", color: "#fff" }
  };
  return (
    <div style={{ padding: "20px" }}>
      <h1>🚗 Inventario de Vehículos</h1>
      <div
        style={{
          display: "flex",
          gap: "15px",
          overflowX: "auto",
          paddingBottom: "10px"
        }}
      >

        <div
          style={{ ...cardStyle, ...cardStyles.total }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <h4 style={{ margin: 0 }}>🚗 Total Vehículos</h4>
          <h2>{vehicles.length}</h2>
        </div>

        <div
          style={{ ...cardStyle, ...cardStyles.dinero }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <h4 style={{ margin: 0 }}>💰 Valor Inventario</h4>
          <h2 style={{ margin: "5px 0", fontSize: "20px" }}>
            {formatMoney(totalInventario)}
          </h2>
        </div>
        <div style={{ ...cardStyle, ...cardStyles.disponible }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <h4 style={{ margin: 0 }}>🟢 Disponibles</h4>
          <h2>{disponibles}</h2>
        </div>

        <div style={{ ...cardStyle, ...cardStyles.vendido }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <h4 style={{ margin: 0 }}>⚫ Vendidos</h4>
          <h2>{vendidos}</h2>
        </div>

        <div style={{ ...cardStyle, ...cardStyles.dinero }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <h4 style={{ margin: 0 }}>💵 Valor Disponible</h4>
          <h2>{formatMoney(valorDisponible)}</h2>
        </div>
        <div style={{ marginBottom: "30px" }}>
          <h3>Vehículos por Estado</h3>
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "left",
              marginBottom: "20px"
            }}
          >
            <BarChart width={200} height={100} data={dataChart}>
              <XAxis dataKey="estado" angle={-20} textAnchor="end" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cantidad">
                {dataChart.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={coloresEstado[entry.estado] || "#8884d8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {[
            "inventario",
            "comprado",
            "en_transito",
            "en_aduana",
            "en_reparacion",
            "disponible",
            "vendido"
          ].map((estado) => {
            const count = vehicles.filter((v) => v.estado === estado).length;

            return (
              <div
                key={estado}
                style={{
                  background: "#f2f2f2",
                  padding: "10px 15px",
                  borderRadius: "20px"
                }}
              >
                {estado}: {count}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
      </div>

      {/* 🔥 FORMULARIO */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "20px" }}>
        <input name="vin" placeholder="VIN" value={form.vin} onChange={handleChange} required />
        <input name="marca" placeholder="Marca" value={form.marca} onChange={handleChange} required />
        <input name="modelo" placeholder="Modelo" value={form.modelo} onChange={handleChange} required />
        <input name="anio" placeholder="Año" value={form.anio} onChange={handleChange} required />
        <input type="number" name="precio_estimado" placeholder="Precio" value={form.precio_estimado} onChange={handleChange}
        />

        <select name="estado" value={form.estado} onChange={handleChange}>
          <option value="inventario">inventario</option>
          <option value="comprado">comprado</option>
          <option value="en_transito">en_transito</option>
          <option value="en_aduana">en_aduana</option>
          <option value="en_reparacion">en_reparacion</option>
          <option value="disponible">disponible</option>
          <option value="vendido">vendido</option>
        </select>

        <button type="submit">
          {editingId ? "Actualizar" : "Crear"}
        </button>
      </form>
      <div style={{ marginBottom: "15px" }}>
        <input
          placeholder="Buscar por marca o modelo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginRight: "10px", padding: "5px" }}
        />

        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          style={{ padding: "5px" }}
        >
          <option value="">Todos los estados</option>
          <option value="inventario">inventario</option>
          <option value="comprado">comprado</option>
          <option value="en_transito">en_transito</option>
          <option value="en_aduana">en_aduana</option>
          <option value="en_reparacion">en_reparacion</option>
          <option value="disponible">disponible</option>
          <option value="vendido">vendido</option>
        </select>
      </div>
      {/* 🔥 TABLA */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed"
        }}
      >
        {/* 🔥 CONTROL REAL DE COLUMNAS */}
        <colgroup>
          <col style={{ width: "60px" }} />   {/* ID */}
          <col style={{ width: "18%" }} />   {/* Marca */}
          <col style={{ width: "22%" }} />   {/* Modelo */}
          <col style={{ width: "8%" }} />    {/* Año */}
          <col style={{ width: "12%" }} />   {/* Precio */}
          <col style={{ width: "15%" }} />   {/* Estado */}
          <col style={{ width: "120px" }} /> {/* Acciones */}
        </colgroup>

        {/* 🔥 HEADER */}
        <thead style={{ backgroundColor: "#f2f2f2" }}>
          <tr>
            <th>ID</th>
            <th>Marca</th>
            <th>Modelo</th>
            <th>Año</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>

        {/* 🔥 BODY */}
        <tbody>
          {filteredVehicles.map((v) => (
            <tr key={v.id}>
              <td style={{ padding: "8px", textAlign: "center" }}>
                {v.id}
              </td>

              <td
                style={{
                  padding: "8px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap", textAlign: "center"
                }}
              >
                {v.marca}
              </td>

              <td
                style={{
                  padding: "8px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap", textAlign: "center"
                }}
              >
                {v.modelo}
              </td>

              <td style={{ padding: "8px", textAlign: "center" }}>
                {v.anio}
              </td>
              <td style={{ padding: "8px", textAlign: "right" }}>
                {v.precio_estimado}</td>

              <td style={{ padding: "8px", textAlign: "center" }}>
                {v.estado}
              </td>

              <td style={{ padding: "8px", textAlign: "center" }}>
                <button onClick={() => deleteVehicle(v.id)}>
                  Eliminar
                </button>
                <button onClick={() => handleEdit(v)}>
                  Editar
                </button>
                <button
                  onClick={() => {
                    setSelectedVehicle(v);
                    loadCosts(v.id);
                  }}
                >
                  Costos
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedVehicle && (
        <div style={{ marginTop: "30px" }}>
          <h3>💸 Costos del vehículo: {selectedVehicle.marca} {selectedVehicle.modelo}</h3>
          <form onSubmit={handleAddCost} style={{ marginBottom: "15px" }}>
            <input
              name="tipo"
              placeholder="Tipo (subasta, grua, etc)"
              value={costForm.tipo}
              onChange={handleCostChange}
              required
            />

            <input
              name="monto"
              type="number"
              placeholder="Monto"
              value={costForm.monto}
              onChange={handleCostChange}
              required
            />


            <input
              name="moneda"
              placeholder="Moneda (DOP, USD)"
              value={costForm.moneda}
              onChange={handleCostChange}
            />

            <input
              name="tasa_cambio"
              type="number"
              placeholder="Tasa cambio"
              value={costForm.tasa_cambio}
              onChange={handleCostChange}
            />

            <input
              name="fecha"
              type="date"
              value={costForm.fecha}
              onChange={handleCostChange}
            />

            <input
              name="descripcion"
              placeholder="Descripción"
              value={costForm.descripcion}
              onChange={handleCostChange}
            />

            <button type="submit">Agregar Costo</button>
          </form>

          <p><strong>Total costos:</strong> {formatMoney(totalCost)}</p>

          <table border="1" cellPadding="5">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Monto</th>
                <th>Moneda</th>
                <th>Fecha</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id}>
                  <td>{c.tipo}</td>
                  <td>{formatMoney(c.monto)}</td>
                  <td>{c.moneda}</td>
                  <td>{c.fecha}</td>
                  <td>{c.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
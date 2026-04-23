import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";
import "./App.css";

const ESTADOS = [
  "inventario",
  "comprado",
  "en_transito",
  "en_aduana",
  "en_reparacion",
  "disponible",
  "vendido"
];

const TIPOS_COSTO = [
  "compra",
  "flete",
  "aduana",
  "impuestos",
  "reparacion",
  "transporte_local",
  "comision",
  "documentacion",
  "otros"
];

const coloresEstado = {
  inventario: "#3b82f6",
  comprado: "#8b5cf6",
  en_transito: "#f59e0b",
  en_aduana: "#f97316",
  en_reparacion: "#ef4444",
  disponible: "#10b981",
  vendido: "#6b7280"
};

const estadoLabel = (estado) => estado.replaceAll("_", " ");

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

  const loadVehicles = () => {
    fetch("http://127.0.0.1:5000/vehicles")
      .then((res) => res.json())
      .then((data) => {
        console.log("DATA BACKEND:", data);
        setVehicles(data.data || []);
      });
  };

  const loadCosts = (vehicleId) => {
    setCosts([]);
    setTotalCost(0);

    fetch(`http://127.0.0.1:5000/vehicles/${vehicleId}/costs`)
      .then((res) => res.json())
      .then((data) => {
        setCosts(data.data || []);
      })
      .catch((err) => console.error("Error cargando costos:", err));

    fetch(`http://127.0.0.1:5000/vehicles/${vehicleId}/costs/total`)
      .then((res) => res.json())
      .then((data) => {
        setTotalCost(data.total_cost || 0);
      })
      .catch((err) => console.error("Error total costos:", err));
  };

  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [costs, setCosts] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [totalCost, setTotalCost] = useState(0);
  const [editingCostId, setEditingCostId] = useState(null);
  const [costForm, setCostForm] = useState({
    tipo: "",
    monto: "",
    moneda: "DOP",
    tasa_cambio: "",
    fecha: "",
    descripcion: ""
  });

  const resetCostForm = () => {
    setCostForm({
      tipo: "",
      monto: "",
      moneda: "USD",
      tasa_cambio: "",
      fecha: "",
      descripcion: ""
    });
    setEditingCostId(null);
  };

  const handleAddCost = (e) => {
    e.preventDefault();

    if (!selectedVehicle) {
      alert("Selecciona un vehículo primero");
      return;
    }

    const url = editingCostId
      ? `http://127.0.0.1:5000/costs/${editingCostId}`
      : "http://127.0.0.1:5000/costs";

    const method = editingCostId ? "PATCH" : "POST";

    const payload = {
      ...costForm,
      monto: Number(costForm.monto),
      tasa_cambio: costForm.tasa_cambio !== "" ? Number(costForm.tasa_cambio) : null,
      ...(editingCostId ? {} : { vehicle_id: selectedVehicle.id })
    };

    console.log("EDITING COST ID:", editingCostId);
    console.log("METHOD:", method);
    console.log("URL:", url);
    console.log("PAYLOAD:", payload);

    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json();
        console.log("RESPUESTA BACKEND COST:", data);

        if (!res.ok) {
          throw new Error(data.message || data.error || "Error guardando costo");
        }

        return data;
      })
      .then(() => {
        if (selectedVehicle) {
          loadCosts(selectedVehicle.id);
        }
        resetCostForm();
      })
      .catch((err) => {
        console.error("ERROR GUARDANDO COSTO:", err);
        alert(err.message);
      });
  };

  const handleEditCost = (cost) => {
    console.log("COST A EDITAR:", cost);

    setCostForm({
      tipo: cost.tipo || "",
      monto: cost.monto !== null && cost.monto !== undefined ? String(cost.monto) : "",
      moneda: cost.moneda || "USD",
      tasa_cambio:
        cost.tasa_cambio !== null && cost.tasa_cambio !== undefined ? String(cost.tasa_cambio) : "",
      fecha: cost.fecha ? new Date(cost.fecha).toISOString().split("T")[0] : "",
      descripcion: cost.descripcion || ""
    });

    setEditingCostId(cost.id);
  };

  const handleDeleteCost = (costId) => {
    if (!window.confirm("¿Seguro que deseas eliminar este costo?")) return;

    fetch(`http://127.0.0.1:5000/costs/${costId}`, {
      method: "DELETE"
    })
      .then((res) => res.json())
      .then(() => {
        if (selectedVehicle) {
          loadCosts(selectedVehicle.id);
        }

        if (editingCostId === costId) {
          resetCostForm();
        }
      })
      .catch((err) => console.error(err));
  };

  const handleEdit = (vehicle) => {
    setForm({
      vin: vehicle.vin || "",
      marca: vehicle.marca || "",
      modelo: vehicle.modelo || "",
      anio: vehicle.anio || "",
      estado: vehicle.estado || "inventario",
      precio_estimado:
        vehicle.precio_estimado !== null && vehicle.precio_estimado !== undefined
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
        loadVehicles();
      })
      .catch((err) => console.error(err));
  };

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

  const handleSubmit = (e) => {
    e.preventDefault();

    const url = editingId
      ? `http://localhost:5000/vehicles/${editingId}`
      : "http://localhost:5000/vehicles";

    const method = editingId ? "PATCH" : "POST";

    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...form,
        anio: parseInt(form.anio),
        precio_estimado: form.precio_estimado === "" ? undefined : Number(form.precio_estimado)
      })
    })
      .then((res) => res.json())
      .then(() => {
        loadVehicles();
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

    const matchEstado = estadoFilter ? v.estado === estadoFilter : true;

    return matchSearch && matchEstado;
  });

  const totalInventario = vehicles.reduce((acc, v) => acc + Number(v.precio_estimado || 0), 0);
  const disponibles = vehicles.filter((v) => v.estado === "disponible").length;
  const vendidos = vehicles.filter((v) => v.estado === "vendido").length;
  const valorDisponible = vehicles
    .filter((v) => v.estado === "disponible")
    .reduce((acc, v) => acc + Number(v.precio_estimado || 0), 0);

  const dataChart = ESTADOS.map((estado) => ({
    estado,
    cantidad: vehicles.filter((v) => v.estado === estado).length
  }));

  const formatMoney = (value) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0
    }).format(value || 0);
  };

  const metricCards = [
    { title: "Total vehículos", value: vehicles.length, icon: "🚗", variant: "neutral" },
    { title: "Valor inventario", value: formatMoney(totalInventario), icon: "💰", variant: "success" },
    { title: "Disponibles", value: disponibles, icon: "🟢", variant: "info" },
    { title: "Vendidos", value: vendidos, icon: "⚫", variant: "dark" },
    { title: "Valor disponible", value: formatMoney(valorDisponible), icon: "💵", variant: "primary" }
  ];

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Car Imports Dashboard</p>
          <h1>Inventario de Vehículos</h1>
          <p className="page-subtitle">Gestión de inventario, estados y costos por unidad.</p>
        </div>
      </header>

      <section className="card-section">
        <div className="metrics-grid">
          {metricCards.map((card) => (
            <article key={card.title} className={`metric-card metric-${card.variant}`}>
              <span className="metric-icon">{card.icon}</span>
              <p className="metric-title">{card.title}</p>
              <p className="metric-value">{card.value}</p>
            </article>
          ))}
        </div>

        <div className="chart-panel">
          <div className="panel-title-row">
            <h3>Vehículos por estado</h3>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dataChart}>
                <XAxis dataKey="estado" tickFormatter={estadoLabel} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value) => [value, "Cantidad"]} />
                <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                  {dataChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={coloresEstado[entry.estado] || "#8884d8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="status-chip-row">
            {ESTADOS.map((estado) => {
              const count = vehicles.filter((v) => v.estado === estado).length;
              return (
                <span key={estado} className="status-chip">
                  {estadoLabel(estado)}: <strong>{count}</strong>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>{editingId ? "Editar vehículo" : "Registrar vehículo"}</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <input className="input-control" name="vin" placeholder="VIN" value={form.vin} onChange={handleChange} required />
          <input className="input-control" name="marca" placeholder="Marca" value={form.marca} onChange={handleChange} required />
          <input className="input-control" name="modelo" placeholder="Modelo" value={form.modelo} onChange={handleChange} required />
          <input className="input-control" name="anio" placeholder="Año" value={form.anio} onChange={handleChange} required />
          <input
            className="input-control"
            type="number"
            name="precio_estimado"
            placeholder="Precio estimado"
            value={form.precio_estimado}
            onChange={handleChange}
          />
          <select className="input-control" name="estado" value={form.estado} onChange={handleChange}>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estadoLabel(estado)}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit">
            {editingId ? "Actualizar" : "Crear"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title-row">
          <h2>Listado de vehículos</h2>
          <div className="filters-row">
            <input
              className="input-control"
              placeholder="Buscar por marca o modelo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input-control" value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {estadoLabel(estado)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table vehicles-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Año</th>
                <th className="numeric">Precio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.marca}</td>
                  <td>{v.modelo}</td>
                  <td>{v.anio}</td>
                  <td className="numeric">{formatMoney(v.precio_estimado)}</td>
                  <td>
                    <span className="status-pill">{estadoLabel(v.estado)}</span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-danger" onClick={() => deleteVehicle(v.id)}>
                        Eliminar
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleEdit(v)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setSelectedVehicle(v);
                          loadCosts(v.id);
                        }}
                      >
                        Costos
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedVehicle && (
        <section className="panel costs-panel">
          <div className="panel-title-row">
            <h2>
              Costos de {selectedVehicle.marca} {selectedVehicle.modelo}
            </h2>
            <p className="cost-total">
              Total costos: <strong>{formatMoney(totalCost)}</strong>
            </p>
          </div>

          <form onSubmit={handleAddCost} className="form-grid cost-form-grid">
            <select name="tipo" value={costForm.tipo} onChange={handleCostChange} required className="input-control">
              <option value="">Tipo de costo</option>
              {TIPOS_COSTO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {estadoLabel(tipo)}
                </option>
              ))}
            </select>
            <input
              className="input-control"
              name="monto"
              type="number"
              placeholder="Monto"
              value={costForm.monto}
              onChange={handleCostChange}
              required
            />
            <input
              className="input-control"
              name="moneda"
              placeholder="Moneda (DOP, USD)"
              value={costForm.moneda}
              onChange={handleCostChange}
            />
            <input
              className="input-control"
              name="tasa_cambio"
              type="number"
              placeholder="Tasa de cambio"
              value={costForm.tasa_cambio}
              onChange={handleCostChange}
            />
            <input className="input-control" name="fecha" type="date" value={costForm.fecha} onChange={handleCostChange} />
            <input
              className="input-control"
              name="descripcion"
              placeholder="Descripción"
              value={costForm.descripcion}
              onChange={handleCostChange}
            />
            <div className="cost-form-actions">
              <button className="btn btn-primary" type="submit">
                {editingCostId ? "Actualizar costo" : "Agregar costo"}
              </button>
              {editingCostId && (
                <button className="btn btn-secondary" type="button" onClick={resetCostForm}>
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th className="numeric">Monto</th>
                  <th>Moneda</th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id}>
                    <td>{estadoLabel(c.tipo)}</td>
                    <td className="numeric">{formatMoney(c.monto)}</td>
                    <td>{c.moneda}</td>
                    <td>{c.fecha}</td>
                    <td>{c.descripcion}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary" onClick={() => handleEditCost(c)}>
                          Editar
                        </button>
                        <button className="btn btn-danger" onClick={() => handleDeleteCost(c.id)}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;

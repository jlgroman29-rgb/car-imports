import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";
import "./App.css";
import { exportCostReport, EXPORT_FORMATS } from "./reportExport";

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
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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
  const [reportRows, setReportRows] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
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

  const formatMoneyByCurrency = (value, currency = "USD") => {
    try {
      return new Intl.NumberFormat("es-DO", {
        style: "currency",
        currency,
        minimumFractionDigits: 2
      }).format(value || 0);
    } catch (_error) {
      return `${currency} ${Number(value || 0).toFixed(2)}`;
    }
  };

  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("es-DO");
  };

  const loadReport = async () => {
    if (!vehicles.length) {
      setReportRows([]);
      setReportVisible(true);
      return;
    }

    setLoadingReport(true);
    setReportVisible(true);

    try {
      const rows = await Promise.all(
        vehicles.map(async (vehicle) => {
          const [costsResponse, totalResponse] = await Promise.all([
            fetch(`http://127.0.0.1:5000/vehicles/${vehicle.id}/costs`),
            fetch(`http://127.0.0.1:5000/vehicles/${vehicle.id}/costs/total`)
          ]);

          const costsPayload = await costsResponse.json();
          const totalPayload = await totalResponse.json();

          return {
            vehicle,
            costs: costsPayload.data || [],
            totalCost: totalPayload.total_cost || 0
          };
        })
      );

      setReportRows(rows);
    } catch (error) {
      console.error("Error cargando reporte de costos:", error);
      alert("No se pudo cargar el reporte de costos. Intenta nuevamente.");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleExportReport = (format) => {
    if (loadingReport) {
      return;
    }

    if (!reportRows.length) {
      alert("Primero genera el reporte para poder exportarlo.");
      return;
    }

    const printWindow = format === EXPORT_FORMATS.PDF ? window.open("", "_blank") : null;
    if (format === EXPORT_FORMATS.PDF && !printWindow) {
      alert("No se pudo abrir la ventana de impresión. Habilita los pop-ups e inténtalo de nuevo.");
      return;
    }

    setExportingReport(true);
    try {
      exportCostReport({
        format,
        reportRows,
        estadoLabel,
        printWindow
      });
    } catch (error) {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      console.error("Error exportando reporte:", error);
      alert(error.message || "No se pudo exportar el reporte.");
    } finally {
      setExportingReport(false);
    }
  };

  const buildReceiptHtml = (vehicle, sale) => {
    const issuedAt = new Date();
    const saleCurrency = sale.moneda || "USD";
    const totalLabel = formatMoneyByCurrency(sale.precio_venta, saleCurrency);
    const exchangeRateLabel = sale.tasa_cambio ? Number(sale.tasa_cambio).toFixed(2) : "—";

    return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Recibo de venta - Vehículo ${escapeHtml(vehicle.id)}</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, Arial, sans-serif;
        background: #f1f5f9;
        color: #0f172a;
        padding: 24px;
      }
      .receipt {
        max-width: 840px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 28px;
      }
      .receipt-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 2px solid #2563eb;
        padding-bottom: 12px;
        margin-bottom: 18px;
      }
      .receipt-header h1 {
        margin: 0;
        font-size: 24px;
        color: #1e3a8a;
      }
      .receipt-subtitle {
        margin-top: 6px;
        color: #64748b;
      }
      .section {
        margin-bottom: 20px;
      }
      .section h2 {
        font-size: 16px;
        margin-bottom: 10px;
        color: #334155;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 14px;
      }
      .field {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px 12px;
        background: #f8fafc;
      }
      .label {
        display: block;
        color: #64748b;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .value {
        font-size: 14px;
        font-weight: 600;
      }
      .total-box {
        margin-top: 10px;
        border: 2px solid #1d4ed8;
        border-radius: 12px;
        padding: 14px;
        background: #eff6ff;
      }
      .total-box .label {
        font-size: 13px;
      }
      .total-box .value {
        font-size: 24px;
        color: #1d4ed8;
      }
      .notes {
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        white-space: pre-wrap;
      }
      .footer {
        margin-top: 26px;
        color: #64748b;
        font-size: 12px;
        text-align: center;
      }
      @media print {
        body {
          background: #fff;
          padding: 0;
        }
        .receipt {
          border: none;
          border-radius: 0;
          box-shadow: none;
          max-width: none;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="receipt">
      <header class="receipt-header">
        <div>
          <h1>Recibo de venta</h1>
          <p class="receipt-subtitle">Factura de venta del vehículo</p>
        </div>
        <div>
          <span class="label">Fecha de emisión</span>
          <strong>${escapeHtml(issuedAt.toLocaleString("es-DO"))}</strong>
        </div>
      </header>

      <section class="section">
        <h2>Datos del cliente</h2>
        <div class="grid">
          <div class="field"><span class="label">Nombre</span><span class="value">${escapeHtml(sale.nombre_cliente || "—")}</span></div>
          <div class="field"><span class="label">Teléfono</span><span class="value">${escapeHtml(sale.telefono_cliente || "—")}</span></div>
        </div>
      </section>

      <section class="section">
        <h2>Datos del vehículo</h2>
        <div class="grid">
          <div class="field"><span class="label">VIN</span><span class="value">${escapeHtml(vehicle.vin || "—")}</span></div>
          <div class="field"><span class="label">Marca</span><span class="value">${escapeHtml(vehicle.marca || "—")}</span></div>
          <div class="field"><span class="label">Modelo</span><span class="value">${escapeHtml(vehicle.modelo || "—")}</span></div>
          <div class="field"><span class="label">Año</span><span class="value">${escapeHtml(vehicle.anio || "—")}</span></div>
          <div class="field"><span class="label">Estado</span><span class="value">${escapeHtml(estadoLabel(vehicle.estado || ""))}</span></div>
          <div class="field"><span class="label">Fecha de venta</span><span class="value">${escapeHtml(formatDate(sale.fecha_venta))}</span></div>
        </div>
      </section>

      <section class="section">
        <h2>Detalle de venta</h2>
        <div class="grid">
          <div class="field"><span class="label">Precio de venta</span><span class="value">${escapeHtml(totalLabel)}</span></div>
          <div class="field"><span class="label">Moneda</span><span class="value">${escapeHtml(saleCurrency)}</span></div>
          <div class="field"><span class="label">Tasa de cambio</span><span class="value">${escapeHtml(exchangeRateLabel)}</span></div>
          <div class="field"><span class="label">Método de pago</span><span class="value">${escapeHtml(sale.metodo_pago || "—")}</span></div>
        </div>
        <div class="field notes"><span class="label">Notas</span><span class="value">${escapeHtml(sale.notas || "Sin notas")}</span></div>
        <div class="total-box">
          <span class="label">Total</span>
          <span class="value">${escapeHtml(totalLabel)}</span>
        </div>
      </section>

      <footer class="footer">
        Documento generado desde Car Imports Dashboard.
      </footer>
    </main>
  </body>
</html>`;
  };

  const handlePrintReceipt = async (vehicle) => {
    const receiptWindow = window.open("", "_blank");

    if (!receiptWindow) {
      alert("No se pudo abrir la ventana de factura. Habilita los pop-ups e inténtalo de nuevo.");
      return;
    }

    receiptWindow.document.write("<p style='font-family: Arial, sans-serif; padding: 16px;'>Generando factura...</p>");

    try {
      const response = await fetch(`http://127.0.0.1:5000/vehicles/${vehicle.id}/sales`);
      const payload = await response.json();
      const sale = payload?.data?.[0];

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo cargar la venta.");
      }

      if (!sale) {
        receiptWindow.close();
        alert("Este vehículo no tiene una venta registrada para facturar.");
        return;
      }

      receiptWindow.document.open();
      receiptWindow.document.write(buildReceiptHtml(vehicle, sale));
      receiptWindow.document.close();
      receiptWindow.focus();
      receiptWindow.onload = () => {
        receiptWindow.print();
      };
    } catch (error) {
      if (!receiptWindow.closed) {
        receiptWindow.close();
      }
      console.error("Error generando factura:", error);
      alert("No se pudo generar la factura. Intenta nuevamente.");
    }
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
                      {(v.estado === "vendido" || v.fecha_venta) && (
                        <button className="btn btn-secondary" onClick={() => handlePrintReceipt(v)}>
                          Factura
                        </button>
                      )}
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

          <div className="panel-title-row">
            <h2>Listado de vehículos</h2>
            <button className="btn btn-secondary" type="button" onClick={loadReport}>
              Ver reporte de costos
            </button>
          </div>
        </section>
      )}

      {reportVisible && (
        <section className="panel report-panel">
          <div className="panel-title-row">
            <h2>Reporte de costos por vehículo</h2>
            <div className="report-actions">
              {loadingReport ? <p className="cost-total">Cargando reporte...</p> : null}
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => handleExportReport(EXPORT_FORMATS.XLSX)}
                disabled={loadingReport || exportingReport || reportRows.length === 0}
              >
                {exportingReport ? "Exportando..." : "Exportar Excel (.xlsx)"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => handleExportReport(EXPORT_FORMATS.PDF)}
                disabled={loadingReport || exportingReport || reportRows.length === 0}
              >
                {exportingReport ? "Exportando..." : "Exportar PDF"}
              </button>
            </div>
          </div>

          {!loadingReport && reportRows.length === 0 && <p className="report-empty">No hay vehículos para mostrar.</p>}

          {!loadingReport &&
            reportRows.map((row) => (
              <article key={row.vehicle.id} className="vehicle-report-card">
                <header className="vehicle-report-header">
                  <div className="vehicle-report-main">
                    <h3>
                      {row.vehicle.marca} {row.vehicle.modelo} ({row.vehicle.anio})
                    </h3>
                    <p>VIN: {row.vehicle.vin}</p>
                  </div>
                  <div className="vehicle-report-meta">
                    <span className="status-pill">{estadoLabel(row.vehicle.estado)}</span>
                    <p>
                      Total costos: <strong>{formatMoney(row.totalCost)}</strong>
                    </p>
                  </div>
                </header>

                <div className="table-wrapper">
                  <table className="data-table report-table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th className="numeric">Monto</th>
                        <th>Moneda</th>
                        <th className="numeric">Tasa cambio</th>
                        <th>Fecha</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.costs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="report-empty-cell">
                            Este vehículo no tiene costos registrados.
                          </td>
                        </tr>
                      ) : (
                        row.costs.map((cost) => (
                          <tr key={cost.id}>
                            <td>{estadoLabel(cost.tipo)}</td>
                            <td className="numeric">{formatMoney(cost.monto)}</td>
                            <td>{cost.moneda || "—"}</td>
                            <td className="numeric">{cost.tasa_cambio ?? "—"}</td>
                            <td>{formatDate(cost.fecha)}</td>
                            <td>{cost.descripcion || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
        </section>
      )}
    </div>
  );
}

export default App;

import React, { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, PieChart, Pie, CartesianGrid } from "recharts";
import "./App.css";
import { COMPANY_BRAND } from "./branding";
import { exportCostReport, exportFinancialReport, EXPORT_FORMATS } from "./reportExport";
import { buildReceiptHtml } from "./receiptTemplate";

const API_BASE_URL = "http://127.0.0.1:5000";
const AUTH_TOKEN_KEY = "car_imports_access_token";
const USER_ROLES = ["user", "admin"];
const TODAY_DATE = new Date().toISOString().split("T")[0];


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
  const initialDataLoadedRef = useRef(false);
  const costReportAutoRequestedRef = useRef(false);
  const [authStatus, setAuthStatus] = useState("checking");
  const [authUser, setAuthUser] = useState(null);
  const [authExpiresAt, setAuthExpiresAt] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showUsersAdmin, setShowUsersAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMessage, setUsersMessage] = useState({ type: "", text: "" });
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsMessage, setAuditLogsMessage] = useState({ type: "", text: "" });
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    role: "user",
    is_active: true,
    password: ""
  });
  const [passwordForm, setPasswordForm] = useState({ userId: null, label: "", password: "" });
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
    fetch(`${API_BASE_URL}/vehicles`, { headers: getAuthHeaders() })
      .then((res) => res.json())
      .then(async (data) => {
        console.log("DATA BACKEND:", data);
        const list = data.data || [];
        setVehicles(list);

        const salesMapEntries = await Promise.all(
          list.map(async (vehicle) => {
            try {
              const response = await fetch(`${API_BASE_URL}/vehicles/${vehicle.id}/sales`, {
                headers: getAuthHeaders()
              });
              const payload = await response.json();
              const hasSale = response.ok && Array.isArray(payload?.data) && payload.data.length > 0;
              return [vehicle.id, hasSale];
            } catch (_error) {
              return [vehicle.id, false];
            }
          })
        );

        setSalesByVehicleId(Object.fromEntries(salesMapEntries));
      });
  };

  const loadCosts = (vehicleId) => {
    setCosts([]);
    setTotalCost(0);

    fetch(`${API_BASE_URL}/vehicles/${vehicleId}/costs`, { headers: getAuthHeaders() })
      .then((res) => res.json())
      .then((data) => {
        setCosts(data.data || []);
      })
      .catch((err) => console.error("Error cargando costos:", err));

    fetch(`${API_BASE_URL}/vehicles/${vehicleId}/costs/total`, { headers: getAuthHeaders() })
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
  const [costVehicleSearch, setCostVehicleSearch] = useState("");
  const [totalCost, setTotalCost] = useState(0);
  const [editingCostId, setEditingCostId] = useState(null);
  const [reportRows, setReportRows] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [loadingCostAnalytics, setLoadingCostAnalytics] = useState(false);
  const [exportingFinancialReport, setExportingFinancialReport] = useState(false);
  const [salesByVehicleId, setSalesByVehicleId] = useState({});
  const [profitRows, setProfitRows] = useState([]);
  const [loadingProfitReport, setLoadingProfitReport] = useState(false);
  const [financialFilters, setFinancialFilters] = useState({
    start_date: "",
    end_date: ""
  });
  const [appliedFinancialFilters, setAppliedFinancialFilters] = useState({
    start_date: "",
    end_date: ""
  });
  const [inventoryFilters, setInventoryFilters] = useState({
    estado: "",
    marca: "",
    anio: "",
    minPrecio: "",
    maxPrecio: "",
    conCostos: "",
    conVenta: ""
  });
  const [selectedSalesVehicle, setSelectedSalesVehicle] = useState(null);
  const [salesVehicleSearch, setSalesVehicleSearch] = useState("");
  const [sales, setSales] = useState([]);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [saleForm, setSaleForm] = useState({
    nombre_cliente: "",
    telefono_cliente: "",
    precio_venta: "",
    moneda: "USD",
    tasa_cambio: "",
    fecha_venta: "",
    metodo_pago: "",
    notas: ""
  });
  const [costForm, setCostForm] = useState({
    tipo: "",
    monto: "",
    moneda: "DOP",
    tasa_cambio: "",
    fecha: "",
    descripcion: ""
  });

  const clearSession = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthUser(null);
    setAuthExpiresAt(null);
    setAuthStatus("unauthenticated");
    initialDataLoadedRef.current = false;
    setVehicles([]);
    setCosts([]);
    setSales([]);
    setProfitRows([]);
    setReportRows([]);
    setReportVisible(false);
    costReportAutoRequestedRef.current = false;
    setUsers([]);
    setShowUsersAdmin(false);
    setUsersMessage({ type: "", text: "" });
    setEditingUserId(null);
    setPasswordForm({ userId: null, label: "", password: "" });
    setSelectedVehicle(null);
    setSelectedSalesVehicle(null);
  };

  const getTokenExpiration = (token) => {
    try {
      const payloadPart = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padding = "=".repeat((4 - (payloadPart.length % 4)) % 4);
      const payload = JSON.parse(window.atob(payloadPart + padding));
      return payload.exp ? payload.exp * 1000 : null;
    } catch (_error) {
      return null;
    }
  };

  const loadCurrentUser = async (token) => {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Sesion invalida");
    }

    setAuthUser(data.user);
    setAuthExpiresAt(getTokenExpiration(token));
    setAuthStatus("authenticated");
    return data.user;
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(loginForm)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "No se pudo iniciar sesion");
      }

      localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      await loadCurrentUser(data.access_token);
      setLoginForm((currentForm) => ({ ...currentForm, password: "" }));
    } catch (error) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setAuthUser(null);
      setAuthStatus("unauthenticated");
      setLoginError(error.message || "No se pudo iniciar sesion");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setLoginForm((currentForm) => ({ ...currentForm, password: "" }));
    setLoginError("");
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const parseApiError = (payload, fallbackMessage) => {
    return payload?.message || payload?.error || fallbackMessage;
  };

  const resetUserForm = () => {
    setUserForm({
      name: "",
      email: "",
      role: "user",
      is_active: true,
      password: ""
    });
    setEditingUserId(null);
  };

  const loadUsers = async () => {
    setUsersLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(parseApiError(data, "No se pudo cargar la lista de usuarios"));
      }

      setUsers(data.data || []);
    } catch (error) {
      console.error("Error cargando usuarios:", error);
      setUsersMessage({ type: "error", text: error.message || "No se pudo cargar la lista de usuarios" });
    } finally {
      setUsersLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLogsLoading(true);
    setAuditLogsMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/audit-logs`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (response.status === 401) {
        clearSession();
        setLoginError("Tu sesion expiro o ya no es valida. Inicia sesion nuevamente.");
        return;
      }

      if (response.status === 403) {
        setAuditLogs([]);
        setAuditLogsMessage({ type: "error", text: "No tienes permisos para ver auditoría" });
        return;
      }

      if (!response.ok) {
        throw new Error(parseApiError(data, "No se pudieron cargar los logs de auditoría"));
      }

      setAuditLogs(data.data || []);
    } catch (error) {
      console.error("Error cargando auditoría:", error);
      setAuditLogsMessage({ type: "error", text: error.message || "No se pudieron cargar los logs de auditoría" });
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const handleUserFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setUserForm((currentForm) => ({
      ...currentForm,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const handleUserSubmit = async (event) => {
    event.preventDefault();
    setUsersMessage({ type: "", text: "" });

    const payload = {
      name: userForm.name,
      email: userForm.email,
      role: userForm.role,
      is_active: userForm.is_active
    };

    if (!editingUserId) {
      payload.password = userForm.password;
    }

    try {
      const response = await fetch(
        editingUserId ? `${API_BASE_URL}/users/${editingUserId}` : `${API_BASE_URL}/users`,
        {
          method: editingUserId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders()
          },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(parseApiError(data, "No se pudo guardar el usuario"));
      }

      setUsersMessage({
        type: "success",
        text: editingUserId ? "Usuario actualizado correctamente." : "Usuario creado correctamente."
      });
      resetUserForm();
      loadUsers();
    } catch (error) {
      console.error("Error guardando usuario:", error);
      setUsersMessage({ type: "error", text: error.message || "No se pudo guardar el usuario" });
    }
  };

  const handleEditUser = (user) => {
    setUsersMessage({ type: "", text: "" });
    setEditingUserId(user.id);
    setUserForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "user",
      is_active: Boolean(user.is_active),
      password: ""
    });
  };

  const handleToggleUserActive = async (user) => {
    setUsersMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ is_active: !user.is_active })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(parseApiError(data, "No se pudo cambiar el estado del usuario"));
      }

      setUsersMessage({
        type: "success",
        text: `Usuario ${user.is_active ? "desactivado" : "activado"} correctamente.`
      });
      loadUsers();
    } catch (error) {
      console.error("Error cambiando estado de usuario:", error);
      setUsersMessage({ type: "error", text: error.message || "No se pudo cambiar el estado del usuario" });
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setUsersMessage({ type: "", text: "" });

    if (!passwordForm.userId) {
      setUsersMessage({ type: "error", text: "Selecciona un usuario para cambiar su password." });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/users/${passwordForm.userId}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ password: passwordForm.password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(parseApiError(data, "No se pudo cambiar el password"));
      }

      setUsersMessage({ type: "success", text: "Password actualizado correctamente." });
      setPasswordForm({ userId: null, label: "", password: "" });
      loadUsers();
    } catch (error) {
      console.error("Error cambiando password:", error);
      setUsersMessage({ type: "error", text: error.message || "No se pudo cambiar el password" });
    }
  };

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
      ? `${API_BASE_URL}/costs/${editingCostId}`
      : `${API_BASE_URL}/costs`;

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
        "Content-Type": "application/json",
        ...getAuthHeaders()
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
        loadProfitReport();
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

    fetch(`${API_BASE_URL}/costs/${costId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    })
      .then((res) => res.json())
      .then(() => {
        if (selectedVehicle) {
          loadCosts(selectedVehicle.id);
        }
        loadProfitReport();

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

  const loadSales = (vehicleId) => {
    setSales([]);
    fetch(`${API_BASE_URL}/vehicles/${vehicleId}/sales`, { headers: getAuthHeaders() })
      .then((res) => res.json())
      .then((data) => setSales(data.data || []))
      .catch((err) => console.error("Error cargando ventas:", err));
  };

  const resetSaleForm = () => {
    setSaleForm({
      nombre_cliente: "",
      telefono_cliente: "",
      precio_venta: "",
      moneda: "USD",
      tasa_cambio: "",
      fecha_venta: "",
      metodo_pago: "",
      notas: ""
    });
    setEditingSaleId(null);
  };

  const handleSaleChange = (e) => {
    const { name, value } = e.target;
    setSaleForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddSale = (e) => {
    e.preventDefault();
    if (!selectedSalesVehicle) return;
    const url = editingSaleId ? `${API_BASE_URL}/sales/${editingSaleId}` : `${API_BASE_URL}/sales`;
    const method = editingSaleId ? "PATCH" : "POST";
    const payload = {
      ...saleForm,
      precio_venta: Number(saleForm.precio_venta),
      tasa_cambio: saleForm.tasa_cambio !== "" ? Number(saleForm.tasa_cambio) : null,
      ...(editingSaleId ? {} : { vehicle_id: selectedSalesVehicle.id })
    };
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error guardando venta");
        return data;
      })
      .then(() => {
        loadSales(selectedSalesVehicle.id);
        loadVehicles();
        loadProfitReport();
        resetSaleForm();
      })
      .catch((err) => {
        console.error(err);
        alert(err.message);
      });
  };

  const handleEditSale = (sale) => {
    setSaleForm({
      nombre_cliente: sale.nombre_cliente || "",
      telefono_cliente: sale.telefono_cliente || "",
      precio_venta: sale.precio_venta != null ? String(sale.precio_venta) : "",
      moneda: sale.moneda || "USD",
      tasa_cambio: sale.tasa_cambio != null ? String(sale.tasa_cambio) : "",
      fecha_venta: toDateInputValue(sale.fecha_venta || sale.fecha),
      metodo_pago: sale.metodo_pago || "",
      notas: sale.notas || ""
    });

    setEditingSaleId(sale.id);
};

  const handleDeleteSale = (saleId) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta venta?")) return;
    fetch(`${API_BASE_URL}/sales/${saleId}`, { method: "DELETE", headers: getAuthHeaders() })
      .then((res) => res.json())
      .then(() => {
        if (selectedSalesVehicle) {
          loadSales(selectedSalesVehicle.id);
          loadVehicles();
        }
        loadProfitReport();
        if (editingSaleId === saleId) resetSaleForm();
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      setAuthStatus("unauthenticated");
      return;
    }

    loadCurrentUser(token).catch(() => {
      clearSession();
      setLoginError("Tu sesion expiro o ya no es valida. Inicia sesion nuevamente.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    if (!authExpiresAt) {
      return;
    }

    const millisecondsUntilExpiration = authExpiresAt - Date.now();

    if (millisecondsUntilExpiration <= 0) {
      clearSession();
      setLoginError("Tu sesion expiro. Inicia sesion nuevamente.");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearSession();
      setLoginError("Tu sesion expiro. Inicia sesion nuevamente.");
    }, millisecondsUntilExpiration);

    return () => window.clearTimeout(timeoutId);
  }, [authStatus, authExpiresAt]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    if (initialDataLoadedRef.current) {
      return;
    }

    initialDataLoadedRef.current = true;
    loadVehicles();
    loadProfitReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    const syncCostAnalytics = async () => {
      setLoadingCostAnalytics(true);
      try {
        const rows = await fetchCostReportRows();
        setReportRows(rows);
      } catch (error) {
        console.error("Error cargando datos de costos para analytics:", error);
      } finally {
        setLoadingCostAnalytics(false);
      }
    };

    syncCostAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, vehicles]);

  useEffect(() => {
    if (authStatus !== "authenticated" || activeTab !== "reportes") {
      return;
    }

    setReportVisible(true);

    if (reportRows.length > 0 || loadingReport || loadingCostAnalytics || costReportAutoRequestedRef.current) {
      return;
    }

    costReportAutoRequestedRef.current = true;
    loadReport({ showAlert: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authStatus, loadingReport, loadingCostAnalytics, reportRows.length]);

  useEffect(() => {

    if (authStatus !== "authenticated" || authUser?.role !== "admin") {
      return;
    }

    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, authUser?.role]);

  useEffect(() => {
    if (authStatus !== "authenticated" || authUser?.role !== "admin" || activeTab !== "auditoria") {
      return;
    }

    loadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, authUser?.role, activeTab]);

  const deleteVehicle = (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este vehículo?")) return;

    fetch(`${API_BASE_URL}/vehicles/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders()
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
      ? `${API_BASE_URL}/vehicles/${editingId}`
      : `${API_BASE_URL}/vehicles`;

    const method = editingId ? "PATCH" : "POST";

    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
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

  const vehicleOptionLabel = (vehicle) =>
    `${vehicle.marca} ${vehicle.modelo} (${vehicle.anio || "Sin anio"}) - VIN: ${vehicle.vin || "Sin VIN"}`;

  const vehicleMatchesSelectorSearch = (vehicle, query) => {
    if (!query) return true;

    const normalizedQuery = query.toLowerCase();
    return [vehicle.marca, vehicle.modelo, vehicle.anio, vehicle.vin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  };

  const handleCostVehicleSelect = (event) => {
    const vehicle = vehicles.find((item) => String(item.id) === event.target.value);
    setSelectedVehicle(vehicle || null);
    resetCostForm();

    if (vehicle) {
      loadCosts(vehicle.id);
      return;
    }

    setCosts([]);
    setTotalCost(0);
  };

  const handleSalesVehicleSelect = (event) => {
    const vehicle = vehicles.find((item) => String(item.id) === event.target.value);
    setSelectedSalesVehicle(vehicle || null);
    resetSaleForm();

    if (vehicle) {
      loadSales(vehicle.id);
      return;
    }

    setSales([]);
  };

  const costSelectorVehicles = vehicles.filter((vehicle) =>
    vehicleMatchesSelectorSearch(vehicle, costVehicleSearch) || vehicle.id === selectedVehicle?.id
  );
  const salesSelectorVehicles = vehicles.filter((vehicle) =>
    vehicleMatchesSelectorSearch(vehicle, salesVehicleSearch) || vehicle.id === selectedSalesVehicle?.id
  );

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

const formatMoney = (value, currency = "USD") => {
  const cleanCurrency = String(currency || "USD").trim().toUpperCase();

  if (cleanCurrency === "DOP") {
    return `RD$${Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  if (cleanCurrency === "USD") {
    return `US$${Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  return `${cleanCurrency} ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};



  const normalizeDateInput = (value) => {
    if (!value) return "";

    const text = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.slice(0, 10);
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      const [day, month, year] = text.split("/");
      return `${year}-${month}-${day}`;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };
  const toDateInputValue = (value) => {
    if (!value) return "";

    const text = String(value);

    // Caso: "2026-05-01"
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.slice(0, 10);
    }

    // Caso: "Fri, 01 May 2026 00:00:00 GMT"
    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};


  const formatDate = (value) => {
    if (!value) return "—";

    const text = String(value);

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const cleanDate = text.slice(0, 10);
      const [year, month, day] = cleanDate.split("-");
      return `${day}/${month}/${year}`;
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;

    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  };


  const loadProfitReport = async (filters = financialFilters) => {
    setLoadingProfitReport(true);

    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    const queryString = params.toString();
    const url = `${API_BASE_URL}/vehicles/profit-report${queryString ? `?${queryString}` : ""}`;

    try {
      const response = await fetch(url, { headers: getAuthHeaders() });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo cargar el reporte de ganancias.");
      }

      setProfitRows(payload.data || []);
      setAppliedFinancialFilters({ ...filters });
    } catch (error) {
      console.error("Error cargando reporte de ganancias:", error);
      alert("No se pudo cargar el reporte de ganancias. Intenta nuevamente.");
    } finally {
      setLoadingProfitReport(false);
    }
  };

  const handleFinancialFilterChange = (event) => {
    const { name, value } = event.target;
    setFinancialFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value
    }));
  };

  const handleApplyFinancialFilters = (event) => {
    event.preventDefault();
    loadProfitReport(financialFilters);
  };

  const handleClearFinancialFilters = () => {
    const cleanFilters = { start_date: "", end_date: "" };
    setFinancialFilters(cleanFilters);
    loadProfitReport(cleanFilters);
  };
  const handleInventoryFilterChange = (event) => {
    const { name, value } = event.target;
    setInventoryFilters((current) => ({ ...current, [name]: value }));
  };

  const clearInventoryFilters = () => {
    setInventoryFilters({
      estado: "",
      marca: "",
      anio: "",
      minPrecio: "",
      maxPrecio: "",
      conCostos: "",
      conVenta: ""
    });
  };

  const fetchCostReportRows = async () => {
    if (!vehicles.length) {
      return [];
    }

    const rows = await Promise.all(
      vehicles.map(async (vehicle) => {
        const [costsResponse, totalResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/vehicles/${vehicle.id}/costs`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE_URL}/vehicles/${vehicle.id}/costs/total`, { headers: getAuthHeaders() })
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

    return rows;
  };

  const loadReport = async ({ showAlert = true } = {}) => {
    setLoadingReport(true);
    setReportVisible(true);

    try {
      const rows = await fetchCostReportRows();
      setReportRows(rows);
    } catch (error) {
      console.error("Error cargando reporte de costos:", error);
      if (showAlert) {
        alert("No se pudo cargar el reporte de costos. Intenta nuevamente.");
      }
    } finally {
      setLoadingReport(false);
    }
  };

  const isCostReportLoading = loadingReport || loadingCostAnalytics;


  const handleExportReport = (format) => {
    if (isCostReportLoading) {
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

  const handleExportFinancialReport = (format) => {
    if (loadingProfitReport) {
      return;
    }

    const printWindow = format === EXPORT_FORMATS.PDF ? window.open("", "_blank") : null;
    if (format === EXPORT_FORMATS.PDF && !printWindow) {
      alert("No se pudo abrir la ventana de impresiÃ³n. Habilita los pop-ups e intÃ©ntalo de nuevo.");
      return;
    }

    setExportingFinancialReport(true);
    try {
      exportFinancialReport({
        format,
        profitRows,
        profitTotals,
        margenPromedio,
        filters: appliedFinancialFilters,
        estadoLabel,
        printWindow,
        reportTitle: "Dashboard financiero ejecutivo",
        tableTitle: "Ganancia por vehículo"
      });
    } catch (error) {
      if (printWindow && !printWindow.closed) {
        printWindow.close();
      }
      console.error("Error exportando dashboard financiero:", error);
      alert(error.message || "No se pudo exportar el dashboard financiero.");
    } finally {
      setExportingFinancialReport(false);
    }
  };
  const handleExportInventoryReport = (format) => {
    const printWindow = format === EXPORT_FORMATS.PDF ? window.open("", "_blank") : null;
    if (format === EXPORT_FORMATS.PDF && !printWindow) {
      alert("No se pudo abrir la ventana de impresión. Habilita los pop-ups e inténtalo de nuevo.");
      return;
    }

    const inventoryTotals = advancedInventoryRows.reduce(
      (acc, row) => ({
        totalVentas: acc.totalVentas + Number(row.total_venta || 0),
        totalCostos: acc.totalCostos + Number(row.total_costos || 0),
        gananciaTotal: acc.gananciaTotal + Number(row.ganancia_real || 0),
        sumaMargen: acc.sumaMargen + Number(row.margen_porcentaje || 0),
        vendidos: acc.vendidos + (Number(row.total_venta || 0) > 0 ? 1 : 0),
        disponibles: acc.disponibles + (row.estado === "disponible" ? 1 : 0),
        conPerdida: acc.conPerdida + (Number(row.ganancia_real || 0) < 0 ? 1 : 0),
        conGanancia: acc.conGanancia + (Number(row.ganancia_real || 0) > 0 ? 1 : 0)
      }),
      { totalVentas: 0, totalCostos: 0, gananciaTotal: 0, sumaMargen: 0, vendidos: 0, disponibles: 0, conPerdida: 0, conGanancia: 0 }
    );

    exportFinancialReport({
      format,
      profitRows: advancedInventoryRows,
      profitTotals: inventoryTotals,
      margenPromedio: advancedInventoryRows.length ? inventoryTotals.sumaMargen / advancedInventoryRows.length : 0,
      filters: appliedFinancialFilters,
      estadoLabel,
      printWindow,
      reportTitle: "Reporte de inventario",
      tableTitle: "Inventario valorizado",
      emptyMessage: "No hay vehículos para mostrar con los filtros actuales."
    });
  };

  const handlePrintReceipt = async (vehicle) => {
    const receiptWindow = window.open("", "_blank");

    if (!receiptWindow) {
      alert("No se pudo abrir la ventana de factura. Habilita los pop-ups e inténtalo de nuevo.");
      return;
    }

    receiptWindow.document.write("<p style='font-family: Arial, sans-serif; padding: 16px;'>Generando factura...</p>");

    try {
      const response = await fetch(`${API_BASE_URL}/vehicles/${vehicle.id}/sales`, {
        headers: getAuthHeaders()
      });
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
      receiptWindow.document.write(buildReceiptHtml({ vehicle, sale, estadoLabel }));
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

  const profitTotals = (profitRows || []).reduce(
    (acc, row) => ({
      totalVentas: acc.totalVentas + Number(row.total_venta || 0),
      totalCostos: acc.totalCostos + Number(row.total_costos || 0),
      gananciaTotal: acc.gananciaTotal + Number(row.ganancia_real || 0),
      sumaMargen: acc.sumaMargen + Number(row.margen_porcentaje || 0),
      vendidos: acc.vendidos + (Number(row.total_venta || 0) > 0 ? 1 : 0),
      disponibles: acc.disponibles + (row.estado === "disponible" ? 1 : 0),
      conPerdida: acc.conPerdida + (Number(row.ganancia_real || 0) < 0 ? 1 : 0),
      conGanancia: acc.conGanancia + (Number(row.ganancia_real || 0) > 0 ? 1 : 0)
    }),
    {
      totalVentas: 0,
      totalCostos: 0,
      gananciaTotal: 0,
      sumaMargen: 0,
      vendidos: 0,
      disponibles: 0,
      conPerdida: 0,
      conGanancia: 0
    }
  );

  const margenPromedio = profitRows.length > 0 ? profitTotals.sumaMargen / profitRows.length : 0;

  const executiveFinancialCards = [
    { title: "Total ventas", value: formatMoney(profitTotals.totalVentas), variant: "primary" },
    { title: "Total costos", value: formatMoney(profitTotals.totalCostos), variant: "neutral" },
    {
      title: "Ganancia total",
      value: formatMoney(profitTotals.gananciaTotal),
      variant: profitTotals.gananciaTotal >= 0 ? "positive" : "negative"
    },
    {
      title: "Margen promedio",
      value: `${margenPromedio.toFixed(2)}%`,
      variant: margenPromedio >= 0 ? "positive" : "negative"
    },
    { title: "Vehículos vendidos", value: profitTotals.vendidos, variant: "dark" },
    { title: "Vehículos disponibles", value: profitTotals.disponibles, variant: "info" },
    { title: "Vehículos con pérdida", value: profitTotals.conPerdida, variant: "negative" },
    { title: "Vehículos con ganancia", value: profitTotals.conGanancia, variant: "positive" }
  ];
  const monthKeyFromRow = (row) => {
    const rawDate = row.fecha_venta || row.sale_date || row.fecha || row.created_at;
    const normalized = normalizeDateInput(rawDate);
    if (!normalized) return "Sin fecha";
    return normalized.slice(0, 7);
  };

  const monthlySalesData = Object.values(
    profitRows.reduce((acc, row) => {
      const month = monthKeyFromRow(row);
      acc[month] = acc[month] || { month, totalVentas: 0 };
      acc[month].totalVentas += Number(row.total_venta || 0);
      return acc;
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month));

  const monthlyProfitData = Object.values(
    profitRows.reduce((acc, row) => {
      const month = monthKeyFromRow(row);
      acc[month] = acc[month] || { month, ganancia: 0 };
      acc[month].ganancia += Number(row.ganancia_real || 0);
      return acc;
    }, {})
  ).sort((a, b) => a.month.localeCompare(b.month));

  const costByTypeData = Object.values(
    reportRows.reduce((acc, row) => {
      (row.costs || []).forEach((cost) => {
        const tipo = cost.tipo || "otros";
        acc[tipo] = acc[tipo] || { tipo, monto: 0 };
        acc[tipo].monto += Number(cost.monto || 0);
      });
      return acc;
    }, {})
  ).sort((a, b) => b.monto - a.monto);

  const topProfitVehicles = [...profitRows]
    .sort((a, b) => Number(b.ganancia_real || 0) - Number(a.ganancia_real || 0))
    .slice(0, 5);

  const topLossVehicles = [...profitRows]
    .sort((a, b) => Number(a.ganancia_real || 0) - Number(b.ganancia_real || 0))
    .slice(0, 5);

  const inventoryByStatusData = ESTADOS.map((estado) => ({
    estado,
    cantidad: profitRows.filter((row) => row.estado === estado).length
  })).filter((row) => row.cantidad > 0);
  const uniqueBrands = [...new Set(profitRows.map((row) => row.marca).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
  const uniqueYears = [...new Set(profitRows.map((row) => row.anio).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  const advancedInventoryRows = profitRows.filter((row) => {
    const precio = Number(row.precio_estimado || 0);
    const hasCostos = Number(row.total_costos || 0) > 0;
    const hasVenta = Number(row.total_venta || 0) > 0;
    if (inventoryFilters.estado && row.estado !== inventoryFilters.estado) return false;
    if (inventoryFilters.marca && row.marca !== inventoryFilters.marca) return false;
    if (inventoryFilters.anio && String(row.anio) !== String(inventoryFilters.anio)) return false;
    if (inventoryFilters.minPrecio && precio < Number(inventoryFilters.minPrecio)) return false;
    if (inventoryFilters.maxPrecio && precio > Number(inventoryFilters.maxPrecio)) return false;
    if (inventoryFilters.conCostos === "si" && !hasCostos) return false;
    if (inventoryFilters.conCostos === "no" && hasCostos) return false;
    if (inventoryFilters.conVenta === "si" && !hasVenta) return false;
    if (inventoryFilters.conVenta === "no" && hasVenta) return false;
    return true;
  });

  const isAdmin = authUser?.role === "admin";
  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "vehiculos", label: "Vehículos" },
    { key: "costos", label: "Costos" },
    { key: "ventas", label: "Ventas" },
    { key: "reportes", label: "Reportes" },
    { key: "analytics", label: "Analytics" },
    { key: "usuarios", label: "Usuarios", adminOnly: true },
    { key: "auditoria", label: "Auditoría", adminOnly: true }
  ];

  const metricCards = [
    { title: "Total vehículos", value: vehicles.length, icon: "🚗", variant: "neutral" },
    { title: "Valor inventario", value: formatMoney(totalInventario), icon: "💰", variant: "success" },
    { title: "Disponibles", value: disponibles, icon: "🟢", variant: "info" },
    { title: "Vendidos", value: vendidos, icon: "⚫", variant: "dark" },
    { title: "Valor disponible", value: formatMoney(valorDisponible), icon: "💵", variant: "primary" }
  ];

  if (authStatus !== "authenticated") {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-busy={authStatus === "checking"}>
          <div className="login-brand">
            <img className="login-logo" src={COMPANY_BRAND.logo} alt={COMPANY_BRAND.name} />
            <p className="eyebrow">Acceso corporativo</p>
            <h1>Acceso seguro</h1>
            <p className="page-subtitle">{COMPANY_BRAND.subtitle}</p>
          </div>

          {authStatus === "checking" ? (
            <div className="login-status">Validando sesion...</div>
          ) : (
            <form className="login-form" onSubmit={handleLoginSubmit}>
              <label className="login-field">
                Email
                <input
                  className="input-control"
                  type="email"
                  name="email"
                  value={loginForm.email}
                  onChange={handleLoginChange}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="login-field">
                Password
                <input
                  className="input-control"
                  type="password"
                  name="password"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  placeholder="Tu password"
                  autoComplete="current-password"
                  required
                />
              </label>

              {loginError && <div className="login-error">{loginError}</div>}

              <button className="btn btn-primary login-submit" type="submit" disabled={loginLoading}>
                {loginLoading ? "Ingresando..." : "Iniciar sesion"}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="brand-header">
          <img className="brand-logo" src={COMPANY_BRAND.logo} alt={COMPANY_BRAND.name} />
          <div>
            <p className="eyebrow">Sistema corporativo</p>
            <h1>{COMPANY_BRAND.name}</h1>
            <p className="page-subtitle">{COMPANY_BRAND.subtitle}</p>
          </div>
        </div>
        <div className="user-menu">
          <div className="user-meta">
            <span className="user-label">Sesion activa</span>
            <strong>{authUser?.name || authUser?.email}</strong>
            {authUser?.name && <span>{authUser.email}</span>}
          </div>
          {isAdmin && (
            <button className="btn btn-primary" type="button" onClick={() => setShowUsersAdmin((current) => !current)}>
              Administrar usuarios
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={handleLogout}>
            Cerrar sesion
          </button>
        </div>
      </header>
      <nav className="tabs-nav" aria-label="Navegación principal">
        {tabs
          .filter((tab) => !tab.adminOnly || isAdmin)
          .map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "usuarios" && isAdmin) {
                  setShowUsersAdmin(true);
                }
              }}
            >
              {tab.label}
            </button>
          ))}
      </nav>

      {activeTab === "dashboard" && (
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
      )}

      {activeTab === "usuarios" && isAdmin && showUsersAdmin && (
        <section className="panel users-admin-panel">
          <div className="panel-title-row">
            <div>
              <h2>Usuarios</h2>
              <p className="panel-subtitle">Crea usuarios, actualiza rol/estado y cambia passwords. No hay eliminación de usuarios.</p>
            </div>
            <button className="btn btn-secondary" type="button" onClick={loadUsers} disabled={usersLoading}>
              {usersLoading ? "Cargando..." : "Actualizar usuarios"}
            </button>
          </div>

          {usersMessage.text && (
            <div className={`user-feedback user-feedback-${usersMessage.type}`}>{usersMessage.text}</div>
          )}

          <div className="users-admin-grid">
            <form className="admin-user-form" onSubmit={handleUserSubmit}>
              <h3>{editingUserId ? "Editar usuario" : "Crear usuario"}</h3>
              <div className="form-grid user-form-grid">
                <input
                  className="input-control"
                  name="name"
                  placeholder="Nombre"
                  value={userForm.name}
                  onChange={handleUserFormChange}
                />
                <input
                  className="input-control"
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={userForm.email}
                  onChange={handleUserFormChange}
                  required
                />
                <select className="input-control" name="role" value={userForm.role} onChange={handleUserFormChange}>
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role === "admin" ? "Admin" : "Usuario"}
                    </option>
                  ))}
                </select>
                {!editingUserId && (
                  <input
                    className="input-control"
                    type="password"
                    name="password"
                    placeholder="Password inicial"
                    value={userForm.password}
                    onChange={handleUserFormChange}
                    required
                  />
                )}
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={userForm.is_active}
                    onChange={handleUserFormChange}
                  />
                  Usuario activo
                </label>
              </div>
              <div className="cost-form-actions user-form-actions">
                <button className="btn btn-primary" type="submit">
                  {editingUserId ? "Actualizar usuario" : "Crear usuario"}
                </button>
                {editingUserId && (
                  <button className="btn btn-secondary" type="button" onClick={resetUserForm}>
                    Cancelar edición
                  </button>
                )}
              </div>
            </form>

            <form className="admin-user-form" onSubmit={handlePasswordSubmit}>
              <h3>Cambiar password</h3>
              <p className="panel-subtitle">
                {passwordForm.userId ? `Usuario seleccionado: ${passwordForm.label}` : "Selecciona un usuario desde la tabla."}
              </p>
              <div className="form-grid user-form-grid">
                <input
                  className="input-control"
                  type="password"
                  placeholder="Nuevo password"
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  required
                  disabled={!passwordForm.userId}
                />
                <button className="btn btn-primary" type="submit" disabled={!passwordForm.userId}>
                  Cambiar password
                </button>
              </div>
            </form>
          </div>

          <div className="table-wrapper">
            <table className="data-table users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr>
                    <td colSpan={6} className="report-empty-cell">
                      Cargando usuarios...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="report-empty-cell">
                      No hay usuarios para mostrar.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.name || "—"}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`role-pill role-${user.role}`}>
                          {user.role === "admin" ? "Admin" : "Usuario"}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill user-status-${user.is_active ? "active" : "inactive"}`}>
                          {user.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-secondary" type="button" onClick={() => handleEditUser(user)}>
                            Editar
                          </button>
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => setPasswordForm({ userId: user.id, label: user.name || user.email, password: "" })}
                          >
                            Password
                          </button>
                          <button className="btn btn-secondary" type="button" onClick={() => handleToggleUserActive(user)}>
                            {user.is_active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "vehiculos" && (
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
      )}

      {activeTab === "vehiculos" && (
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
                          setActiveTab("costos");
                        }}
                      >
                        Costos
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setSelectedSalesVehicle(v);
                          loadSales(v.id);
                          setActiveTab("ventas");
                        }}
                      >
                        Venta
                      </button>
                      {salesByVehicleId[v.id] && (
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
      )}

      {activeTab === "costos" && (
        <section className="panel costs-panel">
          <div className="vehicle-selector">
            <label className="vehicle-selector-field">
              <span>Buscar vehiculo</span>
              <input
                className="input-control"
                type="search"
                placeholder="Marca, modelo, anio o VIN"
                value={costVehicleSearch}
                onChange={(event) => setCostVehicleSearch(event.target.value)}
              />
            </label>
            <label className="vehicle-selector-field vehicle-selector-select">
              <span>Vehiculo para costos</span>
              <select
                className="input-control"
                value={selectedVehicle ? String(selectedVehicle.id) : ""}
                onChange={handleCostVehicleSelect}
              >
                <option value="">Selecciona un vehiculo</option>
                {costSelectorVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicleOptionLabel(vehicle)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!selectedVehicle ? (
            <p className="selection-empty">Selecciona un vehiculo para ver y registrar sus costos.</p>
          ) : (
            <>
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
            <input className="input-control" name="fecha" type="date" max={TODAY_DATE} value={costForm.fecha} onChange={handleCostChange} />
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
                    <td className="numeric">{formatMoney(c.monto,c.moneda)}</td>
                    <td>{c.moneda}</td>
                    <td>{formatDate(c.fecha)}</td>
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
            <button className="btn btn-secondary" type="button" onClick={() => loadReport()} disabled={isCostReportLoading}>
              {isCostReportLoading ? "Actualizando reporte..." : "Generar/Actualizar reporte"}
            </button>
          </div>
            </>
          )}
        </section>
      )}

      {activeTab === "ventas" && (
        <section className="panel costs-panel">
          <div className="vehicle-selector">
            <label className="vehicle-selector-field">
              <span>Buscar vehiculo</span>
              <input
                className="input-control"
                type="search"
                placeholder="Marca, modelo, anio o VIN"
                value={salesVehicleSearch}
                onChange={(event) => setSalesVehicleSearch(event.target.value)}
              />
            </label>
            <label className="vehicle-selector-field vehicle-selector-select">
              <span>Vehiculo para ventas</span>
              <select
                className="input-control"
                value={selectedSalesVehicle ? String(selectedSalesVehicle.id) : ""}
                onChange={handleSalesVehicleSelect}
              >
                <option value="">Selecciona un vehiculo</option>
                {salesSelectorVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicleOptionLabel(vehicle)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!selectedSalesVehicle ? (
            <p className="selection-empty">Selecciona un vehiculo para ver y registrar sus ventas.</p>
          ) : (
            <>
          <div className="panel-title-row">
            <h2>
              Ventas de {selectedSalesVehicle.marca} {selectedSalesVehicle.modelo}
            </h2>
          </div>
          <form onSubmit={handleAddSale} className="form-grid cost-form-grid">
            <input className="input-control" name="nombre_cliente" placeholder="Nombre cliente" value={saleForm.nombre_cliente} onChange={handleSaleChange} required />
            <input className="input-control" name="telefono_cliente" placeholder="Teléfono cliente" value={saleForm.telefono_cliente} onChange={handleSaleChange} />
            <input className="input-control" name="precio_venta" type="number" placeholder="Precio venta" value={saleForm.precio_venta} onChange={handleSaleChange} required />
            <input className="input-control" name="moneda" placeholder="Moneda (USD, DOP)" value={saleForm.moneda} onChange={handleSaleChange} />
            <input className="input-control" name="tasa_cambio" type="number" placeholder="Tasa de cambio" value={saleForm.tasa_cambio} onChange={handleSaleChange} />
            <input className="input-control" name="fecha_venta" type="date" max={TODAY_DATE} value={saleForm.fecha_venta} onChange={handleSaleChange} />
            <input className="input-control" name="metodo_pago" placeholder="Método de pago" value={saleForm.metodo_pago} onChange={handleSaleChange} />
            <input className="input-control" name="notas" placeholder="Notas" value={saleForm.notas} onChange={handleSaleChange} />
            <div className="cost-form-actions">
              <button className="btn btn-primary" type="submit">
                {editingSaleId ? "Actualizar venta" : "Crear venta"}
              </button>
              {editingSaleId && (
                <button className="btn btn-secondary" type="button" onClick={resetSaleForm}>
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th className="numeric">Precio</th>
                  <th>Moneda</th>
                  <th>Fecha</th>
                  <th>Método pago</th>
                  <th>Notas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
			    {sales.map((s) => (
			      <tr key={s.id}>
			        <td>{s.nombre_cliente}</td>
			        <td>{s.telefono_cliente}</td>
			        <td className="numeric">{formatMoney(s.precio_venta)}</td>
			        <td>{s.moneda}</td>
			        <td>{formatDate(s.fecha_venta || s.fecha)}</td>
			        <td>{s.metodo_pago}</td>
			        <td>{s.notas}</td>
			        <td>
			          <div className="table-actions">
			            <button className="btn btn-secondary" onClick={() => handleEditSale(s)}>
			              Editar
			            </button>
			            <button className="btn btn-danger" onClick={() => handleDeleteSale(s.id)}>
			              Eliminar
			            </button>
			          </div>
			        </td>
			      </tr>
			    ))}
			</tbody>
            </table>
          </div>
            </>
          )}
        </section>
      )}

      {activeTab === "reportes" && reportVisible && (
        <section className="panel report-panel">
          <div className="panel-title-row">
            <h2>Reporte de costos por vehículo</h2>
            <div className="report-actions">
              {isCostReportLoading ? <p className="cost-total">Cargando reporte...</p> : null}
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => loadReport()}
                disabled={isCostReportLoading}
              >
                {isCostReportLoading ? "Actualizando..." : "Generar/Actualizar reporte"}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => handleExportReport(EXPORT_FORMATS.XLSX)}
                disabled={isCostReportLoading || exportingReport || reportRows.length === 0}
              >
                {exportingReport ? "Exportando..." : "Exportar Excel (.xlsx)"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => handleExportReport(EXPORT_FORMATS.PDF)}
                disabled={isCostReportLoading || exportingReport || reportRows.length === 0}
              >
                {exportingReport ? "Exportando..." : "Exportar PDF"}
              </button>
            </div>
          </div>

          {!isCostReportLoading && reportRows.length === 0 && (
            <p className="report-empty">No hay datos de costos para mostrar en este momento.</p>
          )}

          {!isCostReportLoading &&
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
                            <td className="numeric">{formatMoney(cost.monto, cost.moneda)}</td>
                            <td>{cost.moneda || "—"}</td>
                            <td className="numeric">{cost.tasa_cambio ?? "—"}</td>
                            <td>{formatDate(cost.fecha || cost.fecha)}</td>
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

      {activeTab === "reportes" && (
      <section className="panel profit-panel">
        <div className="panel-title-row">
          <h2>Reporte de inventario</h2>
          <div className="report-actions">
            <button className="btn btn-primary" type="button" onClick={() => handleExportInventoryReport(EXPORT_FORMATS.XLSX)}>
              Exportar Excel
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => handleExportInventoryReport(EXPORT_FORMATS.PDF)}>
              Exportar PDF
            </button>
          </div>
        </div>
        <form className="financial-filters" onSubmit={(event) => event.preventDefault()}>
          <label className="filter-field"><span>Estado</span><select className="input-control" name="estado" value={inventoryFilters.estado} onChange={handleInventoryFilterChange}><option value="">Todos</option>{ESTADOS.map((estado) => <option key={estado} value={estado}>{estadoLabel(estado)}</option>)}</select></label>
          <label className="filter-field"><span>Marca</span><select className="input-control" name="marca" value={inventoryFilters.marca} onChange={handleInventoryFilterChange}><option value="">Todas</option>{uniqueBrands.map((marca) => <option key={marca} value={marca}>{marca}</option>)}</select></label>
          <label className="filter-field"><span>Año</span><select className="input-control" name="anio" value={inventoryFilters.anio} onChange={handleInventoryFilterChange}><option value="">Todos</option>{uniqueYears.map((anio) => <option key={anio} value={anio}>{anio}</option>)}</select></label>
          <label className="filter-field"><span>Precio mínimo</span><input className="input-control" type="number" name="minPrecio" value={inventoryFilters.minPrecio} onChange={handleInventoryFilterChange} /></label>
          <label className="filter-field"><span>Precio máximo</span><input className="input-control" type="number" name="maxPrecio" value={inventoryFilters.maxPrecio} onChange={handleInventoryFilterChange} /></label>
          <label className="filter-field"><span>Costos</span><select className="input-control" name="conCostos" value={inventoryFilters.conCostos} onChange={handleInventoryFilterChange}><option value="">Todos</option><option value="si">Con costos</option><option value="no">Sin costos</option></select></label>
          <label className="filter-field"><span>Venta</span><select className="input-control" name="conVenta" value={inventoryFilters.conVenta} onChange={handleInventoryFilterChange}><option value="">Todos</option><option value="si">Con venta</option><option value="no">Sin venta</option></select></label>
          <div className="financial-filter-actions"><button className="btn btn-secondary" type="button" onClick={clearInventoryFilters}>Limpiar</button></div>
        </form>
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>VIN</th><th>Marca</th><th>Modelo</th><th>Año</th><th>Estado</th><th className="numeric">Precio estimado</th><th className="numeric">Total costos</th><th className="numeric">Total venta</th><th className="numeric">Ganancia real</th></tr></thead>
            <tbody>
              {!loadingProfitReport && advancedInventoryRows.length === 0 ? <tr><td colSpan={9} className="report-empty-cell">No hay vehículos para mostrar con los filtros actuales.</td></tr> : advancedInventoryRows.map((row) => (
                <tr key={`inventory-${row.vehicle_id}`}>
                  <td>{row.vin || "—"}</td><td>{row.marca || "—"}</td><td>{row.modelo || "—"}</td><td>{row.anio || "—"}</td><td><span className="status-pill">{estadoLabel(row.estado || "inventario")}</span></td>
                  <td className="numeric">{formatMoney(row.precio_estimado)}</td><td className="numeric">{formatMoney(row.total_costos)}</td><td className="numeric">{formatMoney(row.total_venta)}</td>
                  <td className={`numeric profit-value ${Number(row.ganancia_real || 0) >= 0 ? "profit-positive-text" : "profit-negative-text"}`}>{formatMoney(row.ganancia_real)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

    {activeTab === "analytics" && (
    <section className="panel profit-panel">
        <div className="panel-title-row">
          <div>
            <h2>Dashboard financiero ejecutivo</h2>
            <p className="panel-subtitle">Resumen consolidado desde el reporte de ganancias.</p>
          </div>
          <div className="report-actions">
            <button className="btn btn-secondary" type="button" onClick={() => loadProfitReport()} disabled={loadingProfitReport}>
              {loadingProfitReport ? "Actualizando..." : "Actualizar reporte"}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => handleExportFinancialReport(EXPORT_FORMATS.XLSX)}
              disabled={loadingProfitReport || exportingFinancialReport}
            >
              {exportingFinancialReport ? "Exportando..." : "Exportar Excel"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => handleExportFinancialReport(EXPORT_FORMATS.PDF)}
              disabled={loadingProfitReport || exportingFinancialReport}
            >
              {exportingFinancialReport ? "Exportando..." : "Exportar PDF"}
            </button>
          </div>
        </div>

        <form className="financial-filters" onSubmit={handleApplyFinancialFilters}>
          <label className="filter-field">
            <span>Desde</span>
            <input
              className="input-control"
              type="date"
              name="start_date"
              value={financialFilters.start_date}
              onChange={handleFinancialFilterChange}
            />
          </label>
          <label className="filter-field">
            <span>Hasta</span>
            <input
              className="input-control"
              type="date"
              name="end_date"
              value={financialFilters.end_date}
              onChange={handleFinancialFilterChange}
            />
          </label>
          <div className="financial-filter-actions">
            <button className="btn btn-primary" type="submit" disabled={loadingProfitReport}>
              Aplicar filtros
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleClearFinancialFilters} disabled={loadingProfitReport}>
              Limpiar filtros
            </button>
          </div>
        </form>

        <div className="profit-summary-grid">
          {executiveFinancialCards.map((card) => (
            <article key={card.title} className={`metric-card executive-metric-card metric-${card.variant}`}>
              <p className="metric-title">{card.title}</p>
              <p className="metric-value">{card.value}</p>
            </article>
          ))}
        </div>
        <div className="profit-detail-heading">
          <h3>Analytics</h3>
          <p className="panel-subtitle">Visual ejecutivo basado en el reporte cargado.</p>
        </div>
        <div className="metrics-grid">
          <article className="metric-card metric-neutral chart-panel">
            <h4>Ventas por mes</h4>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlySalesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatMoney(value), "Ventas"]} />
                  <Bar dataKey="totalVentas" fill="#2563eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="metric-card metric-neutral chart-panel">
            <h4>Ganancia por mes</h4>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyProfitData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => [formatMoney(value), "Ganancia"]} />
                  <Bar dataKey="ganancia" radius={[8, 8, 0, 0]}>
                    {monthlyProfitData.map((item) => (
                      <Cell key={`profit-month-${item.month}`} fill={item.ganancia >= 0 ? "#16a34a" : "#dc2626"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="metric-card metric-neutral chart-panel">
            <h4>Costos por tipo</h4>
            {costByTypeData.length === 0 ? (
              <p className="panel-subtitle">Genera “Reporte de costos por vehículo” para visualizar este gráfico.</p>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={costByTypeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tipo" />
                    <YAxis />
                    <Tooltip formatter={(value) => [formatMoney(value), "Costos"]} />
                    <Bar dataKey="monto" fill="#f97316" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
          <article className="metric-card metric-neutral chart-panel">
            <h4>Inventario por estado</h4>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={inventoryByStatusData} dataKey="cantidad" nameKey="estado" outerRadius={80} label={(item) => estadoLabel(item.estado)}>
                    {inventoryByStatusData.map((entry, index) => (
                      <Cell key={`status-pie-${index}`} fill={coloresEstado[entry.estado] || "#8884d8"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, "Cantidad"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
        <div className="users-admin-grid">
          <article className="panel">
            <h4>Top 5 vehículos con mayor ganancia</h4>
            <ul>
              {topProfitVehicles.map((row) => (
                <li key={`top-profit-${row.vehicle_id}`}>{row.vin || `${row.marca || ""} ${row.modelo || ""}`}: {formatMoney(row.ganancia_real)}</li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h4>Top 5 vehículos con pérdida</h4>
            <ul>
              {topLossVehicles.map((row) => (
                <li key={`top-loss-${row.vehicle_id}`}>{row.vin || `${row.marca || ""} ${row.modelo || ""}`}: {formatMoney(row.ganancia_real)}</li>
              ))}
            </ul>
          </article>
        </div>

        <div className="profit-detail-heading">
          <h3>Ganancia por vehículo</h3>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>VIN</th><th>Marca</th><th>Modelo</th><th>Año</th><th>Estado</th>
                <th className="numeric">Total costos</th><th className="numeric">Total venta</th>
                <th className="numeric">Ganancia real</th><th className="numeric">Margen</th>
              </tr>
            </thead>
            <tbody>
              {!loadingProfitReport && profitRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="report-empty-cell">No hay datos de ganancias para mostrar.</td>
                </tr>
              ) : (
                profitRows.map((row) => (
                  <tr key={row.vehicle_id}>
                    <td>{row.vin || "—"}</td>
                    <td>{row.marca || "—"}</td>
                    <td>{row.modelo || "—"}</td>
                    <td>{row.anio || "—"}</td>
                    <td><span className="status-pill">{estadoLabel(row.estado || "inventario")}</span></td>
                    <td className="numeric">{formatMoney(row.total_costos)}</td>
                    <td className="numeric">{formatMoney(row.total_venta)}</td>
                    <td className={`numeric profit-value ${Number(row.ganancia_real || 0) >= 0 ? "profit-positive-text" : "profit-negative-text"}`}>{formatMoney(row.ganancia_real)}</td>
                    <td className={`numeric profit-value ${Number(row.margen_porcentaje || 0) >= 0 ? "profit-positive-text" : "profit-negative-text"}`}>{Number(row.margen_porcentaje || 0).toFixed(2)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {activeTab === "usuarios" && isAdmin && !showUsersAdmin && (
        <section className="panel">
          <h2>Usuarios</h2>
          <p className="panel-subtitle">Usa el botón “Administrar usuarios” del encabezado para abrir el módulo.</p>
        </section>
      )}

      {activeTab === "auditoria" && (
        <section className="panel">
          <h2>Auditoría</h2>
          <p className="panel-subtitle">Registro de acciones administrativas del sistema.</p>
          <button className="btn btn-secondary" type="button" onClick={loadAuditLogs} disabled={auditLogsLoading}>
            {auditLogsLoading ? "Cargando..." : "Actualizar auditoría"}
          </button>
          {auditLogsMessage.text && (
            <div className={`user-feedback user-feedback-${auditLogsMessage.type}`}>{auditLogsMessage.text}</div>
          )}
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>ID entidad</th>
                  <th>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {!auditLogsLoading && auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="report-empty-cell">
                      {auditLogsMessage.text || "No hay registros de auditoría para mostrar."}
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.created_at || "—"}</td>
                      <td>{log.user_name || log.user_email || log.user_id || "—"}</td>
                      <td>{log.action || "—"}</td>
                      <td>{log.entity_type || "—"}</td>
                      <td>{log.entity_id || "—"}</td>
                      <td>{typeof log.details === "string" ? log.details : JSON.stringify(log.details || {})}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
}

export default App;

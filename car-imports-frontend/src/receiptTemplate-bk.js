const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value) => {
    if (!value) return "—";

    const text = String(value);

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const cleanDate = text.slice(0, 10);
      const [year, month, day] = cleanDate.split("-");
      return `${day}/${month}/${year}`;
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

export const buildReceiptHtml = ({ vehicle, sale, estadoLabel }) => {
  const issuedAt = new Date();
  const saleCurrency = sale.moneda || "USD";
  const totalLabel = formatMoneyByCurrency(sale.precio_venta, saleCurrency);
  const exchangeRateLabel = sale.tasa_cambio ? Number(sale.tasa_cambio).toFixed(2) : "—";
  const saleDate = sale.fecha_Venta || sale.fecha_venta;

  const company = {
    name: "Minier Castillo Auto Import S.R.L",
    address: "Calle Francisco Segura y Sandoval No. 110, Los Mina",
    phone: "809-596-1345",
    rnc: "130-41028-3",
    city: "Santo Domingo"
};

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Recibo de venta - Vehículo ${escapeHtml(vehicle.id)}</title>
    <style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#f1f5f9;color:#0f172a;padding:24px}.receipt{max-width:840px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px}.receipt-header{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:18px}.receipt-header h1{margin:0;font-size:24px;color:#1e3a8a}.receipt-subtitle{margin-top:6px;color:#64748b}.section{margin-bottom:20px}.section h2{font-size:16px;margin-bottom:10px;color:#334155}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}.field{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc}.label{display:block;color:#64748b;font-size:12px;margin-bottom:4px}.value{font-size:14px;font-weight:600}.total-box{margin-top:10px;border:2px solid #1d4ed8;border-radius:12px;padding:14px;background:#eff6ff}.total-box .label{font-size:13px}.total-box .value{font-size:24px;color:#1d4ed8}.notes{margin-top:8px;padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;white-space:pre-wrap}.footer{margin-top:26px;color:#64748b;font-size:12px;text-align:center}@media print{body{background:#fff;padding:0}.receipt{border:none;border-radius:0;box-shadow:none;max-width:none;padding:0}}</style>
  </head>
  <body>
    <main class="receipt">
      <header class="receipt-header"><div><h1>Recibo de venta</h1><p class="receipt-subtitle">Factura de venta del vehículo</p></div><div><span class="label">Fecha de emisión</span><strong>${escapeHtml(issuedAt.toLocaleString("es-DO"))}</strong></div></header>
      <section class="section"><h2>Datos del cliente</h2><div class="grid"><div class="field"><span class="label">Nombre</span><span class="value">${escapeHtml(sale.nombre_cliente || "—")}</span></div><div class="field"><span class="label">Teléfono</span><span class="value">${escapeHtml(sale.telefono_cliente || "—")}</span></div></div></section>
      <section class="section"><h2>Datos del vehículo</h2><div class="grid"><div class="field"><span class="label">VIN</span><span class="value">${escapeHtml(vehicle.vin || "—")}</span></div><div class="field"><span class="label">Marca</span><span class="value">${escapeHtml(vehicle.marca || "—")}</span></div><div class="field"><span class="label">Modelo</span><span class="value">${escapeHtml(vehicle.modelo || "—")}</span></div><div class="field"><span class="label">Año</span><span class="value">${escapeHtml(vehicle.anio || "—")}</span></div><div class="field"><span class="label">Estado</span><span class="value">${escapeHtml(estadoLabel(vehicle.estado || ""))}</span></div><div class="field"><span class="label">Fecha de venta</span><span class="value">${escapeHtml(formatDate(saleDate))}</span></div></div></section>
      <section class="section"><h2>Detalle de venta</h2><div class="grid"><div class="field"><span class="label">Precio de venta</span><span class="value">${escapeHtml(totalLabel)}</span></div><div class="field"><span class="label">Moneda</span><span class="value">${escapeHtml(saleCurrency)}</span></div><div class="field"><span class="label">Tasa de cambio</span><span class="value">${escapeHtml(exchangeRateLabel)}</span></div><div class="field"><span class="label">Método de pago</span><span class="value">${escapeHtml(sale.metodo_pago || "—")}</span></div></div><div class="field notes"><span class="label">Notas</span><span class="value">${escapeHtml(sale.notas || "Sin notas")}</span></div><div class="total-box"><span class="label">Total</span><span class="value">${escapeHtml(totalLabel)}</span></div></section>
      <footer class="footer">Documento generado desde Car Imports Dashboard.</footer>
    </main>
  </body>
</html>`;
};

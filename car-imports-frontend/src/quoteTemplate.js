import { COMPANY_BRAND, getCompanyLogoUrl, normalizeCompanySettings } from "./branding";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatDate = (value) => {
  if (!value) return "-";

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

const formatMoney = (value, currency = "USD") => {
  const cleanCurrency = String(currency || "USD").trim().toUpperCase();
  const prefix = cleanCurrency === "DOP" ? "RD$" : cleanCurrency === "USD" ? "US$" : `${cleanCurrency} `;

  return `${prefix}${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

export const buildQuoteHtml = ({ quote, vehicle, companySettings = COMPANY_BRAND }) => {
  const company = normalizeCompanySettings(companySettings);
  const issuedAt = new Date();
  const vehicleTitle = [vehicle?.marca, vehicle?.modelo, vehicle?.anio].filter(Boolean).join(" ") || "-";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Proforma ${escapeHtml(String(quote.id || ""))}</title>
  <style>
    body {
      margin: 0;
      padding: 22px;
      color: #111827;
      font-family: Arial, sans-serif;
      background: #f3f6fb;
    }
    .document {
      max-width: 860px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e5e7eb;
      padding: 28px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 18px;
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .logo {
      width: 118px;
      max-height: 86px;
      object-fit: contain;
    }
    h1, h2, p {
      margin: 0;
    }
    .brand h1 {
      font-size: 21px;
      margin-bottom: 6px;
    }
    .brand p,
    .meta p,
    .footer {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.45;
    }
    .meta {
      text-align: right;
      min-width: 190px;
    }
    .meta h2 {
      color: #1d4ed8;
      font-size: 25px;
      margin-bottom: 10px;
    }
    .section {
      border: 1px solid #e5e7eb;
      padding: 15px;
      margin-bottom: 16px;
    }
    .section h2 {
      font-size: 16px;
      margin-bottom: 12px;
      color: #1f2937;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px 16px;
    }
    .field {
      display: grid;
      gap: 4px;
    }
    .label {
      color: #6b7280;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .value {
      font-size: 14px;
      font-weight: 700;
      white-space: pre-wrap;
    }
    .total {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .total .field {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 12px;
    }
    .grand-total {
      background: #1d4ed8 !important;
      color: #fff;
      border-color: #1d4ed8 !important;
    }
    .grand-total .label {
      color: #dbeafe;
    }
    .grand-total .value {
      font-size: 21px;
    }
    .signature-section {
      display: flex;
      justify-content: space-between;
      gap: 60px;
      margin: 48px 0 24px;
    }
    .signature-box {
      flex: 1;
      text-align: center;
      color: #374151;
      font-size: 13px;
      font-weight: 700;
    }
    .signature-line {
      border-top: 1.5px solid #111827;
      margin-bottom: 8px;
    }
    .footer {
      text-align: center;
      border-top: 1px solid #e5e7eb;
      padding-top: 14px;
    }
    @media print {
      @page { margin: 14mm; }
      body { background: #fff; padding: 0; }
      .document { max-width: none; border: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <main class="document">
    <header class="header">
      <div class="brand">
        <img class="logo" src="${escapeHtml(getCompanyLogoUrl(company))}" alt="${escapeHtml(company.name)}" />
        <div>
          <h1>${escapeHtml(company.name)}</h1>
          <p>${escapeHtml(company.address)}</p>
          <p>${escapeHtml(company.city)}</p>
          <p>Tel: ${escapeHtml(company.phone)} | RNC: ${escapeHtml(company.rnc)}</p>
        </div>
      </div>
      <div class="meta">
        <h2>Proforma</h2>
        <p><strong>No.:</strong> PRO-${escapeHtml(quote.id || "TEMP")}</p>
        <p><strong>Emitida:</strong> ${escapeHtml(formatDate(issuedAt))}</p>
        <p><strong>Valida hasta:</strong> ${escapeHtml(formatDate(quote.valid_until))}</p>
      </div>
    </header>

    <section class="section">
      <h2>Datos del cliente</h2>
      <div class="grid">
        <div class="field"><span class="label">Nombre</span><span class="value">${escapeHtml(quote.customer_name || "-")}</span></div>
        <div class="field"><span class="label">Documento</span><span class="value">${escapeHtml(quote.customer_document || "-")}</span></div>
        <div class="field"><span class="label">Telefono</span><span class="value">${escapeHtml(quote.customer_phone || "-")}</span></div>
        <div class="field"><span class="label">Email</span><span class="value">${escapeHtml(quote.customer_email || "-")}</span></div>
        <div class="field"><span class="label">Direccion</span><span class="value">${escapeHtml(quote.customer_address || "-")}</span></div>
        <div class="field"><span class="label">Entidad financiera</span><span class="value">${escapeHtml(quote.finance_entity || "-")}</span></div>
      </div>
    </section>

    <section class="section">
      <h2>Datos del vehiculo</h2>
      <div class="grid">
        <div class="field"><span class="label">Vehiculo</span><span class="value">${escapeHtml(vehicleTitle)}</span></div>
        <div class="field"><span class="label">VIN</span><span class="value">${escapeHtml(vehicle?.vin || "-")}</span></div>
        <div class="field"><span class="label">Estado</span><span class="value">${escapeHtml(vehicle?.estado || "-")}</span></div>
        <div class="field"><span class="label">Cotizacion</span><span class="value">${escapeHtml(quote.status || "emitida")}</span></div>
      </div>
    </section>

    <section class="section">
      <h2>Detalle de precio</h2>
      <div class="total">
        <div class="field"><span class="label">Precio USD</span><span class="value">${escapeHtml(formatMoney(quote.price_usd, "USD"))}</span></div>
        <div class="field"><span class="label">Tasa</span><span class="value">${escapeHtml(Number(quote.exchange_rate || 0).toFixed(2))}</span></div>
        <div class="field grand-total"><span class="label">Precio DOP</span><span class="value">${escapeHtml(formatMoney(quote.price_dop, "DOP"))}</span></div>
      </div>
    </section>

    <section class="section">
      <h2>Notas</h2>
      <div class="field"><span class="value">${escapeHtml(quote.notes || "Sin notas")}</span></div>
    </section>

    <section class="signature-section">
      <div class="signature-box"><div class="signature-line"></div><p>Firma del cliente</p></div>
      <div class="signature-box"><div class="signature-line"></div><p>Firma autorizada / sello</p></div>
    </section>

    <footer class="footer">
      Esta proforma no representa una venta ni reserva el vehiculo hasta formalizar la operacion.
    </footer>
  </main>
</body>
</html>`;
};

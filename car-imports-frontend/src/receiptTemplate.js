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
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();

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
  const saleCurrency = sale.moneda || "USD";
  const totalLabel = formatMoneyByCurrency(sale.precio_venta, saleCurrency);
  const exchangeRateLabel = sale.tasa_cambio ? Number(sale.tasa_cambio).toFixed(2) : "—";
  const saleDate = sale.fecha_venta || sale.fecha;

  const company = {
    name: "Minier Castillo Auto Import S.R.L",
    address: "Calle Francisco Segura y Sandoval No. 110, Los Mina",
    phone: "809-596-1345",
    rnc: "130-41028-3",
    city: "Santo Domingo",
    logo: "/logo-minier-1.png"
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Factura de venta</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      color: #111827;
    }

    .company-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #1f4ed8;
      padding-bottom: 18px;
      margin-bottom: 28px;
    }

    .company-left {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .company-logo {
      width: 120px;
      height: auto;
      object-fit: contain;
    }

    .company-left h1 {
      margin: 0 0 6px;
      font-size: 22px;
      color: #111827;
    }

    .company-left p,
    .invoice-info p {
      margin: 3px 0;
      font-size: 13px;
      color: #374151;
    }

    .invoice-info {
      text-align: right;
    }

    .invoice-info h2 {
      margin: 0 0 10px;
      color: #1f4ed8;
      font-size: 24px;
    }

    .section {
      margin-bottom: 22px;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
    }

    .section h2 {
      margin-top: 0;
      font-size: 18px;
      color: #1f2937;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .value {
      font-size: 15px;
      font-weight: 600;
    }

    .notes {
      margin-top: 14px;
    }


    .total-box {
       margin-top: 18px;
        padding: 16px;
        background: #1f4ed8;
        color: white;
        border-radius: 10px;
        display: flex;
        justify-content: space-between;
        font-size: 20px;
        font-weight: bold;
    }

    .footer {
      margin-top: 32px;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }

    @media print {
      body {
        padding: 0;
      }
    }

    @media print {
	  @page {
	    margin: 0;
	  }

	  body {
	    margin: 20px;
	  }
}
.signature-section {
  display: flex;
  justify-content: space-between;
  gap: 60px;
  margin-top: 45px;
  margin-bottom: 30px;
}

.signature-box {
  flex: 1;
  text-align: center;
}

.signature-line {
  border-top: 1.5px solid #111827;
  margin-bottom: 8px;
}

.signature-box p {
  margin: 0;
  font-size: 13px;
  color: #374151;
  font-weight: 600;
}
  </style>
</head>

<body>
  <header class="company-header">
    <div class="company-left">
      <img src="${company.logo}" class="company-logo" />
      <div>
        <h1>${escapeHtml(company.name)}</h1>
        <p>${escapeHtml(company.address)}</p>
        <p>${escapeHtml(company.city)}</p>
        <p>Tel: ${escapeHtml(company.phone)}</p>
        <p>RNC: ${escapeHtml(company.rnc)}</p>
      </div>
    </div>

    <div class="invoice-info">
      <h2>Factura de venta</h2>
      <p><strong>Factura #:</strong> INV-${sale.id}-${new Date().getFullYear()}</p>
      <p><strong>Fecha emisión:</strong> ${escapeHtml(formatDate(new Date()))}</p>
    </div>
  </header>

  <main class="receipt">
    <section class="section">
      <h2>Datos del cliente</h2>
      <div class="grid">
        <div class="field">
          <span class="label">Nombre</span>
          <span class="value">${escapeHtml(sale.nombre_cliente || "—")}</span>
        </div>
        <div class="field">
          <span class="label">Teléfono</span>
          <span class="value">${escapeHtml(sale.telefono_cliente || "—")}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Datos del vehículo</h2>
      <div class="grid">
        <div class="field">
          <span class="label">VIN</span>
          <span class="value">${escapeHtml(vehicle.vin || "—")}</span>
        </div>
        <div class="field">
          <span class="label">Marca</span>
          <span class="value">${escapeHtml(vehicle.marca || "—")}</span>
        </div>
        <div class="field">
          <span class="label">Modelo</span>
          <span class="value">${escapeHtml(vehicle.modelo || "—")}</span>
        </div>
        <div class="field">
          <span class="label">Año</span>
          <span class="value">${escapeHtml(vehicle.anio || "—")}</span>
        </div>
        <div class="field">
          <span class="label">Estado</span>
          <span class="value">${escapeHtml(estadoLabel(vehicle.estado || "vendido"))}</span>
        </div>
        <div class="field">
          <span class="label">Fecha de venta</span>
          <span class="value">${escapeHtml(formatDate(saleDate))}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Detalle de venta</h2>
      <div class="grid">
        <div class="field">
          <span class="label">Precio de venta</span>
          <span class="value">${escapeHtml(totalLabel)}</span>
        </div>
        <div class="field">
          <span class="label">Moneda</span>
          <span class="value">${escapeHtml(saleCurrency)}</span>
        </div>
        <div class="field">
          <span class="label">Tasa de cambio</span>
          <span class="value">${escapeHtml(exchangeRateLabel)}</span>
        </div>
        <div class="field">
          <span class="label">Método de pago</span>
          <span class="value">${escapeHtml(sale.metodo_pago || "—")}</span>
        </div>
      </div>

      <div class="field notes">
        <span class="label">Notas</span>
        <span class="value">${escapeHtml(sale.notas || "Sin notas")}</span>
      </div>

      <div class="total-box">
        <span>Total</span>
        <span>${escapeHtml(totalLabel)}</span>
      </div>
    </section>

    <section class="signature-section">
	  <div class="signature-box">
	    <div class="signature-line"></div>
	    <p>Firma del cliente</p>
	  </div>

	  <div class="signature-box">
	    <div class="signature-line"></div>
	    <p>Firma autorizada</p>
	  </div>
    </section>

    <footer class="footer">
      Documento generado por ${escapeHtml(company.name)}.
    </footer>
  </main>
</body>
</html>`;
};
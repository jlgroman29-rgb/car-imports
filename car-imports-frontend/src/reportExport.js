import { COMPANY_BRAND, getCompanyLogoUrl } from "./branding";

const EXPORT_FORMATS = {
  XLSX: "xlsx",
  PDF: "pdf"
};

const EXCEL_HEADERS = [
  "VIN",
  "Marca",
  "Modelo",
  "Año",
  "Estado",
  "Tipo de costo",
  "Monto",
  "Moneda",
  "Tasa cambio",
  "Fecha",
  "Descripción",
  "Total costos vehículo"
];

const FINANCIAL_EXCEL_HEADERS = [
  "VIN",
  "Marca",
  "Modelo",
  "Ano",
  "Estado",
  "Total costos",
  "Total venta",
  "Ganancia real",
  "Margen"
];

const INVENTORY_AGE_HEADERS = ["VIN", "Marca", "Modelo", "Ano", "Estado", "Dias en inventario"];
const PROFITABLE_HEADERS = ["VIN", "Marca", "Modelo", "Ganancia real", "Margen"];
const LOSS_HEADERS = ["VIN", "Marca", "Modelo", "Ganancia real"];
const BRAND_HEADERS = ["Marca", "Cantidad", "Ganancia acumulada", "Ganancia promedio"];

const escapeXml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const toExcelDateSerial = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return utcMidnight / 86400000 + 25569;
};

const formatIsoDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().split("T")[0];
};

const sanitizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const flattenReportRows = (reportRows, estadoLabel) => {
  const rows = [];

  reportRows.forEach((row) => {
    const vehicleState = estadoLabel(row.vehicle.estado || "");
    if (!row.costs.length) {
      rows.push({
        vin: row.vehicle.vin || "—",
        marca: row.vehicle.marca || "—",
        modelo: row.vehicle.modelo || "—",
        anio: row.vehicle.anio || "—",
        estado: vehicleState || "—",
        tipo_costo: "Sin costos",
        monto: 0,
        moneda: "—",
        tasa_cambio: "—",
        fecha: "",
        descripcion: "",
        total_costos_vehiculo: sanitizeNumber(row.totalCost)
      });
      return;
    }

    row.costs.forEach((cost) => {
      rows.push({
        vin: row.vehicle.vin || "—",
        marca: row.vehicle.marca || "—",
        modelo: row.vehicle.modelo || "—",
        anio: row.vehicle.anio || "—",
        estado: vehicleState || "—",
        tipo_costo: estadoLabel(cost.tipo || "") || "—",
        monto: sanitizeNumber(cost.monto),
        moneda: cost.moneda || "—",
        tasa_cambio: cost.tasa_cambio ?? "—",
        fecha: formatIsoDate(cost.fecha),
        descripcion: cost.descripcion || "",
        total_costos_vehiculo: sanitizeNumber(row.totalCost)
      });
    });
  });

  return rows;
};

const textCell = (value, style = 0) => `<c t="inlineStr" s="${style}"><is><t>${escapeXml(value)}</t></is></c>`;

const numberCell = (value, style = 0) => `<c s="${style}"><v>${value}</v></c>`;

const dateCell = (value, style = 4) => {
  const serial = toExcelDateSerial(value);
  if (serial === null) return textCell("", 0);
  return numberCell(serial, style);
};

const colLetter = (index) => {
  let dividend = index;
  let columnName = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
};

const buildSheetXml = (flatRows) => {
  const title = "Reporte de costos por vehículo";
  const generatedAt = `Generado: ${new Date().toLocaleString("es-DO")}`;
  const vehicleCount = new Set(flatRows.map((row) => row.vin)).size;

  const rowXml = [];
  rowXml.push(`<row r="1"><c r="A1" t="inlineStr" s="1"><is><t>${escapeXml(title)}</t></is></c></row>`);
  rowXml.push(`<row r="2"><c r="A2" t="inlineStr" s="3"><is><t>${escapeXml(generatedAt)}</t></is></c></row>`);
  rowXml.push(
    `<row r="3"><c r="A3" t="inlineStr" s="3"><is><t>${escapeXml(`Vehículos incluidos: ${vehicleCount}`)}</t></is></c></row>`
  );

  const headersRow = EXCEL_HEADERS.map((header, idx) => `<c r="${colLetter(idx + 1)}5" t="inlineStr" s="2"><is><t>${escapeXml(header)}</t></is></c>`).join("");
  rowXml.push(`<row r="5">${headersRow}</row>`);

  flatRows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 6;
    const cells = [
      textCell(row.vin),
      textCell(row.marca),
      textCell(row.modelo),
      textCell(row.anio),
      textCell(row.estado),
      textCell(row.tipo_costo),
      numberCell(row.monto, 3),
      textCell(row.moneda),
      typeof row.tasa_cambio === "number" ? numberCell(row.tasa_cambio, 3) : textCell(row.tasa_cambio),
      dateCell(row.fecha),
      textCell(row.descripcion),
      numberCell(row.total_costos_vehiculo, 3)
    ];

    rowXml.push(`<row r="${excelRow}">${cells.join("")}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:L${Math.max(6, flatRows.length + 5)}"/>
  <sheetViews>
    <sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="20" customWidth="1"/>
    <col min="2" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="10" customWidth="1"/>
    <col min="5" max="6" width="18" customWidth="1"/>
    <col min="7" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="10" customWidth="1"/>
    <col min="9" max="9" width="13" customWidth="1"/>
    <col min="10" max="10" width="13" customWidth="1"/>
    <col min="11" max="11" width="36" customWidth="1"/>
    <col min="12" max="12" width="20" customWidth="1"/>
  </cols>
  <sheetData>
    ${rowXml.join("\n    ")}
  </sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:L1"/>
    <mergeCell ref="A2:L2"/>
    <mergeCell ref="A3:L3"/>
  </mergeCells>
</worksheet>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FF1E3A8A"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const buildWorkbookXml = (sheetName) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const crc32 = (bytes) => {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ -1) >>> 0;
};

const concatUint8Arrays = (arrays) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  arrays.forEach((arr) => {
    merged.set(arr, offset);
    offset += arr.length;
  });
  return merged;
};

const createZip = (files) => {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatUint8Arrays([...localParts, centralDirectory, endRecord]);
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportReportToXlsx = ({ reportRows, estadoLabel }) => {
  const flatRows = flattenReportRows(reportRows, estadoLabel);

  if (!flatRows.length) {
    throw new Error("No hay datos para exportar.");
  }

  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: relsXml },
    { name: "xl/workbook.xml", content: buildWorkbookXml("Reporte costos") },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: buildSheetXml(flatRows) }
  ];

  const zipBytes = createZip(files);
  const blob = new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const dateSuffix = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `reporte-costos-vehiculos-${dateSuffix}.xlsx`);
};

const getFinancialFilterLabel = (filters = {}) => {
  const start = filters.start_date || "";
  const end = filters.end_date || "";

  if (start && end) return `Periodo: ${start} al ${end}`;
  if (start) return `Periodo: desde ${start}`;
  if (end) return `Periodo: hasta ${end}`;
  return "Periodo: todos";
};

const normalizeFinancialRows = (profitRows, estadoLabel) =>
  (profitRows || []).map((row) => ({
    vin: row.vin || "-",
    marca: row.marca || "-",
    modelo: row.modelo || "-",
    anio: row.anio || "-",
    estado: estadoLabel(row.estado || "inventario") || "-",
    total_costos: sanitizeNumber(row.total_costos),
    total_venta: sanitizeNumber(row.total_venta),
    ganancia_real: sanitizeNumber(row.ganancia_real),
    margen_porcentaje: sanitizeNumber(row.margen_porcentaje)
  }));

const getFinancialSummaryRows = (profitTotals, margenPromedio) => [
  ["Total ventas", sanitizeNumber(profitTotals.totalVentas)],
  ["Total costos", sanitizeNumber(profitTotals.totalCostos)],
  ["Ganancia total", sanitizeNumber(profitTotals.gananciaTotal)],
  ["Margen promedio", `${sanitizeNumber(margenPromedio).toFixed(2)}%`],
  ["Vehiculos vendidos", sanitizeNumber(profitTotals.vendidos)],
  ["Vehiculos disponibles", sanitizeNumber(profitTotals.disponibles)],
  ["Vehiculos con perdida", sanitizeNumber(profitTotals.conPerdida)],
  ["Vehiculos con ganancia", sanitizeNumber(profitTotals.conGanancia)]
];

const buildFinancialSheetXml = ({ profitRows, profitTotals, margenPromedio, filters, estadoLabel }) => {
  const title = "Dashboard financiero ejecutivo";
  const generatedAt = `Generado: ${new Date().toLocaleString("es-DO")}`;
  const filterLabel = getFinancialFilterLabel(filters);
  const rows = normalizeFinancialRows(profitRows, estadoLabel);
  const tableStartRow = 17;
  const lastRow = Math.max(tableStartRow + rows.length, tableStartRow + 1);

  const summaryRows = getFinancialSummaryRows(profitTotals, margenPromedio);

  const rowXml = [];
  rowXml.push(`<row r="1"><c r="A1" t="inlineStr" s="1"><is><t>${escapeXml(title)}</t></is></c></row>`);
  rowXml.push(`<row r="2"><c r="A2" t="inlineStr" s="3"><is><t>${escapeXml(generatedAt)}</t></is></c></row>`);
  rowXml.push(`<row r="3"><c r="A3" t="inlineStr" s="3"><is><t>${escapeXml(filterLabel)}</t></is></c></row>`);
  rowXml.push('<row r="5"><c r="A5" t="inlineStr" s="2"><is><t>Indicador</t></is></c><c r="B5" t="inlineStr" s="2"><is><t>Valor</t></is></c></row>');

  summaryRows.forEach(([label, value], index) => {
    const excelRow = index + 6;
    const valueCell = typeof value === "number" ? numberCell(value, 3) : textCell(value);
    rowXml.push(`<row r="${excelRow}">${textCell(label)}${valueCell}</row>`);
  });

  const headersRow = FINANCIAL_EXCEL_HEADERS.map(
    (header, idx) => `<c r="${colLetter(idx + 1)}${tableStartRow}" t="inlineStr" s="2"><is><t>${escapeXml(header)}</t></is></c>`
  ).join("");
  rowXml.push(`<row r="${tableStartRow}">${headersRow}</row>`);

  if (!rows.length) {
    rowXml.push(`<row r="${tableStartRow + 1}"><c r="A${tableStartRow + 1}" t="inlineStr" s="0"><is><t>No hay datos de ganancias para mostrar.</t></is></c></row>`);
  } else {
    rows.forEach((row, rowIndex) => {
      const excelRow = tableStartRow + rowIndex + 1;
      const cells = [
        textCell(row.vin),
        textCell(row.marca),
        textCell(row.modelo),
        textCell(row.anio),
        textCell(row.estado),
        numberCell(row.total_costos, 3),
        numberCell(row.total_venta, 3),
        numberCell(row.ganancia_real, 3),
        textCell(`${row.margen_porcentaje.toFixed(2)}%`)
      ];

      rowXml.push(`<row r="${excelRow}">${cells.join("")}</row>`);
    });
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:I${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0"><pane ySplit="${tableStartRow}" topLeftCell="A${tableStartRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="20" customWidth="1"/>
    <col min="2" max="3" width="16" customWidth="1"/>
    <col min="4" max="5" width="12" customWidth="1"/>
    <col min="6" max="8" width="16" customWidth="1"/>
    <col min="9" max="9" width="12" customWidth="1"/>
  </cols>
  <sheetData>
    ${rowXml.join("\n    ")}
  </sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:I1"/>
    <mergeCell ref="A2:I2"/>
    <mergeCell ref="A3:I3"/>
  </mergeCells>
</worksheet>`;
};

const exportFinancialReportToXlsx = ({ profitRows, profitTotals, margenPromedio, filters, estadoLabel }) => {
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: relsXml },
    { name: "xl/workbook.xml", content: buildWorkbookXml("Financiero") },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { name: "xl/styles.xml", content: stylesXml },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildFinancialSheetXml({ profitRows, profitTotals, margenPromedio, filters, estadoLabel })
    }
  ];

  const zipBytes = createZip(files);
  const blob = new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const dateSuffix = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `dashboard-financiero-ejecutivo-${dateSuffix}.xlsx`);
};

const normalizeInventoryIntelligenceRows = (rows = [], estadoLabel) =>
  rows.map((row) => ({
    vin: row.vin || "-",
    marca: row.marca || "-",
    modelo: row.modelo || "-",
    anio: row.anio || "-",
    estado: estadoLabel(row.estado || "inventario") || "-",
    dias_inventario: sanitizeNumber(row.dias_inventario),
    ganancia_real: sanitizeNumber(row.ganancia_real),
    margen_porcentaje: sanitizeNumber(row.margen_porcentaje)
  }));

const normalizeBrandRows = (rows = []) =>
  rows.map((row) => ({
    marca: row.marca || "Sin marca",
    cantidad: sanitizeNumber(row.cantidad),
    ganancia_acumulada: sanitizeNumber(row.ganancia_acumulada),
    ganancia_promedio: sanitizeNumber(row.ganancia_promedio)
  }));

const addSectionTitleRow = (rowXml, rowNumber, title, mergeTo = "F") => {
  rowXml.push(`<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr" s="1"><is><t>${escapeXml(title)}</t></is></c></row>`);
  return { rowNumber: rowNumber + 1, mergeRef: `A${rowNumber}:${mergeTo}${rowNumber}` };
};

const addHeaderRow = (rowXml, rowNumber, headers) => {
  const cells = headers
    .map((header, idx) => `<c r="${colLetter(idx + 1)}${rowNumber}" t="inlineStr" s="2"><is><t>${escapeXml(header)}</t></is></c>`)
    .join("");
  rowXml.push(`<row r="${rowNumber}">${cells}</row>`);
  return rowNumber + 1;
};

const addEmptyRow = (rowXml, rowNumber, message, colSpan = 1) => {
  rowXml.push(`<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr" s="0"><is><t>${escapeXml(message)}</t></is></c></row>`);
  return { rowNumber: rowNumber + 1, mergeRef: `A${rowNumber}:${colLetter(colSpan)}${rowNumber}` };
};

const buildInventoryIntelligenceSheetXml = ({
  summary,
  inventoryAgeRows,
  profitableRows,
  lossRows,
  brandRows,
  estadoLabel
}) => {
  const generatedAt = `Generado: ${new Date().toLocaleString("es-DO")}`;
  const ageRows = normalizeInventoryIntelligenceRows(inventoryAgeRows, estadoLabel);
  const topRows = normalizeInventoryIntelligenceRows(profitableRows, estadoLabel);
  const negativeRows = normalizeInventoryIntelligenceRows(lossRows, estadoLabel);
  const brands = normalizeBrandRows(brandRows);
  const mergeRefs = [];
  const rowXml = [];
  let rowNumber = 1;

  rowXml.push(`<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr" s="1"><is><t>Inteligencia de Inventario</t></is></c></row>`);
  mergeRefs.push(`A${rowNumber}:F${rowNumber}`);
  rowNumber += 1;
  rowXml.push(`<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr" s="3"><is><t>${escapeXml(generatedAt)}</t></is></c></row>`);
  mergeRefs.push(`A${rowNumber}:F${rowNumber}`);
  rowNumber += 2;

  const summaryRows = [
    ["Dias promedio en inventario", `${sanitizeNumber(summary.averageInventoryDays).toFixed(0)} dias`],
    ["Vehiculo mas rentable", summary.mostProfitableLabel || "Sin datos"],
    ["Vehiculo con mayor costo acumulado", summary.highestCostLabel || "Sin datos"],
    ["Vehiculo mas antiguo", summary.oldestInventoryLabel || "Sin datos"]
  ];

  rowXml.push(`<row r="${rowNumber}"><c r="A${rowNumber}" t="inlineStr" s="2"><is><t>Indicador</t></is></c><c r="B${rowNumber}" t="inlineStr" s="2"><is><t>Valor</t></is></c></row>`);
  rowNumber += 1;
  summaryRows.forEach(([label, value]) => {
    rowXml.push(`<row r="${rowNumber}">${textCell(label)}${textCell(value)}</row>`);
    rowNumber += 1;
  });
  rowNumber += 1;

  const addVehicleSection = (title, headers, rows, rowBuilder, emptyMessage, mergeTo) => {
    const section = addSectionTitleRow(rowXml, rowNumber, title, mergeTo);
    rowNumber = section.rowNumber;
    mergeRefs.push(section.mergeRef);
    rowNumber = addHeaderRow(rowXml, rowNumber, headers);
    if (!rows.length) {
      const empty = addEmptyRow(rowXml, rowNumber, emptyMessage, headers.length);
      rowNumber = empty.rowNumber;
      mergeRefs.push(empty.mergeRef);
    } else {
      rows.forEach((row) => {
        rowXml.push(`<row r="${rowNumber}">${rowBuilder(row)}</row>`);
        rowNumber += 1;
      });
    }
    rowNumber += 2;
  };

  addVehicleSection(
    "Vehiculos con mas tiempo en inventario",
    INVENTORY_AGE_HEADERS,
    ageRows,
    (row) => [
      textCell(row.vin),
      textCell(row.marca),
      textCell(row.modelo),
      textCell(row.anio),
      textCell(row.estado),
      numberCell(row.dias_inventario, 3)
    ].join(""),
    "No hay fechas de registro para calcular dias.",
    "F"
  );

  addVehicleSection(
    "Top vehiculos mas rentables",
    PROFITABLE_HEADERS,
    topRows,
    (row) => [
      textCell(row.vin),
      textCell(row.marca),
      textCell(row.modelo),
      numberCell(row.ganancia_real, 3),
      textCell(`${row.margen_porcentaje.toFixed(2)}%`)
    ].join(""),
    "No hay vehiculos con ganancia positiva.",
    "E"
  );

  addVehicleSection(
    "Vehiculos con perdida",
    LOSS_HEADERS,
    negativeRows,
    (row) => [textCell(row.vin), textCell(row.marca), textCell(row.modelo), numberCell(row.ganancia_real, 3)].join(""),
    "No hay vehiculos con perdida registrada.",
    "D"
  );

  const brandSection = addSectionTitleRow(rowXml, rowNumber, "Ranking por marca", "D");
  rowNumber = brandSection.rowNumber;
  mergeRefs.push(brandSection.mergeRef);
  rowNumber = addHeaderRow(rowXml, rowNumber, BRAND_HEADERS);
  if (!brands.length) {
    const empty = addEmptyRow(rowXml, rowNumber, "No hay datos por marca para mostrar.", BRAND_HEADERS.length);
    rowNumber = empty.rowNumber;
    mergeRefs.push(empty.mergeRef);
  } else {
    brands.forEach((row) => {
      rowXml.push(
        `<row r="${rowNumber}">${[
          textCell(row.marca),
          numberCell(row.cantidad, 3),
          numberCell(row.ganancia_acumulada, 3),
          numberCell(row.ganancia_promedio, 3)
        ].join("")}</row>`
      );
      rowNumber += 1;
    });
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:F${Math.max(rowNumber, 8)}"/>
  <sheetViews>
    <sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="6" width="18" customWidth="1"/>
  </cols>
  <sheetData>
    ${rowXml.join("\n    ")}
  </sheetData>
  <mergeCells count="${mergeRefs.length}">
    ${mergeRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join("\n    ")}
  </mergeCells>
</worksheet>`;
};

const exportInventoryIntelligenceToXlsx = ({ summary, inventoryAgeRows, profitableRows, lossRows, brandRows, estadoLabel }) => {
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: relsXml },
    { name: "xl/workbook.xml", content: buildWorkbookXml("Inteligencia") },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { name: "xl/styles.xml", content: stylesXml },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildInventoryIntelligenceSheetXml({ summary, inventoryAgeRows, profitableRows, lossRows, brandRows, estadoLabel })
    }
  ];

  const zipBytes = createZip(files);
  const blob = new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const dateSuffix = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `inteligencia-inventario-${dateSuffix}.xlsx`);
};

const formatAmount = (value) =>
  new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(sanitizeNumber(value));

const pdfBrandStyles = `
    .brand-report-header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border-bottom: 3px solid #1f4ed8; padding-bottom: 14px; margin-bottom: 20px; }
    .brand-report-left { display: flex; align-items: center; gap: 14px; }
    .brand-report-logo { width: 82px; height: 82px; object-fit: contain; }
    .brand-report-kicker { margin: 0 0 4px; color: #1f4ed8; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .brand-report-header h1 { margin: 0 0 4px; color: #111827; font-size: 20px; }
    .brand-report-header p { margin: 2px 0; color: #374151; font-size: 12px; }
    .brand-report-title { text-align: right; min-width: 220px; }
    .brand-report-title h2 { margin: 0 0 8px; color: #1f4ed8; font-size: 22px; }
`;

const buildPdfBrandHeader = ({ title, meta }) => `
  <header class="brand-report-header">
    <div class="brand-report-left">
      <img class="brand-report-logo" src="${escapeXml(getCompanyLogoUrl())}" alt="${escapeXml(COMPANY_BRAND.name)}" />
      <div>
        <p class="brand-report-kicker">${escapeXml(COMPANY_BRAND.subtitle)}</p>
        <h1>${escapeXml(COMPANY_BRAND.name)}</h1>
        <p>${escapeXml(COMPANY_BRAND.address)} | ${escapeXml(COMPANY_BRAND.city)}</p>
        <p>Tel: ${escapeXml(COMPANY_BRAND.phone)} | RNC: ${escapeXml(COMPANY_BRAND.rnc)}</p>
      </div>
    </div>
    <div class="brand-report-title">
      <h2>${escapeXml(title)}</h2>
      <p>${escapeXml(meta)}</p>
    </div>
  </header>`;

const buildPdfHtml = ({ reportRows, estadoLabel }) => {
  const generatedAt = new Date().toLocaleString("es-DO");
  const vehicleCards = reportRows
    .map((row) => {
      const costsRows = row.costs.length
        ? row.costs
            .map(
              (cost) => `<tr>
          <td>${escapeXml(estadoLabel(cost.tipo) || "—")}</td>
          <td class="num">${formatAmount(cost.monto)}</td>
          <td>${escapeXml(cost.moneda || "—")}</td>
          <td class="num">${cost.tasa_cambio ?? "—"}</td>
          <td>${escapeXml(formatIsoDate(cost.fecha) || "—")}</td>
          <td>${escapeXml(cost.descripcion || "—")}</td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="6" class="empty">Este vehículo no tiene costos registrados.</td></tr>`;

      return `<section class="card">
      <header class="card-head">
        <div>
          <h2>${escapeXml(row.vehicle.marca || "—")} ${escapeXml(row.vehicle.modelo || "—")} (${escapeXml(
            row.vehicle.anio || "—"
          )})</h2>
          <p>VIN: ${escapeXml(row.vehicle.vin || "—")}</p>
        </div>
        <div class="meta">
          <p>Estado: <strong>${escapeXml(estadoLabel(row.vehicle.estado) || "—")}</strong></p>
          <p>Total costos: <strong>${formatAmount(row.totalCost)}</strong></p>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Monto</th>
            <th>Moneda</th>
            <th>Tasa cambio</th>
            <th>Fecha</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>${costsRows}</tbody>
      </table>
    </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte de costos por vehículo</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 24px; }
    ${pdfBrandStyles}
    h1 { margin: 0 0 6px; }
    .subtitle { color: #4b5563; margin: 0 0 18px; }
    .card { page-break-inside: avoid; border: 1px solid #d1d5db; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
    .card-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
    .card-head h2 { margin: 0 0 4px; font-size: 18px; }
    .card-head p { margin: 2px 0; }
    .meta { text-align: right; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
    th { background: #eff6ff; }
    td.num { text-align: right; }
    .empty { text-align: center; color: #6b7280; }
    @media print {
      body { margin: 10mm; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${buildPdfBrandHeader({
    title: "Reporte de costos por vehículo",
    meta: `Generado: ${generatedAt} | Vehículos incluidos: ${reportRows.length}`
  })}
  ${vehicleCards}
</body>
</html>`;
};

const buildFinancialPdfHtml = ({
  profitRows,
  profitTotals,
  margenPromedio,
  filters,
  estadoLabel,
  reportTitle = "Dashboard financiero ejecutivo",
  tableTitle = "Ganancia por vehículo",
  emptyMessage = "No hay datos de ganancias para mostrar."
}) => {
  const generatedAt = new Date().toLocaleString("es-DO");
  const rows = normalizeFinancialRows(profitRows, estadoLabel);
  const metrics = getFinancialSummaryRows(profitTotals, margenPromedio).map(([label, value], index) => [
    label,
    typeof value === "number" && index < 3 ? formatAmount(value) : value
  ]);

  const metricCards = metrics
    .map(
      ([label, value]) => `<article class="metric">
        <p>${escapeXml(label)}</p>
        <strong>${escapeXml(value)}</strong>
      </article>`
    )
    .join("");

  const tableRows = rows.length
    ? rows
        .map(
          (row) => `<tr>
          <td>${escapeXml(row.vin)}</td>
          <td>${escapeXml(row.marca)}</td>
          <td>${escapeXml(row.modelo)}</td>
          <td>${escapeXml(row.anio)}</td>
          <td>${escapeXml(row.estado)}</td>
          <td class="num">${formatAmount(row.total_costos)}</td>
          <td class="num">${formatAmount(row.total_venta)}</td>
          <td class="num">${formatAmount(row.ganancia_real)}</td>
          <td class="num">${row.margen_porcentaje.toFixed(2)}%</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="9" class="empty">${escapeXml(emptyMessage)}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(reportTitle)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 24px; }
    ${pdfBrandStyles}
    h1 { margin: 0 0 6px; color: #0f172a; }
    .subtitle { color: #4b5563; margin: 0 0 18px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 22px; }
    .metric { border: 1px solid #dbeafe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 10px; background: #f8fafc; }
    .metric p { color: #64748b; font-size: 11px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; }
    .metric strong { font-size: 16px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 7px; text-align: left; }
    th { background: #eff6ff; color: #334155; text-transform: uppercase; }
    td.num { text-align: right; }
    .empty { text-align: center; color: #6b7280; }
    @media print {
      body { margin: 10mm; }
      .metrics { grid-template-columns: repeat(4, 1fr); }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
  </style>
</head>
<body>
  ${buildPdfBrandHeader({
    title: reportTitle,
    meta: `Generado: ${generatedAt} | ${getFinancialFilterLabel(filters)}`
  })}
  <section class="metrics">${metricCards}</section>
  <h2>${escapeXml(tableTitle)}</h2>
  <table>
    <thead>
      <tr>
        <th>VIN</th>
        <th>Marca</th>
        <th>Modelo</th>
        <th>Ano</th>
        <th>Estado</th>
        <th>Total costos</th>
        <th>Total venta</th>
        <th>Ganancia real</th>
        <th>Margen</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
};

const buildSimpleRows = ({ rows, emptyMessage, cells, colSpan }) =>
  rows.length
    ? rows.map((row) => `<tr>${cells(row)}</tr>`).join("")
    : `<tr><td colspan="${colSpan}" class="empty">${escapeXml(emptyMessage)}</td></tr>`;

const buildInventoryIntelligencePdfHtml = ({
  summary,
  inventoryAgeRows,
  profitableRows,
  lossRows,
  brandRows,
  estadoLabel
}) => {
  const generatedAt = new Date().toLocaleString("es-DO");
  const ageRows = normalizeInventoryIntelligenceRows(inventoryAgeRows, estadoLabel);
  const topRows = normalizeInventoryIntelligenceRows(profitableRows, estadoLabel);
  const negativeRows = normalizeInventoryIntelligenceRows(lossRows, estadoLabel);
  const brands = normalizeBrandRows(brandRows);
  const metrics = [
    ["Dias promedio en inventario", `${sanitizeNumber(summary.averageInventoryDays).toFixed(0)} dias`],
    ["Vehiculo mas rentable", summary.mostProfitableLabel || "Sin datos"],
    ["Mayor costo acumulado", summary.highestCostLabel || "Sin datos"],
    ["Vehiculo mas antiguo", summary.oldestInventoryLabel || "Sin datos"]
  ];

  const metricCards = metrics
    .map(
      ([label, value]) => `<article class="metric">
        <p>${escapeXml(label)}</p>
        <strong>${escapeXml(value)}</strong>
      </article>`
    )
    .join("");

  const ageTableRows = buildSimpleRows({
    rows: ageRows,
    emptyMessage: "No hay fechas de registro para calcular dias.",
    colSpan: 6,
    cells: (row) => `
      <td>${escapeXml(row.vin)}</td><td>${escapeXml(row.marca)}</td><td>${escapeXml(row.modelo)}</td>
      <td>${escapeXml(row.anio)}</td><td>${escapeXml(row.estado)}</td><td class="num">${formatAmount(row.dias_inventario)}</td>`
  });
  const profitableTableRows = buildSimpleRows({
    rows: topRows,
    emptyMessage: "No hay vehiculos con ganancia positiva.",
    colSpan: 5,
    cells: (row) => `
      <td>${escapeXml(row.vin)}</td><td>${escapeXml(row.marca)}</td><td>${escapeXml(row.modelo)}</td>
      <td class="num">${formatAmount(row.ganancia_real)}</td><td class="num">${row.margen_porcentaje.toFixed(2)}%</td>`
  });
  const lossTableRows = buildSimpleRows({
    rows: negativeRows,
    emptyMessage: "No hay vehiculos con perdida registrada.",
    colSpan: 4,
    cells: (row) => `
      <td>${escapeXml(row.vin)}</td><td>${escapeXml(row.marca)}</td><td>${escapeXml(row.modelo)}</td>
      <td class="num negative">${formatAmount(row.ganancia_real)}</td>`
  });
  const brandTableRows = buildSimpleRows({
    rows: brands,
    emptyMessage: "No hay datos por marca para mostrar.",
    colSpan: 4,
    cells: (row) => `
      <td>${escapeXml(row.marca)}</td><td class="num">${formatAmount(row.cantidad)}</td>
      <td class="num">${formatAmount(row.ganancia_acumulada)}</td><td class="num">${formatAmount(row.ganancia_promedio)}</td>`
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Inteligencia de Inventario</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; margin: 24px; }
    ${pdfBrandStyles}
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 20px; }
    .metric { border: 1px solid #dbeafe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 10px; background: #f8fafc; }
    .metric p { color: #64748b; font-size: 11px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; }
    .metric strong { font-size: 13px; color: #0f172a; overflow-wrap: anywhere; }
    .section { page-break-inside: avoid; margin-top: 18px; }
    .section h2 { margin: 0 0 8px; font-size: 16px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 7px; text-align: left; }
    th { background: #eff6ff; color: #334155; text-transform: uppercase; }
    td.num { text-align: right; }
    .negative { color: #b91c1c; font-weight: 700; }
    .empty { text-align: center; color: #6b7280; }
    @media print {
      body { margin: 10mm; }
      .metrics { grid-template-columns: repeat(4, 1fr); }
      tr, .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${buildPdfBrandHeader({ title: "Inteligencia de Inventario", meta: `Generado: ${generatedAt}` })}
  <section class="metrics">${metricCards}</section>
  <section class="section"><h2>Vehiculos con mas tiempo en inventario</h2><table><thead><tr><th>VIN</th><th>Marca</th><th>Modelo</th><th>Ano</th><th>Estado</th><th>Dias</th></tr></thead><tbody>${ageTableRows}</tbody></table></section>
  <section class="section"><h2>Top vehiculos mas rentables</h2><table><thead><tr><th>VIN</th><th>Marca</th><th>Modelo</th><th>Ganancia real</th><th>Margen</th></tr></thead><tbody>${profitableTableRows}</tbody></table></section>
  <section class="section"><h2>Vehiculos con perdida</h2><table><thead><tr><th>VIN</th><th>Marca</th><th>Modelo</th><th>Ganancia real</th></tr></thead><tbody>${lossTableRows}</tbody></table></section>
  <section class="section"><h2>Ranking por marca</h2><table><thead><tr><th>Marca</th><th>Cantidad</th><th>Ganancia acumulada</th><th>Ganancia promedio</th></tr></thead><tbody>${brandTableRows}</tbody></table></section>
</body>
</html>`;
};

const exportReportToPdf = ({ reportRows, estadoLabel, printWindow }) => {
  if (!reportRows.length) {
    throw new Error("No hay datos para exportar.");
  }

  if (!printWindow) {
    throw new Error("No se pudo abrir la ventana de impresión. Habilita los pop-ups e inténtalo de nuevo.");
  }

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(buildPdfHtml({ reportRows, estadoLabel }));
  printWindow.document.close();
};

const exportFinancialReportToPdf = ({
  profitRows,
  profitTotals,
  margenPromedio,
  filters,
  estadoLabel,
  printWindow,
  reportTitle,
  tableTitle,
  emptyMessage
}) => {
  if (!printWindow) {
    throw new Error("No se pudo abrir la ventana de impresión. Habilita los pop-ups e inténtalo de nuevo.");
  }

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(
    buildFinancialPdfHtml({
      profitRows,
      profitTotals,
      margenPromedio,
      filters,
      estadoLabel,
      reportTitle,
      tableTitle,
      emptyMessage
    })
  );
  printWindow.document.close();
};

const exportInventoryIntelligenceToPdf = ({
  summary,
  inventoryAgeRows,
  profitableRows,
  lossRows,
  brandRows,
  estadoLabel,
  printWindow
}) => {
  if (!printWindow) {
    throw new Error("No se pudo abrir la ventana de impresion. Habilita los pop-ups e intentalo de nuevo.");
  }

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(
    buildInventoryIntelligencePdfHtml({ summary, inventoryAgeRows, profitableRows, lossRows, brandRows, estadoLabel })
  );
  printWindow.document.close();
};

const buildCustomsEstimatePdfHtml = ({ estimate, generatedAt }) => {
  const customsValue = estimate?.customs_value || {};
  const inputs = estimate?.inputs || {};
  const effectiveFobUsd = inputs.fob_usd || customsValue.valor_aduanas || 0;
  const modalidades = estimate?.modalidades || {};
  const presentation = estimate?.presentation || null;
  const baseRows = (presentation?.baseRows || [
    { key: "fob", label: "FOB", usd: effectiveFobUsd, dop: 0 },
    { key: "seguro", label: "Seguro", usd: inputs.seguro_usd || 0, dop: 0 },
    { key: "flete", label: "Flete", usd: inputs.flete_usd || 0, dop: 0 },
    { key: "cif", label: "Valor CIF", usd: inputs.cif_usd || 0, dop: 0, emphasis: true }
  ])
    .map((row) => `<tr class="${row.emphasis ? "emphasis" : ""}">
      <th>${escapeXml(row.label)}</th>
      <td class="num">US$${formatAmount(row.usd || 0)}</td>
      <td class="num">RD$${formatAmount(row.dop || 0)}</td>
    </tr>`)
    .join("");
  const modalities = presentation?.modalities || [
    { key: "dealer", label: "Dealer", gravamenDop: modalidades.dealer?.gravamen_dop || 0, itbisDop: modalidades.dealer?.itbis_dop || 0, totalFinalDop: modalidades.dealer?.total_dop || 0, estimacionUsd: 0 },
    { key: "particular", label: "Particular", gravamenDop: modalidades.particular?.gravamen_dop || 0, itbisDop: modalidades.particular?.itbis_dop || 0, totalFinalDop: modalidades.particular?.total_dop || 0, estimacionUsd: 0 },
    { key: "dr_cafta", label: "DR-CAFTA", gravamenDop: modalidades.dr_cafta?.gravamen_dop || 0, itbisDop: modalidades.dr_cafta?.itbis_dop || 0, totalFinalDop: modalidades.dr_cafta?.total_dop || 0, estimacionUsd: 0 }
  ];
  const modalityRows = presentation?.modalityRows || [
    { key: "gravamenDop", label: "Gravamen", currency: "DOP" },
    { key: "itbisDop", label: "ITBIS", currency: "DOP" },
    { key: "totalFinalDop", label: "Total Final", currency: "DOP", final: true }
  ];
  const modalityHeader = modalities.map((modality) => `<td class="num">US$${formatAmount(modality.estimacionUsd || 0)}</td>`).join("");
  const modalityNames = modalities.map((modality) => `<th>${escapeXml(modality.label)}</th>`).join("");
  const modalityBody = modalityRows
    .map((row) => `<tr class="${row.emphasis ? "emphasis" : ""} ${row.final ? "final" : ""}">
      <th>${escapeXml(row.label)}</th>
      ${modalities
        .map((modality) => `<td class="num">${row.currency === "USD" ? "US$" : "RD$"}${formatAmount(modality[row.key] || 0)}</td>`)
        .join("")}
    </tr>`)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Estimación Aduanal</title>
  <style>
    ${pdfBrandStyles}
    @page { size: letter; margin: 7mm; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; padding: 18px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin: 12px 0; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
    .summary-card span { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
    .summary-card strong { display: block; font-size: 13px; color: #111827; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 7px; text-align: left; vertical-align: top; }
    th { background: #eff6ff; color: #1e3a8a; }
    .table-title { margin: 12px 0 4px; color: #111827; font-size: 14px; }
    .num { text-align: right; white-space: nowrap; }
    .usd-row th, .usd-row td { background: #fff7ed; color: #111827; font-weight: 800; }
    .emphasis th, .emphasis td { background: #f8fafc; font-weight: 800; }
    .final th, .final td { color: #166534; font-size: 12px; font-weight: 900; }
    .spec { grid-column: 1 / -1; }
    @media print {
      body { padding: 0; }
      .brand-report-header { padding-bottom: 8px; margin-bottom: 10px; gap: 10px; border-bottom-width: 2px; }
      .brand-report-left { gap: 10px; }
      .brand-report-logo { width: 58px; height: 58px; }
      .brand-report-kicker { font-size: 9px; margin-bottom: 2px; }
      .brand-report-header h1 { font-size: 16px; margin-bottom: 2px; }
      .brand-report-header p { font-size: 10px; margin: 1px 0; }
      .brand-report-title { min-width: 170px; }
      .brand-report-title h2 { font-size: 17px; margin-bottom: 4px; }
      .summary-grid { gap: 6px; margin: 8px 0; }
      .summary-card { padding: 5px 6px; border-radius: 6px; }
      .summary-card span { font-size: 8.5px; margin-bottom: 2px; }
      .summary-card strong { font-size: 10.5px; }
      table { font-size: 9.5px; margin-top: 5px; page-break-inside: avoid; }
      th, td { padding: 3.5px 5px; }
      .table-title { margin: 8px 0 2px; font-size: 11.5px; }
      .final th, .final td { font-size: 10.5px; }
    }
  </style>
</head>
<body>
  ${buildPdfBrandHeader({ title: "Estimación Aduanal", meta: `Generado: ${generatedAt}` })}
  <section class="summary-grid">
    <div class="summary-card"><span>Marca</span><strong>${escapeXml(customsValue.marca || "")}</strong></div>
    <div class="summary-card"><span>Modelo</span><strong>${escapeXml(customsValue.modelo || "")}</strong></div>
    <div class="summary-card"><span>Año</span><strong>${escapeXml(customsValue.anio || "")}</strong></div>
    <div class="summary-card"><span>País</span><strong>${escapeXml(customsValue.pais || "")}</strong></div>
    <div class="summary-card"><span>Valor Aduanas / factura</span><strong>US$${formatAmount(effectiveFobUsd)}</strong></div>
    <div class="summary-card"><span>Valor tabla</span><strong>US$${formatAmount(customsValue.valor_aduanas || 0)}</strong></div>
    <div class="summary-card spec"><span>Especificación</span><strong>${escapeXml(customsValue.especificacion_producto || "")}</strong></div>
    <div class="summary-card"><span>Tasa</span><strong>${escapeXml(inputs.tasa_cambio || 0)}</strong></div>
    <div class="summary-card"><span>Flete</span><strong>US$${formatAmount(inputs.flete_usd || 0)}</strong></div>
  </section>
  <h3 class="table-title">Base FOB / CIF</h3>
  <table>
    <thead>
      <tr><th>Renglón</th><th>U.S.</th><th>R.D.</th></tr>
    </thead>
    <tbody>${baseRows}</tbody>
  </table>
  <h3 class="table-title">Estimación por modalidad</h3>
  <table>
    <thead>
      <tr class="usd-row"><th>Estimación en USD$</th>${modalityHeader}</tr>
      <tr><th></th>${modalityNames}</tr>
    </thead>
    <tbody>${modalityBody}</tbody>
  </table>
</body>
</html>`;
};

const exportCustomsEstimateToPdf = ({ estimate, printWindow }) => {
  if (!estimate) {
    throw new Error("No hay estimacion para exportar.");
  }

  if (!printWindow) {
    throw new Error("No se pudo abrir la ventana de impresion. Habilita los pop-ups e intentalo de nuevo.");
  }

  const generatedAt = new Date().toLocaleString("es-DO");
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(buildCustomsEstimatePdfHtml({ estimate, generatedAt }));
  printWindow.document.close();
};

export const exportCostReport = ({ format = EXPORT_FORMATS.XLSX, reportRows, estadoLabel, printWindow = null }) => {
  if (format === EXPORT_FORMATS.XLSX) {
    exportReportToXlsx({ reportRows, estadoLabel });
    return;
  }

  if (format === EXPORT_FORMATS.PDF) {
    exportReportToPdf({ reportRows, estadoLabel, printWindow });
    return;
  }

  throw new Error("Formato de exportación no soportado.");
};

export const exportFinancialReport = ({
  format = EXPORT_FORMATS.XLSX,
  profitRows,
  profitTotals,
  margenPromedio,
  filters,
  estadoLabel,
  printWindow = null,
  reportTitle,
  tableTitle,
  emptyMessage
}) => {
  if (format === EXPORT_FORMATS.XLSX) {
    exportFinancialReportToXlsx({ profitRows, profitTotals, margenPromedio, filters, estadoLabel });
    return;
  }

  if (format === EXPORT_FORMATS.PDF) {
    exportFinancialReportToPdf({
      profitRows,
      profitTotals,
      margenPromedio,
      filters,
      estadoLabel,
      printWindow,
      reportTitle,
      tableTitle,
      emptyMessage
    });
    return;
  }

  throw new Error("Formato de exportación no soportado.");
};

export const exportInventoryIntelligenceReport = ({
  format = EXPORT_FORMATS.XLSX,
  summary,
  inventoryAgeRows,
  profitableRows,
  lossRows,
  brandRows,
  estadoLabel,
  printWindow = null
}) => {
  if (format === EXPORT_FORMATS.XLSX) {
    exportInventoryIntelligenceToXlsx({ summary, inventoryAgeRows, profitableRows, lossRows, brandRows, estadoLabel });
    return;
  }

  if (format === EXPORT_FORMATS.PDF) {
    exportInventoryIntelligenceToPdf({ summary, inventoryAgeRows, profitableRows, lossRows, brandRows, estadoLabel, printWindow });
    return;
  }

  throw new Error("Formato de exportacion no soportado.");
};

export const exportCustomsEstimateReport = ({ format = EXPORT_FORMATS.PDF, estimate, printWindow = null }) => {
  if (format === EXPORT_FORMATS.PDF) {
    exportCustomsEstimateToPdf({ estimate, printWindow });
    return;
  }

  throw new Error("Formato de exportacion no soportado.");
};

export { EXPORT_FORMATS };

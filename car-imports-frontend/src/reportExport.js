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

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Reporte costos" sheetId="1" r:id="rId1"/>
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
    { name: "xl/workbook.xml", content: workbookXml },
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

const exportReportToPdf = () => {
  throw new Error("La exportación a PDF no está implementada todavía.");
};

export const exportCostReport = ({ format = EXPORT_FORMATS.XLSX, reportRows, estadoLabel }) => {
  if (format === EXPORT_FORMATS.XLSX) {
    exportReportToXlsx({ reportRows, estadoLabel });
    return;
  }

  if (format === EXPORT_FORMATS.PDF) {
    exportReportToPdf();
    return;
  }

  throw new Error("Formato de exportación no soportado.");
};

export { EXPORT_FORMATS };

console.log("🚀 [Limatco WMS] content.js inyectado.");

function extraerDatosNota() {
  const url = new URL(window.location.href);
  const textoPagina = document.body.innerText;

  if (!url.href.includes("Inf_NotaCarga.asp") && !textoPagina.includes("NOTA DE CARGA")) {
    return null;
  }

  let tipoDocumento = "DESCONOCIDO";
  let numeroDocumento = url.searchParams.get("xldNumero") || "";

  const matchDoc = textoPagina.match(/Documento Origen:\s*([A-Z\s]+)\s*(\d+)/i);
  if (matchDoc) {
    const tipoRaw = matchDoc[1].trim().toUpperCase();
    tipoDocumento = tipoRaw.includes("FACTURA") ? "FACTURA" : "BOLETA";
    numeroDocumento = matchDoc[2].trim();
  }

  let bodegaOrigen = "L-03";
  const matchSucursal = textoPagina.match(/Sucursal que Despacha:\s*([A-Z0-9\-]+)/i);
  if (matchSucursal) {
    bodegaOrigen = matchSucursal[1].trim().toUpperCase();
  }

  let destinoTexto = "";
  const matchObs = textoPagina.match(/Observacion No Impresa:(.*?)(?:Dirección Despacho|$)/is);
  if (matchObs) {
    destinoTexto = matchObs[1].trim().replace(/\s+/g, ' '); 
  }

  let codigoDestino = null;
  if (url.searchParams.has("xldSucursal")) {
    const sucursalId = url.searchParams.get("xldSucursal").padStart(2, '0');
    codigoDestino = `L-${sucursalId}`;
  }

  const lineas = [];
  const filas = document.querySelectorAll("table tr");
  
  filas.forEach(fila => {
    const columnas = fila.querySelectorAll("td");
    if (columnas.length >= 8 && columnas[0].innerText.trim().length > 0) {
      if (columnas[0].innerText.includes("Código")) return;
      const cantidadStr = columnas[8].innerText.replace(",", ".").trim();
      
      lineas.push({
        codigoMaterial: columnas[0].innerText.trim(),
        descripcion: columnas[1].innerText.trim(),
        bodegaMaterial: columnas[2].innerText.trim(),
        ubicacionFisica: columnas[6].innerText.trim(),
        unidad: columnas[7].innerText.trim(),
        cantidad: parseFloat(cantidadStr) || 0
      });
    }
  });

  return {
    erp_url: url.href,
    tipo_documento: tipoDocumento,
    numero_documento: numeroDocumento,
    bodega_origen: bodegaOrigen,
    sucursal_destino_codigo: codigoDestino,
    destino_texto: destinoTexto,
    lineas: lineas
  };
}

setTimeout(() => {
  const datos = extraerDatosNota();
  if (datos && datos.lineas.length > 0) {
    console.log("✅ [Limatco WMS] Nota capturada:", datos);
    chrome.runtime.sendMessage({ action: "NUEVA_CAPTURA", payload: datos });
  }
}, 1000);
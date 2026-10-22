console.log("🚀 [Limatco WMS] content.js inyectado.");

function extraerDatosNota() {
  const url = new URL(window.location.href);
  const textoPagina = document.body.innerText;

  if (!url.href.includes("Inf_NotaCarga.asp")) return null;

  // 1. Documento
  let tipoDocumento = "DESCONOCIDO";
  let numeroDocumento = url.searchParams.get("xldNumero") || "";
  const matchNotaVenta = textoPagina.match(/Nota Venta N[°º]\s*(\d+)/i);
  if (matchNotaVenta) {
    tipoDocumento = "NOTA_VENTA";
    numeroDocumento = matchNotaVenta[1].trim();
  } else {
    const matchDoc = textoPagina.match(/Documento Origen:\s*([A-Z\s]+)\s*(\d+)/i);
    if (matchDoc) {
      tipoDocumento = matchDoc[1].trim().toUpperCase().includes("FACTURA") ? "FACTURA" : "BOLETA";
      numeroDocumento = matchDoc[2].trim();
    }
  }

  // 2. Bodega Origen
  let bodegaOrigen = "L-03";
  const matchSucursal = textoPagina.match(/Sucursal que Despacha:\s*([A-Z0-9\-]+)/i);
  if (matchSucursal) bodegaOrigen = matchSucursal[1].trim().toUpperCase();

  // 3. Destino y Tipo de Despacho (01=Retiro, 02=Valija, 03=Flete)
  let tipoDespacho = "DESCONOCIDO";
  let codigoDestino = null;
  let destinoTexto = "";

  const matchDirDespacho = textoPagina.match(/Dirección Despacho:(.*?)(?:\n|$)/i);
  if (matchDirDespacho) {
    // Limpiamos espacios extra y mayúsculas para evaluar
    const lineaDespacho = matchDirDespacho[1].trim().replace(/\s+/g, ' ');
    destinoTexto = lineaDespacho;
    const lineaUpper = lineaDespacho.toUpperCase();

    if (lineaUpper.startsWith("01")) {
      tipoDespacho = "RETIRO_TIENDA"; 
      codigoDestino = "RETIRO";
    } else if (lineaUpper.startsWith("02")) {
      tipoDespacho = "VALIJA";
      // Busca L8, L08, L-8, etc., y lo formatea a L-08
      const matchL = lineaUpper.match(/L\s*[-]?\s*(\d{1,2})/i);
      if (matchL) codigoDestino = `L-${matchL[1].padStart(2, '0')}`;
    } else if (lineaUpper.startsWith("03")) {
      tipoDespacho = "FLETE"; 
      codigoDestino = "CLIENTE";
    }
  }

  // 4. Tabla de Productos (Mapeo Fijo basado en la estructura real)
  const lineas = [];
  const tablas = document.querySelectorAll("table");
  let tablaProductos = null;

  tablas.forEach(tabla => {
    if (tabla.innerText.includes("Ubicación en Bodega") && tabla.innerText.includes("Código")) {
      tablaProductos = tabla;
    }
  });

  if (tablaProductos) {
    const filas = tablaProductos.querySelectorAll("tr");
    
    filas.forEach(fila => {
      const celdas = fila.querySelectorAll("td");
      if (celdas.length >= 10) { // Aseguramos que tenga las 12 columnas que vimos
        
        const codMaterial = celdas[0]?.innerText.trim();
        // Validar que empiece con código de material (letras/números)
        if (codMaterial && codMaterial.length > 2 && !codMaterial.includes("Código")) {
          
          let cantidadStr = celdas[8]?.innerText.replace(",", ".").trim(); // Col 8: Cant a Cargar
          // Si col 8 está vacía, tomamos la col 7 (Cantidad normal)
          if (!cantidadStr || cantidadStr === "") {
              cantidadStr = celdas[7]?.innerText.replace(",", ".").trim();
          }

          lineas.push({
            codigoMaterial: codMaterial,
            descripcion: celdas[1]?.innerText.trim() || "",
            ubicacionFisica: celdas[5]?.innerText.trim() || "SIN_UBICACION",
            unidad: celdas[6]?.innerText.trim() || "UN",
            cantidad: parseFloat(cantidadStr) || 0
          });
        }
      }
    });
  }

  return {
    erp_url: url.href,
    tipo_documento: tipoDocumento,
    numero_documento: numeroDocumento,
    tipo_despacho: tipoDespacho,
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
}, 2000);
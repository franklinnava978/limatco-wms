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

  // 3. Destino (01=Retiro, 02=Valija, 03=Flete)
  let tipoDespacho = "DESCONOCIDO";
  let codigoDestino = null;
  let destinoTexto = "";

  const matchDirDespacho = textoPagina.match(/Dirección Despacho:(.*?)(?:\n|$)/i);
  if (matchDirDespacho) {
    const lineaDespacho = matchDirDespacho[1].trim();
    destinoTexto = lineaDespacho;
    if (lineaDespacho.startsWith("01")) {
      tipoDespacho = "RETIRO_TIENDA"; codigoDestino = "RETIRO";
    } else if (lineaDespacho.startsWith("02")) {
      tipoDespacho = "VALIJA";
      const matchL = lineaDespacho.match(/L\s*[-]?\s*(\d{2})/i);
      if (matchL) codigoDestino = `L-${matchL[1]}`;
    } else if (lineaDespacho.startsWith("03")) {
      tipoDespacho = "FLETE"; codigoDestino = "CLIENTE";
    }
  }

  // 4. Tabla de Productos (Mapeo Exacto por Cabecera)
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
    let idxCod = 0, idxDesc = 1, idxUbic = 5, idxUni = 6, idxCant = 7; // Valores por defecto según tu ERP

    filas.forEach(fila => {
      const celdas = fila.querySelectorAll("td");
      if (celdas.length < 5) return;

      // Si es cabecera, mapeamos exactamente los índices
      if (fila.innerText.includes("Código") && fila.innerText.includes("Descripción")) {
        celdas.forEach((celda, i) => {
          const txt = celda.innerText.trim().toUpperCase();
          if (txt === "CÓDIGO") idxCod = i;
          if (txt === "DESCRIPCIÓN") idxDesc = i;
          if (txt.includes("UBICACIÓN")) idxUbic = i;
          if (txt === "UNIDAD") idxUni = i;
          if (txt === "CANTIDAD") idxCant = i; 
        });
        return;
      }

      const codMaterial = celdas[idxCod]?.innerText.trim();
      if (codMaterial && !isNaN(parseFloat(codMaterial.replace(/\D/g, '')))) {
        
        // --- DEBUG: Esto imprimirá en consola cómo viene la fila real ---
        console.log("Fila detectada:", Array.from(celdas).map(c => c.innerText.trim()));

        let ubicacion = celdas[idxUbic]?.innerText.trim() || "SIN_UBICACION";
        let unidad = celdas[idxUni]?.innerText.trim() || "UN";
        let cantidadStr = celdas[idxCant]?.innerText.replace(",", ".").trim() || "0";
        let cantidad = parseFloat(cantidadStr);

        // Si la cantidad sale 0 o es igual al código, buscamos en la celda de "Cantidad a cargar"
        if (isNaN(cantidad) || cantidad === 0) {
            const cantCargarStr = celdas[idxCant + 1]?.innerText.replace(",", ".").trim();
            if (cantCargarStr && !isNaN(parseFloat(cantCargarStr))) {
                cantidad = parseFloat(cantCargarStr);
            }
        }

        lineas.push({
          codigoMaterial: codMaterial,
          descripcion: celdas[idxDesc]?.innerText.trim() || "",
          ubicacionFisica: ubicacion,
          unidad: unidad,
          cantidad: cantidad
        });
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
console.log("🚀 [Limatco WMS] content.js inyectado.");

function extraerDatosNota() {
  const url = new URL(window.location.href);
  const textoPagina = document.body.innerText;

  // ==========================================
  // FLUJO 1: ORDEN DE COMPRA (INBOUND / RECEPCIÓN)
  // ==========================================
  if (url.href.includes("VisorRS.aspx") || url.href.includes("OrdenCompra") || textoPagina.includes("Orden Compra")) {
    
    let numeroDocumento = "DESCONOCIDO";
    const matchOC = textoPagina.match(/Orden Compra\s*(\d+)/i);
    if (matchOC) numeroDocumento = matchOC[1].trim();

    let proveedor = "PROVEEDOR_NO_DETECTADO";
    const matchProv = textoPagina.match(/(?:Señor\(es\):|Razón Social:)\s*([^\n]+)/i);
    if (matchProv) proveedor = matchProv[1].trim();

    let destinoTexto = "BODEGA_PRINCIPAL";
    const matchDestino = textoPagina.match(/Condición de Entrega\s*\n?\s*([^\n]+)/i);
    if (matchDestino) destinoTexto = matchDestino[1].trim();

    const lineas = [];
    
    // Buscamos TODAS las tablas y recorremos sus filas
    document.querySelectorAll("table tr").forEach(fila => {
      const celdas = fila.querySelectorAll("td");
      
      // En el formato HTML que vimos, la fila del producto tiene 9 o más columnas
      // Buscamos la que tenga un Código en la columna 0 y un número en la columna 4 (Cant)
      if (celdas.length >= 6) {
        const codMat = celdas[0]?.innerText.trim();
        let cantStr = celdas[4]?.innerText.replace(",", ".").trim();

        // Validar que no sea la cabecera ("Código") y que la cantidad sea un número válido
        if (codMat && codMat.toUpperCase() !== "CÓDIGO" && !isNaN(parseFloat(cantStr))) {
          // Evitar capturar filas de totales (ej. "Valor Neto")
          if (codMat.toUpperCase().includes("VALOR") || codMat.toUpperCase().includes("TOTAL")) return;

          lineas.push({
            cantidad: parseFloat(cantStr),
            codigoMaterial: codMat,
            descripcion: celdas[1]?.innerText.trim() || "",
            ubicacionFisica: "MUELLE_RECEPCION",
            unidad: "UN"
          });
        }
      }
    });

    // Si después de buscar en las tablas no hay nada, probamos con el formato PDF viejo
    if (lineas.length === 0) {
      const regexLinea = /(\d+)\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+([^\n$]+)/gi;
      let match;
      while ((match = regexLinea.exec(textoPagina)) !== null) {
        const descripcion = match[4].trim();
        if (descripcion.includes("Precio") || descripcion.includes("Total") || descripcion.includes("Descuento")) continue;
        lineas.push({
          cantidad: parseFloat(match[1]),
          codigoProveedor: match[2].trim(),
          codigoMaterial: match[3].trim(),
          descripcion: descripcion,
          ubicacionFisica: "MUELLE_RECEPCION",
          unidad: "UN"
        });
      }
    }

    return {
      erp_url: url.href,
      tipo_flujo: "INBOUND",
      tipo_documento: "ORDEN_COMPRA",
      numero_documento: numeroDocumento,
      bodega_origen: proveedor,
      sucursal_destino_codigo: destinoTexto,
      destino_texto: proveedor,
      lineas: lineas
    };
  }

    // ==========================================
  // FLUJO 2: NOTA DE CARGA (OUTBOUND)
  // ==========================================
  if (url.href.includes("Inf_NotaCarga.asp")) {
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

    let bodegaOrigen = "L-03";
    const matchSucursal = textoPagina.match(/Sucursal que Despacha:\s*([A-Z0-9\-]+)/i);
    if (matchSucursal) bodegaOrigen = matchSucursal[1].trim().toUpperCase();

    let tipoDespacho = "DESCONOCIDO";
    let codigoDestino = null;
    let destinoTexto = "";

    const matchDirDespacho = textoPagina.match(/Dirección Despacho:(.*?)(?:\n|$)/i);
    if (matchDirDespacho) {
      const lineaDespacho = matchDirDespacho[1].trim().replace(/\s+/g, ' ');
      destinoTexto = lineaDespacho;
      const lineaUpper = lineaDespacho.toUpperCase();

      if (lineaUpper.startsWith("01")) {
        tipoDespacho = "RETIRO_TIENDA"; codigoDestino = "RETIRO";
      } else if (lineaUpper.startsWith("02")) {
        tipoDespacho = "VALIJA";
        const matchL = lineaUpper.match(/L\s*[-]?\s*(\d{1,2})/i);
        if (matchL) codigoDestino = `L-${matchL[1].padStart(2, '0')}`;
      } else if (lineaUpper.startsWith("03")) {
        tipoDespacho = "FLETE"; codigoDestino = "CLIENTE";
      }
    }

    const lineas = [];
    const tablas = document.querySelectorAll("table");
    let tablaProductos = null;

    tablas.forEach(tabla => {
      if (tabla.innerText.includes("Ubicación en Bodega") && tabla.innerText.includes("Código")) {
        tablaProductos = tabla;
      }
    });

    if (tablaProductos) {
      tablaProductos.querySelectorAll("tr").forEach(fila => {
        const celdas = fila.querySelectorAll("td");
        if (celdas.length >= 10) {
          const codMaterial = celdas[0]?.innerText.trim();
          if (codMaterial && codMaterial.length > 2 && !codMaterial.includes("Código")) {
            let cantidadStr = celdas[8]?.innerText.replace(",", ".").trim();
            if (!cantidadStr || cantidadStr === "") cantidadStr = celdas[7]?.innerText.replace(",", ".").trim();
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
      tipo_flujo: "OUTBOUND",
      tipo_documento: tipoDocumento,
      numero_documento: numeroDocumento,
      tipo_despacho: tipoDespacho,
      bodega_origen: bodegaOrigen,
      sucursal_destino_codigo: codigoDestino,
      destino_texto: destinoTexto,
      lineas: lineas
    };
  }

  return null;
}

setTimeout(() => {
  const datos = extraerDatosNota();
  if (datos && datos.lineas.length > 0) {
    console.log("✅ [Limatco WMS] Documento capturado:", datos);
    chrome.runtime.sendMessage({ action: "NUEVA_CAPTURA", payload: datos });
  } else if (datos) {
    console.warn("⚠️ [Limatco WMS] Documento detectado pero sin líneas válidas.");
  }
}, 2500);
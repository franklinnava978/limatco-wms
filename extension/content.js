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
    let tablaProductos = null;
    
    // Buscamos CUALQUIER tabla que contenga la palabra "Código"
    document.querySelectorAll("table").forEach(tabla => {
      if (tabla.innerText.includes("Código") || tabla.innerText.includes("CÓDIGO")) {
        tablaProductos = tabla;
      }
    });

    if (tablaProductos) {
      const filas = tablaProductos.querySelectorAll("tr");
      let idxCod = 0, idxDesc = 1, idxCant = 4; // Valores por defecto para el formato HTML

      filas.forEach(fila => {
        const celdas = fila.querySelectorAll("td");
        
        // Si es la fila de cabecera, mapeamos los índices exactos
        if (fila.innerText.includes("Código") && fila.innerText.includes("Descripción")) {
          celdas.forEach((celda, i) => {
            const txt = celda.innerText.toUpperCase().trim();
            if (txt.includes("CÓDIGO")) idxCod = i;
            if (txt.includes("DESCRIPCIÓN")) idxDesc = i;
            if (txt === "CANT" || txt.includes("CANTIDAD")) idxCant = i;
          });
          return; // Saltamos la cabecera
        }

        // Si es una fila de producto
        if (celdas.length >= 5) {
          const codMat = celdas[idxCod]?.innerText.trim();
          let cantStr = celdas[idxCant]?.innerText.replace(",", ".").trim();
          
          // Validar que no sea la cabecera y que la cantidad sea un número
          if (codMat && codMat !== "Código" && !isNaN(parseFloat(cantStr))) {
            lineas.push({
              cantidad: parseFloat(cantStr),
              codigoMaterial: codMat,
              descripcion: celdas[idxDesc]?.innerText.trim() || "",
              ubicacionFisica: "MUELLE_RECEPCION",
              unidad: "UN"
            });
          }
        }
      });
    }

    // --- DEBUG DE EMERGENCIA ---
    if (lineas.length === 0) {
      console.log("🔎 DEBUG: Filas crudas encontradas en la tabla:", tablaProductos ? tablaProductos.innerText : "No se encontró tabla");
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
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- CONEXIÓN A GOOGLE SHEETS ---
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credenciales.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === "admin@limatco.cl" && password === "Limatco.2026") {
        const token = jwt.sign({ user: email, role: 'operario' }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.json({ token, user: "Administrador Limatco" });
    }
    res.status(401).json({ error: "Credenciales incorrectas" });
});

/// --- CAPTURA (EXTENSIÓN) ---
app.post('/api/capturas', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(403).json({ error: "No autorizado" });

    try {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET);

        const data = req.body;
        const fechaActual = new Date().toISOString();

        // 🛑 CANDADO DE SEGURIDAD: Evitar OCs duplicadas
        if (data.tipo_documento === 'ORDEN_COMPRA') {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID, range: 'A2:K1000',
            });
            const rows = response.data.values || [];
            
            // Buscamos si ya hay una OC con ese mismo número que NO esté completada
            const ocExistente = rows.find(row => 
                row[3] === data.numero_documento && 
                (row[8] === 'PENDIENTE' || row[8] === 'PARCIAL')
            );

            if (ocExistente) {
                console.log(`⚠️ [WMS] La OC ${data.numero_documento} ya está en el sistema. Captura ignorada.`);
                return res.json({ status: "OK", mensaje: "OC ya existente", id: ocExistente[0] });
            }
        }

        // Si no existe, la guardamos normalmente
        const fila = [
            Date.now(), fechaActual, data.tipo_documento, data.numero_documento,
            data.bodega_origen, data.sucursal_destino_codigo || "Desconocido",
            JSON.stringify(data), data.erp_url, "PENDIENTE", data.tipo_flujo || "OUTBOUND", ""
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: 'A1', valueInputOption: 'USER_ENTERED',
            requestBody: { values: [fila] },
        });

        res.json({ status: "OK", mensaje: "Guardado", id: fila[0] });
    } catch (error) {
        console.error("❌ Error captura:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- OBTENER CAPTURAS ---
app.get('/api/capturas', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'A2:K1000',
        });
        res.json(response.data.values || []);
    } catch (error) {
        res.status(500).json({ error: "Error leyendo" });
    }
});

// --- OBTENER UNA CAPTURA POR ID ---
app.get('/api/capturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'A2:K1000',
        });
        const rows = response.data.values || [];
        const row = rows.find(r => String(r[0]) === String(id));
        
        if (!row) return res.status(404).json({ error: "No encontrada" });
        
        res.json({ id: row[0], estado: row[8] || 'PENDIENTE', data: JSON.parse(row[6]) });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

// --- CONFIRMAR PICKING (DESPACHO) ---
app.put('/api/capturas/:id/confirmar', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'A2:A1000',
        });
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => String(row[0]) === String(id));
        
        if (rowIndex === -1) return res.status(404).json({ error: "No encontrada" });

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID, range: `I${rowIndex + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [["COMPLETADO"]] },
        });

        res.json({ status: "OK" });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

// --- REGISTRAR RECEPCIÓN (MUELLE) ---
app.post('/api/recepciones', async (req, res) => {
    try {
        const { oc_id, oc_numero, proveedor, items, esCompleta } = req.body;
        const fechaActual = new Date().toISOString();
        const recId = Date.now();

        // 🛑 CANDADO DE SEGURIDAD: Verificar estado actual de la OC
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'A2:K1000',
        });
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => String(row[0]) === String(oc_id));

        if (rowIndex === -1) {
            return res.status(404).json({ error: "OC no encontrada" });
        }

        const estadoActual = rows[rowIndex][8] || 'PENDIENTE';
        if (estadoActual === 'COMPLETADO') {
            return res.status(400).json({ error: "Esta Orden de Compra ya fue recibida en su totalidad." });
        }

        // Si no hay items recibidos, no hacemos nada
        if (!items || items.length === 0) {
            return res.status(400).json({ error: "No se ingresaron cantidades a recibir." });
        }

        // 1. Guardamos el evento de Recepción
        const jsonRecepcion = {
            tipo_flujo: "INBOUND",
            tipo_documento: "RECEPCION",
            numero_documento: oc_numero,
            bodega_origen: proveedor,
            lineas: items
        };

        const filaRecepcion = [
            recId, fechaActual, "RECEPCION", oc_numero, proveedor, "MUELLE",
            JSON.stringify(jsonRecepcion), "", "COMPLETADO", "INBOUND", oc_id
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: 'A1', valueInputOption: 'USER_ENTERED',
            requestBody: { values: [filaRecepcion] },
        });

        // 2. Actualizamos estado de la OC original
        const nuevoEstado = esCompleta ? "COMPLETADO" : "PARCIAL";
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID, range: `I${rowIndex + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[nuevoEstado]] },
        });

        res.json({ status: "OK" });
    } catch (error) {
        console.error("❌ Error recepción:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- REGISTRAR DESPACHO (SALIDA PARCIAL O TOTAL) ---
app.post('/api/despachos', async (req, res) => {
    try {
        const { nota_id, nota_numero, origen, destino, items, esCompleta } = req.body;

        // 1. Verificar que la nota no esté ya completada
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'A2:K1000',
        });
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => String(row[0]) === String(nota_id));

        if (rowIndex === -1) return res.status(404).json({ error: "Nota no encontrada" });
        if (rows[rowIndex][8] === 'COMPLETADO') return res.status(400).json({ error: "Esta nota ya fue despachada en su totalidad." });

        // 2. Guardamos el evento de Despacho
        const fechaActual = new Date().toISOString();
        const jsonDespacho = {
            tipo_flujo: "OUTBOUND",
            tipo_documento: "DESPACHO",
            numero_documento: nota_numero,
            bodega_origen: origen,
            sucursal_destino_codigo: destino,
            lineas: items
        };

        const fila = [
            Date.now(), fechaActual, "DESPACHO", nota_numero, origen, destino,
            JSON.stringify(jsonDespacho), "", "COMPLETADO", "OUTBOUND", nota_id
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: 'A1', valueInputOption: 'USER_ENTERED',
            requestBody: { values: [fila] },
        });

        // 3. Actualizamos estado de la Nota original
        const nuevoEstado = esCompleta ? "COMPLETADO" : "PARCIAL";
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID, range: `I${rowIndex + 2}`,
            valueInputOption: 'USER_ENTERED', requestBody: { values: [[nuevoEstado]] },
        });

        res.json({ status: "OK" });
    } catch (error) {
        console.error("❌ Error despacho:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- KARDEX (INVENTARIO MATEMÁTICO) ---
app.get('/api/inventario', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, range: 'A2:K1000',
        });
        const rows = response.data.values || [];
        const kardex = {};

        rows.forEach(row => {
            const estado = row[8]; 
            const esRecepcion = row[2] === 'RECEPCION';
            const tipoFlujo = row[9] || 'OUTBOUND';
            
            // Solo procesamos si está COMPLETADO
            if (estado !== 'COMPLETADO') return;

            try {
                const data = JSON.parse(row[6]);
                if (!data.lineas) return;

                data.lineas.forEach(linea => {
                    const cod = linea.codigoMaterial;
                    if (!kardex[cod]) {
                        kardex[cod] = { codigo: cod, descripcion: linea.descripcion, stock: 0 };
                    }
                    
                    if (esRecepcion || tipoFlujo === 'INBOUND') {
                        kardex[cod].stock += linea.cantidad;
                    } else {
                        kardex[cod].stock -= linea.cantidad;
                    }
                });
            } catch (e) { }
        });

        res.json(Object.values(kardex));
    } catch (error) {
        res.status(500).json({ error: "Error calculando Kardex" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`☁️ Backend Limatco corriendo en puerto ${PORT}`));
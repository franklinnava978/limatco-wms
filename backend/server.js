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

// --- ENDPOINT DE LOGIN ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    // Credenciales temporales para pruebas
    if (email === "admin@limatco.cl" && password === "Limatco.2026") {
        const token = jwt.sign({ user: email, role: 'operario' }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.json({ token, user: "Administrador Limatco" });
    }
    res.status(401).json({ error: "Credenciales incorrectas" });
});

// --- ENDPOINT DE CAPTURA (RECIBE DATOS DE LA EXTENSIÓN) ---
app.post('/api/capturas', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(403).json({ error: "No autorizado" });

    try {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET);

        const data = req.body;
        const fechaActual = new Date().toISOString();

            const fila = [
            Date.now(),
            fechaActual,
            data.tipo_documento,
            data.numero_documento,
            data.bodega_origen,
            data.sucursal_destino_codigo || "Desconocido",
            JSON.stringify(data), 
            data.erp_url,
            "PENDIENTE",
            data.tipo_flujo || "OUTBOUND" // <-- NUEVO: INBOUND para OC, OUTBOUND para Notas
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [fila] },
        });

        console.log(`✅ [Sheets] Nota ${data.numero_documento} guardada en Google Sheets.`);
        res.json({ status: "OK", mensaje: "Guardado", id: fila[0] });

    } catch (error) {
        console.error("❌ Error guardando en Sheets:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- ENDPOINT PARA LEER LAS CAPTURAS (Faltaba esto) ---
app.get('/api/capturas', async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A2:H100', // Lee desde la fila 2 hasta la 100
        });
        
        // Si la hoja está vacía, response.data.values será undefined
        const filas = response.data.values || [];
        res.json(filas);
    } catch (error) {
        console.error("❌ Error leyendo de Sheets:", error.message);
        res.status(500).json({ error: "Error leyendo la base de datos" });
    }
});

// --- ENDPOINT PARA OBTENER UNA NOTA POR ID ---
app.get('/api/capturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A2:I1000', // Leemos hasta la columna I (Estado)
        });
        
        const rows = response.data.values || [];
        const row = rows.find(r => String(r[0]) === String(id));
        
        if (!row) return res.status(404).json({ error: "Nota no encontrada" });
        
        // Retornamos el JSON parseado y el estado actual
        const notaData = JSON.parse(row[6]); 
        res.json({ id: row[0], estado: row[8] || 'PENDIENTE', data: notaData });
    } catch (error) {
        console.error("❌ Error obteniendo nota:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- ENDPOINT PARA CONFIRMAR PICKING ---
app.put('/api/capturas/:id/confirmar', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Leer la hoja para encontrar en qué fila está ese ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'A2:A1000',
        });
        
        const rows = response.data.values || [];
        const rowIndex = rows.findIndex(row => String(row[0]) === String(id));
        
        if (rowIndex === -1) {
            return res.status(404).json({ error: "Nota no encontrada" });
        }

        // rowIndex es 0-based, pero en Google Sheets las filas empiezan en 1. 
        // Además, empezamos a leer desde la fila 2, así que sumamos +2.
        const sheetRow = rowIndex + 2;

        // 2. Actualizar la columna I (Estado) de esa fila
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `I${sheetRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [["COMPLETADO"]] },
        });

        console.log(`✅ [Sheets] Nota ID ${id} marcada como COMPLETADA.`);
        res.json({ status: "OK", mensaje: "Picking confirmado" });

    } catch (error) {
        console.error("❌ Error confirmando picking:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`☁️ Backend Limatco corriendo en http://localhost:${PORT}`));
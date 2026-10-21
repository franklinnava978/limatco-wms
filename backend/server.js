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
            JSON.stringify(data), // El JSON completo
            data.erp_url
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`☁️ Backend Limatco corriendo en http://localhost:${PORT}`));
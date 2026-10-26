require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg'); // <-- Usamos pg en lugar de googleapis

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Conexión a Azure PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === "admin@limatco.cl" && password === "Limatco.2026") {
        const token = jwt.sign({ user: email, role: 'operario' }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.json({ token, user: "Administrador Limatco" });
    }
    res.status(401).json({ error: "Credenciales incorrectas" });
});

// --- CAPTURA (EXTENSIÓN) ---
app.post('/api/capturas', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(403).json({ error: "No autorizado" });

    try {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET);

        const data = req.body;

        // 🛑 CANDADO ANTI-DUPLICADOS (SQL)
        if (data.tipo_documento === 'ORDEN_COMPRA') {
            const result = await pool.query(
                'SELECT id FROM documentos WHERE numero_documento = $1 AND tipo_documento = $2 AND estado IN ($3, $4)',
                [data.numero_documento, 'ORDEN_COMPRA', 'PENDIENTE', 'PARCIAL']
            );
            if (result.rows.length > 0) {
                console.log(`⚠️ [WMS] La OC ${data.numero_documento} ya existe. Captura ignorada.`);
                return res.json({ status: "OK", mensaje: "OC ya existente", id: result.rows[0].id });
            }
        }

        const query = `
            INSERT INTO documentos 
            (tipo_documento, numero_documento, bodega_origen, sucursal_destino, json_completo, erp_url, estado, tipo_flujo)
            VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE', $7) RETURNING id
        `;
        const values = [
            data.tipo_documento, data.numero_documento, data.bodega_origen,
            data.sucursal_destino_codigo || "Desconocido", JSON.stringify(data),
            data.erp_url, data.tipo_flujo || "OUTBOUND"
        ];
        
        const result = await pool.query(query, values);
        res.json({ status: "OK", mensaje: "Guardado", id: result.rows[0].id });
    } catch (error) {
        console.error("❌ Error captura:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- OBTENER CAPTURAS ---
app.get('/api/capturas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM documentos ORDER BY fecha DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Error leyendo" });
    }
});

// --- OBTENER UNA CAPTURA POR ID ---
app.get('/api/capturas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM documentos WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "No encontrada" });
        res.json({ id: result.rows[0].id, estado: result.rows[0].estado, data: result.rows[0].json_completo });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

// --- CONFIRMAR PICKING (DESPACHO) ---
app.put('/api/capturas/:id/confirmar', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE documentos SET estado = $1 WHERE id = $2', ['COMPLETADO', id]);
        res.json({ status: "OK" });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

// --- REGISTRAR RECEPCIÓN (MUELLE) ---
app.post('/api/recepciones', async (req, res) => {
    try {
        const { oc_id, oc_numero, proveedor, items, esCompleta } = req.body;

        const ocCheck = await pool.query('SELECT estado FROM documentos WHERE id = $1', [oc_id]);
        if (ocCheck.rows[0]?.estado === 'COMPLETADO') {
            return res.status(400).json({ error: "Esta OC ya fue recibida en su totalidad." });
        }

        const jsonRecepcion = {
            tipo_flujo: "INBOUND", tipo_documento: "RECEPCION",
            numero_documento: oc_numero, bodega_origen: proveedor, lineas: items
        };
        
        await pool.query(
            `INSERT INTO documentos (tipo_documento, numero_documento, bodega_origen, sucursal_destino, json_completo, estado, tipo_flujo, referencia_oc_id)
             VALUES ($1, $2, $3, $4, $5, 'COMPLETADO', 'INBOUND', $6)`,
            ['RECEPCION', oc_numero, proveedor, 'MUELLE', JSON.stringify(jsonRecepcion), oc_id]
        );

        const nuevoEstado = esCompleta ? "COMPLETADO" : "PARCIAL";
        await pool.query('UPDATE documentos SET estado = $1 WHERE id = $2', [nuevoEstado, oc_id]);

        res.json({ status: "OK" });
    } catch (error) {
        console.error("❌ Error recepción:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- KARDEX (INVENTARIO MATEMÁTICO) ---
app.get('/api/inventario', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM documentos WHERE estado = 'COMPLETADO'");
        const kardex = {};

        result.rows.forEach(row => {
            const data = row.json_completo; // pg ya lo devuelve como JSON parseado
            if (!data || !data.lineas) return;

            data.lineas.forEach(linea => {
                const cod = linea.codigoMaterial;
                if (!kardex[cod]) {
                    kardex[cod] = { codigo: cod, descripcion: linea.descripcion, stock: 0 };
                }
                if (row.tipo_flujo === 'INBOUND' || row.tipo_documento === 'RECEPCION') {
                    kardex[cod].stock += linea.cantidad;
                } else {
                    kardex[cod].stock -= linea.cantidad;
                }
            });
        });

        res.json(Object.values(kardex));
    } catch (error) {
        res.status(500).json({ error: "Error calculando Kardex" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`☁️ Backend Limatco (Azure PostgreSQL) en puerto ${PORT}`));
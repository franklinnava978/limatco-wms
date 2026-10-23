require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg'); // <-- Driver de PostgreSQL

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Conexión a Neon (SSL obligatorio en la nube)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Necesario para Neon / Azure
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

        // 🛑 CANDADO ANTI-DUPLICADOS (ahora en SQL)
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

        // 1. Verificar que la OC no esté ya completada
        const ocCheck = await pool.query('SELECT estado FROM documentos WHERE id = $1', [oc_id]);
        if (ocCheck.rows[0]?.estado === 'COMPLETADO') {
            return res.status(400).json({ error: "Esta OC ya fue recibida en su totalidad." });
        }

        // 2. Insertar el evento de Recepción (Inbound)
        const jsonRecepcion = {
            tipo_flujo: "INBOUND", tipo_documento: "RECEPCION",
            numero_documento: oc_numero, bodega_origen: proveedor, lineas: items
        };
        await pool.query(
            `INSERT INTO documentos (tipo_documento, numero_documento, bodega_origen, sucursal_destino, json_completo, estado, tipo_flujo, referencia_oc_id)
             VALUES ($1, $2, $3, $4, $5, 'COMPLETADO', 'INBOUND', $6)`,
            ['RECEPCION', oc_numero, proveedor, 'MUELLE', JSON.stringify(jsonRecepcion), oc_id]
        );

        // 3. Actualizar estado de la OC original
        const nuevoEstado = esCompleta ? "COMPLETADO" : "PARCIAL";
        await pool.query('UPDATE documentos SET estado = $1 WHERE id = $2', [nuevoEstado, oc_id]);

        res.json({ status: "OK" });
    } catch (error) {
        console.error("❌ Error recepción:", error.message);
        res.status(500).json({ error: "Error interno" });
    }
});

// --- KARDEX (INVENTARIO MATEMÁTICO POR BODEGA) ---
app.get('/api/inventario', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM documentos WHERE estado = 'COMPLETADO'");
        const kardex = {};

        result.rows.forEach(row => {
            const data = JSON.parse(row.json_completo);
            if (!data.lineas) return;

            const esRecepcion = row.tipo_flujo === 'INBOUND' || row.tipo_documento === 'RECEPCION';
            const esDespacho = row.tipo_documento === 'DESPACHO';
            
            // Ignoramos Notas de Venta originales para no restar doble
            if (!esRecepcion && !esDespacho) return;

            // Normalizamos la bodega
            const bodegaRaw = esRecepcion ? String(row.sucursal_destino).toUpperCase() : String(row.bodega_origen).toUpperCase();
            let bodega = 'OTRA';
            if (bodegaRaw.includes('VESPUCIO') || bodegaRaw.includes('L-03') || bodegaRaw === 'L03') bodega = 'L-03';
            else if (bodegaRaw.includes('BLA') || bodegaRaw.includes('L-01') || bodegaRaw === 'L01') bodega = 'L-01';

            data.lineas.forEach(linea => {
                const cod = linea.codigoMaterial;
                if (!kardex[cod]) {
                    kardex[cod] = { codigo: cod, descripcion: linea.descripcion, stockL01: 0, stockL03: 0, stockOtra: 0, total: 0 };
                }
                
                const cantidad = linea.cantidad;
                if (esRecepcion) {
                    if (bodega === 'L-01') kardex[cod].stockL01 += cantidad;
                    else if (bodega === 'L-03') kardex[cod].stockL03 += cantidad;
                    else kardex[cod].stockOtra += cantidad;
                } else if (esDespacho) {
                    if (bodega === 'L-01') kardex[cod].stockL01 -= cantidad;
                    else if (bodega === 'L-03') kardex[cod].stockL03 -= cantidad;
                    else kardex[cod].stockOtra -= cantidad;
                }
            });
        });

        // Calculamos el total consolidado
        Object.values(kardex).forEach(item => {
            item.total = item.stockL01 + item.stockL03 + item.stockOtra;
        });

        res.json(Object.values(kardex));
    } catch (error) {
        console.error("❌ Error calculando Kardex:", error.message);
        res.status(500).json({ error: "Error calculando Kardex" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`☁️ Backend Limatco (PostgreSQL) en puerto ${PORT}`));
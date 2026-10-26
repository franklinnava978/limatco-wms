CREATE TABLE documentos (
    id BIGSERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    tipo_documento VARCHAR(50) NOT NULL,
    numero_documento VARCHAR(100) NOT NULL,
    bodega_origen VARCHAR(100),
    sucursal_destino VARCHAR(100),
    json_completo JSONB NOT NULL,
    erp_url TEXT,
    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    tipo_flujo VARCHAR(20) DEFAULT 'OUTBOUND',
    referencia_oc_id BIGINT REFERENCES documentos(id)
);
-- 1. Maestro de Bodegas y Sucursales (Limatco)
CREATE TABLE locations (
  location_code VARCHAR(10) PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('BODEGA', 'SUCURSAL'))
);

INSERT INTO locations (location_code, nombre, tipo) VALUES
('L-01', 'Bodega BLA', 'BODEGA'),
('L-02', 'Sucursal 2', 'SUCURSAL'),
('L-03', 'Bodega Principal Vespucio', 'BODEGA'),
('L-04', 'Sucursal 4', 'SUCURSAL');
-- (Se agregarán L-05 a L-25 en el script final)

-- 2. Document Vault (Registro inmutable del documento capturado)
CREATE TABLE document_vault (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_doc_type VARCHAR(30) NOT NULL,       -- 'FACTURA', 'BOLETA'
  erp_doc_id VARCHAR(100) NOT NULL,        -- '505383'
  source_location VARCHAR(10) REFERENCES locations(location_code), -- 'L-03'
  destination_location VARCHAR(10) REFERENCES locations(location_code), -- 'L-16'
  raw_destination_text TEXT,               -- "DESPACHO CLIENTE PREBISTERO FELIX..."
  content_sha256 CHAR(64) UNIQUE NOT NULL, -- Para evitar duplicados
  storage_path TEXT NOT NULL,              -- Ruta en Azure Blob Storage
  captured_at TIMESTAMPTZ NOT NULL
);

-- 3. Órdenes de Despacho
CREATE TABLE dispatch_orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES document_vault(document_id),
  source_location VARCHAR(10) REFERENCES locations(location_code),
  destination_location VARCHAR(10) REFERENCES locations(location_code),
  status VARCHAR(30) DEFAULT 'PENDIENTE'
);

-- 4. Líneas de Despacho (Lo que el operario debe pickear)
CREATE TABLE dispatch_order_lines (
  line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES dispatch_orders(order_id),
  material_code VARCHAR(50) NOT NULL,
  description TEXT,
  expected_qty NUMERIC(10,2) NOT NULL,
  erp_location VARCHAR(50),                -- 'SAD14U02NB' (lo que dice Justtime)
  status VARCHAR(30) DEFAULT 'PENDIENTE'
);
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Outlet, NavLink } from 'react-router-dom';

const API_URL = 'http://localhost:3000/api';

// --- VISTA DE LOGIN ---
function Login() {
  const [email, setEmail] = useState('admin@limatco.cl');
  const [password, setPassword] = useState('Limatco.2026');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('wms_token', data.token);
        navigate('/app/despachos');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error conectando al servidor.');
    }
  };

  return (
    <div className="login-box">
      <h2 style={{marginBottom: '20px', textAlign: 'center', color: '#005A9E'}}>Limatco WMS</h2>
      {error && <p style={{color: 'red', marginBottom: '10px', fontSize: '14px'}}>{error}</p>}
      <form onSubmit={handleLogin}>
        <div className="input-group">
          <label>Correo</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="input-group">
          <label>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Ingresar al WMS</button>
      </form>
    </div>
  );
}

// --- LAYOUT PRINCIPAL CON SIDEBAR ---
function AppLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-brand">
          📦 Limatco WMS
        </div>
        <div className="sidebar-nav">
          <NavLink to="/app/despachos" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            🚚 Despachos (Salidas)
          </NavLink>
          <NavLink to="/app/recepciones" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            🚛 Recepciones (Compras)
          </NavLink>
          <NavLink to="/app/inventario" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>
            📋 Kardex / Inventario
          </NavLink>
        </div>
        <div className="sidebar-footer">
          <button className="btn btn-danger" style={{width: '100%'}} onClick={handleLogout}>Cerrar Sesión</button>
        </div>
      </div>

      {/* CONTENIDO DINÁMICO */}
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}

// --- MÓDULO DE DESPACHOS (El Dashboard anterior) ---
function Despachos() {
  const [notas, setNotas] = useState([]);
  const navigate = useNavigate();

  const cargarNotas = async () => {
    try {
      const res = await fetch(`${API_URL}/capturas`);
      const data = await res.json();
      // Filtramos solo las de tipo OUTBOUND (Despachos)
      const despachos = data.filter(n => (n[9] || 'OUTBOUND') === 'OUTBOUND');
      setNotas(despachos);
    } catch (err) {
      console.error("Error cargando notas", err);
    }
  };

  useEffect(() => {
    cargarNotas();
  }, []);

  return (
    <div>
      <div className="header">
        <h1>🚚 Despachos (Notas de Carga)</h1>
        <button className="btn" onClick={cargarNotas} style={{background: '#e5e7eb'}}>🔄 Actualizar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Documento</th>
              <th>Número</th>
              <th>Origen</th>
              <th>Destino</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {notas.map((nota, index) => {
              let tipoDespacho = "VALIJA";
              let colorBadge = "#3b82f6";
              try {
                const json = JSON.parse(nota[6]);
                tipoDespacho = json.tipo_despacho || "VALIJA";
                if (tipoDespacho === "RETIRO_TIENDA") colorBadge = "#d97706";
                if (tipoDespacho === "FLETE") colorBadge = "#7c3aed";
              } catch(e){}

              return (
                <tr key={index}>
                  <td>{new Date(nota[1]).toLocaleString()}</td>
                  <td>
                    <strong>{nota[2]}</strong><br/>
                    <span style={{fontSize: '10px', color: '#666'}}>{tipoDespacho}</span>
                  </td>
                  <td>{nota[3]}</td>
                  <td>{nota[4]}</td>
                  <td>
                    <span className="badge" style={{backgroundColor: colorBadge, color: 'white'}}>
                      {nota[5] || 'N/A'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => navigate(`/app/picking/${nota[0]}`)}>
                      Preparar
                    </button>
                  </td>
                </tr>
              );
            })}
            {notas.length === 0 && (
              <tr><td colSpan="6" style={{textAlign: 'center'}}>No hay notas de despacho capturadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- MÓDULO DE RECEPCIONES (Esqueleto) ---
function Recepciones() {
  return (
    <div>
      <div className="header">
        <h1>🚛 Recepciones (Órdenes de Compra)</h1>
      </div>
      <div className="card" style={{textAlign: 'center', padding: '50px'}}>
        <h3 style={{color: '#6b7280'}}>Módulo en construcción</h3>
        <p>Aquí se listarán las Órdenes de Compra capturadas desde Justtime.</p>
        <p style={{fontSize: '12px', color: '#9ca3af'}}>Esperando diseño de la OC para conectar el parser...</p>
      </div>
    </div>
  );
}

// --- MÓDULO DE KARDEX (Esqueleto) ---
function Inventario() {
  return (
    <div>
      <div className="header">
        <h1>📋 Kardex / Inventario Físico</h1>
      </div>
      <div className="card" style={{textAlign: 'center', padding: '50px'}}>
        <h3 style={{color: '#6b7280'}}>Módulo en construcción</h3>
        <p>Aquí se verá el stock real consolidado por bodega.</p>
      </div>
    </div>
  );
}

// --- VISTA DE PICKING (Detalle de la Nota - Se mantiene igual) ---
function Picking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notaData, setNotaData] = useState(null);
  const [estadoActual, setEstadoActual] = useState('PENDIENTE');
  const [cargando, setCargando] = useState(true);
  const [completado, setCompletado] = useState(false);
  const [scannedLines, setScannedLines] = useState([]);
  const [scanInput, setScanInput] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/capturas/${id}`)
      .then(res => {
        if (!res.ok) throw new Error("No encontrada");
        return res.json();
      })
      .then(data => {
        setNotaData(data.data);
        setEstadoActual(data.estado);
        setCargando(false);
      })
      .catch(err => {
        console.error("Error cargando nota:", err);
        setCargando(false);
      });
  }, [id]);

  const handleScan = (e) => {
    e.preventDefault();
    if (!scanInput || !notaData) return;
    const index = notaData.lineas.findIndex(
      (l, i) => l.codigoMaterial.includes(scanInput.trim()) && !scannedLines.includes(i)
    );
    if (index !== -1) {
      setScannedLines([...scannedLines, index]);
    } else {
      alert("Material no encontrado o ya escaneado.");
    }
    setScanInput('');
  };

  const confirmarPicking = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/capturas/${id}/confirmar`, { method: 'PUT' });
      if (res.ok) {
        setCompletado(true);
        setTimeout(() => navigate('/app/despachos'), 2000);
      } else {
        alert("Error al confirmar.");
        setCargando(false);
      }
    } catch (err) {
      alert("Error de conexión.");
      setCargando(false);
    }
  };

  if (cargando && !notaData) return <h2>Cargando nota...</h2>;
  if (!notaData) return <h2>Error al cargar la nota.</h2>;

  if (completado) {
    return (
      <div style={{textAlign: 'center', marginTop: '50px'}}>
        <h1 style={{color: '#065f46', fontSize: '40px'}}>✅ ¡Recolección Completada!</h1>
      </div>
    );
  }

  let bgColor = '#005A9E';
  if (notaData.tipo_despacho === 'RETIRO_TIENDA') bgColor = '#d97706';
  if (notaData.tipo_despacho === 'FLETE') bgColor = '#7c3aed';

  const todoEscaneado = scannedLines.length === notaData.lineas.length;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="pda-header" style={{ backgroundColor: bgColor }}>
        <div>
          <h1 style={{ fontSize: '20px', margin: 0 }}>{notaData.tipo_despacho}</h1>
          <p style={{ margin: 0, fontSize: '14px' }}>{notaData.numero_documento}</p>
        </div>
        <button className="btn" style={{backgroundColor: 'rgba(255,255,255,0.2)', color: 'white'}} onClick={() => navigate('/app/despachos')}>
          ✖
        </button>
      </div>

      {estadoActual === 'PENDIENTE' && (
        <form onSubmit={handleScan}>
          <input 
            type="text" 
            className="scanner-input" 
            placeholder="🔍 Escanear Material..." 
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            autoFocus
          />
        </form>
      )}

      <div>
        {notaData.lineas.map((linea, i) => {
          const isScanned = scannedLines.includes(i);
          return (
            <div key={i} className={`pda-card ${isScanned ? 'scanned' : ''}`}>
              <div>
                <div className="pda-ubicacion">{linea.ubicacionFisica}</div>
                <div className="pda-material">{linea.codigoMaterial} - {linea.descripcion}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="pda-cantidad">{linea.cantidad}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{linea.unidad}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '30px', marginBottom: '50px' }}>
        <button 
          className="btn-confirmar" 
          onClick={confirmarPicking}
          disabled={!todoEscaneado || estadoActual === 'COMPLETADO' || cargando}
        >
          {estadoActual === 'COMPLETADO' ? "YA COMPLETADO" : 
           todoEscaneado ? "✅ CONFIRMAR DESPACHO" : 
           `FALTAN ${notaData.lineas.length - scannedLines.length} MATERIALES`}
        </button>
      </div>
    </div>
  );
}

// --- RUTEO PRINCIPAL CON LAYOUT ---
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        
        {/* Rutas protegidas dentro del Layout con Sidebar */}
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="/app/despachos" replace />} />
          <Route path="despachos" element={<Despachos />} />
          <Route path="recepciones" element={<Recepciones />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="picking/:id" element={<Picking />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
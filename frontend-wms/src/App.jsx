import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';

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
        navigate('/dashboard');
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

// --- VISTA DE DASHBOARD (Lista de Notas) ---
function Dashboard() {
  const [notas, setNotas] = useState([]);
  const navigate = useNavigate();

  const cargarNotas = () => {
    fetch(`${API_URL}/capturas`)
      .then(res => res.json())
      .then(data => setNotas(data))
      .catch(err => console.error("Error cargando notas", err));
  };

  useEffect(() => {
    cargarNotas();
  }, []);

  return (
    <div className="container">
      <div className="header">
        <h1>📦 Panel de Despachos</h1>
        <div>
          <button className="btn" onClick={cargarNotas} style={{marginRight: '10px', background: '#e5e7eb'}}>🔄 Actualizar</button>
          <button className="btn btn-danger" onClick={() => { localStorage.clear(); navigate('/'); }}>Salir</button>
        </div>
      </div>
      
      <div className="card">
        <h3>Notas Capturadas desde Justtime</h3>
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
            {notas.map((nota, index) => (
              <tr key={index}>
                <td>{new Date(nota[1]).toLocaleString()}</td>
                <td><strong>{nota[2]}</strong></td>
                <td>{nota[3]}</td>
                <td>{nota[4]}</td>
                <td><span className="badge badge-pending">{nota[5]}</span></td>
                <td>
                  <button className="btn btn-primary" onClick={() => navigate(`/picking/${nota[0]}`, { state: { nota } })}>
                    Preparar (Picking)
                  </button>
                </td>
              </tr>
            ))}
            {notas.length === 0 && (
              <tr><td colSpan="6" style={{textAlign: 'center'}}>No hay notas capturadas aún. Abre Justtime para generar una.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/// --- VISTA DE PICKING (Detalle de la Nota) ---
function Picking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notaData, setNotaData] = useState(null);
  const [estadoActual, setEstadoActual] = useState('PENDIENTE');
  const [cargando, setCargando] = useState(true);
  const [completado, setCompletado] = useState(false);

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

  const confirmarPicking = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/capturas/${id}/confirmar`, { method: 'PUT' });
      if (res.ok) {
        setCompletado(true);
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        alert("Error al confirmar.");
        setCargando(false);
      }
    } catch (err) {
      alert("Error de conexión.");
      setCargando(false);
    }
  };

  if (cargando && !notaData) return <div className="container"><h2>Cargando nota...</h2></div>;
  if (!notaData) return <div className="container"><h2>Error: No se pudo cargar la nota.</h2><button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Volver</button></div>;

  if (completado) {
    return (
      <div className="container" style={{textAlign: 'center', marginTop: '50px'}}>
        <h1 style={{color: '#065f46', fontSize: '40px'}}>✅ ¡Recolección Completada!</h1>
        <p style={{fontSize: '20px', marginTop: '20px'}}>La nota ha sido enviada al área de despacho.</p>
      </div>
    );
  }

  // Asignar color según el tipo de despacho
  let colorDespacho = '#0284c7'; // Azul por defecto
  if (notaData.tipo_despacho === 'RETIRO_TIENDA') colorDespacho = '#d97706'; // Naranja
  if (notaData.tipo_despacho === 'FLETE') colorDespacho = '#7c3aed'; // Morado

  return (
    <div className="container">
      <div className="header">
        <h1>📝 Recolección: {notaData.tipo_documento} {notaData.numero_documento}</h1>
        <button className="btn btn-danger" onClick={() => navigate('/dashboard')}>Volver al Panel</button>
      </div>

      <div className="card" style={{backgroundColor: '#f8fafc', borderLeft: `5px solid ${colorDespacho}`}}>
        <h2 style={{color: colorDespacho, marginBottom: '10px'}}>
          Tipo: {notaData.tipo_despacho || 'VALIJA'} | Destino: {notaData.sucursal_destino_codigo || 'N/A'}
        </h2>
        <p><strong>Bodega Origen:</strong> {notaData.bodega_origen}</p>
        <p><strong>Referencia ERP:</strong> {notaData.destino_texto}</p>
        <p><strong>Estado actual:</strong> <span className={`badge ${estadoActual === 'COMPLETADO' ? 'badge-success' : 'badge-pending'}`}>{estadoActual}</span></p>
      </div>

      <div className="card">
        <h3>Materiales a Preparar</h3>
        <table>
            <thead>
              <tr style={{backgroundColor: '#f3f4f6'}}>
                <th style={{fontSize: '18px', color: '#005A9E'}}>Ir a Ubicación</th>
                <th>Código Material</th>
                <th>Descripción</th>
                <th style={{fontSize: '18px', color: '#005A9E'}}>Cantidad</th> {/* <--- AQUÍ SE CAMBIA */}
                <th>Unidad</th>
              </tr>
            </thead>
          <tbody>
            {notaData.lineas && notaData.lineas.map((linea, i) => (
              <tr key={i}>
                <td><strong style={{color: '#005A9E', fontSize: '24px', backgroundColor: '#e5e7eb', padding: '5px 10px', borderRadius: '4px'}}>{linea.ubicacionFisica}</strong></td>
                <td style={{fontSize: '16px'}}>{linea.codigoMaterial}</td>
                <td>{linea.descripcion}</td>
                <td><strong style={{fontSize: '24px', color: '#005A9E'}}>{linea.cantidad}</strong></td>
                <td>{linea.unidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <button 
          className="btn btn-primary" 
          style={{ fontSize: '24px', padding: '20px 50px', borderRadius: '50px', backgroundColor: estadoActual === 'COMPLETADO' ? '#9ca3af' : '#005A9E' }} 
          onClick={confirmarPicking}
          disabled={cargando || estadoActual === 'COMPLETADO'}
        >
          {cargando ? "Procesando..." : (estadoActual === 'COMPLETADO' ? "Ya Completado" : "✅ Confirmar Recolección")}
        </button>
      </div>
    </div>
  );
}

// --- RUTEO PRINCIPAL ---
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/picking/:id" element={<Picking />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
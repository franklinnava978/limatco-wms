import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, Outlet, NavLink } from 'react-router-dom';

const API_URL = 'http://localhost:3000/api';

// --- LOGIN ---
function Login() {
  const [email, setEmail] = useState('admin@limatco.cl');
  const [password, setPassword] = useState('Limatco.2026');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('wms_token', data.token);
        navigate('/app/despachos');
      } else setError(data.error);
    } catch (err) { setError('Error conectando al servidor.'); }
  };

  return (
    <div className="login-box">
      <h2 style={{marginBottom: '20px', textAlign: 'center', color: '#005A9E'}}>Limatco WMS</h2>
      {error && <p style={{color: 'red', marginBottom: '10px', fontSize: '14px'}}>{error}</p>}
      <form onSubmit={handleLogin}>
        <div className="input-group"><label>Correo</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="input-group"><label>Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Ingresar al WMS</button>
      </form>
    </div>
  );
}

// --- LAYOUT CON SIDEBAR ---
function AppLayout() {
  const navigate = useNavigate();
  return (
    <div className="app-layout">
      <div className="sidebar">
        <div className="sidebar-brand">📦 Limatco WMS</div>
        <div className="sidebar-nav">
          <NavLink to="/app/despachos" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>🚚 Despachos (Salidas)</NavLink>
          <NavLink to="/app/recepciones" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>🚛 Recepciones (Compras)</NavLink>
          <NavLink to="/app/inventario" className={({isActive}) => isActive ? "nav-item active" : "nav-item"}>📋 Kardex / Inventario</NavLink>
        </div>
        <div className="sidebar-footer"><button className="btn btn-danger" style={{width: '100%'}} onClick={() => { localStorage.clear(); navigate('/'); }}>Cerrar Sesión</button></div>
      </div>
      <div className="main-content"><Outlet /></div>
    </div>
  );
}

// --- DESPACHOS ---
// --- DESPACHOS ---
function Despachos() {
  const [notas, setNotas] = useState([]);
  const navigate = useNavigate();

  const cargarNotas = async () => {
    try {
      const res = await fetch(`${API_URL}/capturas`);
      const data = await res.json();
      const despachos = data.filter(n => {
        if (n[2] === 'RECEPCION' || n[2] === 'DESPACHO') return false; // Ocultar eventos internos
        try {
          const json = JSON.parse(n[6]);
          const estado = n[8] || 'PENDIENTE';
          // Mostramos Notas de Venta / Boletas que NO estén COMPLETADAS
          return json.tipo_flujo === 'OUTBOUND' && json.tipo_documento !== 'DESPACHO' && estado !== 'COMPLETADO';
        } catch(e) { return false; }
      });
      setNotas(despachos);
    } catch (err) { console.error(err); }
  };
  useEffect(() => { cargarNotas(); }, []);

  return (
    <div>
      <div className="header"><h1>🚚 Despachos (Notas de Carga)</h1><button className="btn" onClick={cargarNotas} style={{background: '#e5e7eb'}}>🔄 Actualizar</button></div>
      <div className="card">
        <table>
          <thead><tr><th>Fecha</th><th>Documento</th><th>Número</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {notas.map((nota, index) => {
              let tipoDespacho = "VALIJA"; let colorBadge = "#3b82f6";
              const estadoNota = nota[8] || 'PENDIENTE';
              const colorEstado = estadoNota === 'PARCIAL' ? '#d97706' : '#3b82f6';

              try {
                const json = JSON.parse(nota[6]);
                tipoDespacho = json.tipo_despacho || "VALIJA";
                if (tipoDespacho === "RETIRO_TIENDA") colorBadge = "#d97706";
                if (tipoDespacho === "FLETE") colorBadge = "#7c3aed";
              } catch(e){}
              return (
                <tr key={index}>
                  <td>{new Date(nota[1]).toLocaleString()}</td>
                  <td><strong>{nota[2]}</strong><br/><span style={{fontSize: '10px', color: '#666'}}>{tipoDespacho}</span></td>
                  <td>{nota[3]}</td><td>{nota[4]}</td>
                  <td><span className="badge" style={{backgroundColor: colorBadge, color: 'white'}}>{nota[5] || 'N/A'}</span></td>
                  <td><span className="badge" style={{backgroundColor: colorEstado, color: 'white'}}>{estadoNota}</span></td>
                  <td><button className="btn btn-primary" onClick={() => navigate(`/app/picking/${nota[0]}`)}>Preparar</button></td>
                </tr>
              );
            })}
            {notas.length === 0 && <tr><td colSpan="7" style={{textAlign: 'center'}}>No hay despachos pendientes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- RECEPCIONES ---
function Recepciones() {
  const [ordenes, setOrdenes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const navigate = useNavigate();

  const cargarOrdenes = async () => {
    try {
      const res = await fetch(`${API_URL}/capturas`);
      const data = await res.json();
      const inbound = data.filter(n => {
        if (n[2] === 'RECEPCION') return false; // Ocultar el evento de recepción física
        try {
          const json = JSON.parse(n[6]);
          const estado = n[8] || 'PENDIENTE';
          return json.tipo_documento === 'ORDEN_COMPRA' && estado !== 'COMPLETADO';
        } catch(e) { return false; }
      });
      setOrdenes(inbound);
    } catch (err) { console.error(err); }
  };
  useEffect(() => { cargarOrdenes(); }, []);

  const ordenesFiltradas = ordenes.filter(oc => {
    const search = busqueda.toLowerCase();
    return String(oc[3] || '').toLowerCase().includes(search) || String(oc[4] || '').toLowerCase().includes(search);
  });

  return (
    <div>
      <div className="header"><h1>🚛 Recepciones (Órdenes de Compra)</h1><button className="btn" onClick={cargarOrdenes} style={{background: '#e5e7eb'}}>🔄 Actualizar</button></div>
      <div className="card" style={{ padding: '15px', marginBottom: '15px' }}>
        <input type="text" placeholder="🔍 Buscar OC o Proveedor..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Fecha</th><th>Documento</th><th>Número OC</th><th>Proveedor</th><th>Destino</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {ordenesFiltradas.map((oc, index) => {
              const estadoOC = oc[8] || 'PENDIENTE';
              const colorEstado = estadoOC === 'PARCIAL' ? '#d97706' : '#3b82f6';
              return (
                <tr key={index}>
                  <td>{new Date(oc[1]).toLocaleString()}</td><td><strong>{oc[2]}</strong></td><td>{oc[3]}</td><td>{oc[4]}</td>
                  <td><span className="badge badge-success">{oc[5]}</span></td>
                  <td><span className="badge" style={{backgroundColor: colorEstado, color: 'white'}}>{estadoOC}</span></td>
                  <td><button className="btn btn-primary" onClick={() => navigate(`/app/recepcion/${oc[0]}`)}>Recibir</button></td>
                </tr>
              );
            })}
            {ordenesFiltradas.length === 0 && <tr><td colSpan="7" style={{textAlign: 'center'}}>No hay OCs pendientes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- INVENTARIO / KARDEX ---
function Inventario() {
  const [inventario, setInventario] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarInventario = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/inventario`);
      const data = await res.json();
      data.sort((a, b) => a.codigo.localeCompare(b.codigo));
      setInventario(data);
    } catch (err) { console.error(err); }
    setCargando(false);
  };
  useEffect(() => { cargarInventario(); }, []);

  return (
    <div>
      <div className="header"><h1>📋 Kardex / Inventario Físico</h1><button className="btn" onClick={cargarInventario} style={{background: '#e5e7eb'}}>🔄 Actualizar Stock</button></div>
      <div className="card">
        <table>
          <thead><tr><th>Código Material</th><th>Descripción</th><th>Stock Actual</th><th>Estado</th></tr></thead>
          <tbody>
            {inventario.map((item, index) => {
              let colorStock = '#1f2937'; let badge = 'Normal';
              if (item.stock <= 0) { colorStock = '#dc2626'; badge = 'Sin Stock'; }
              else if (item.stock < 5) { colorStock = '#d97706'; badge = 'Stock Bajo'; }
              return (
                <tr key={index}>
                  <td><strong>{item.codigo}</strong></td><td>{item.descripcion}</td>
                  <td><strong style={{fontSize: '20px', color: colorStock}}>{item.stock}</strong></td>
                  <td><span className={`badge ${item.stock > 0 ? 'badge-success' : 'badge-pending'}`}>{badge}</span></td>
                </tr>
              );
            })}
            {inventario.length === 0 && !cargando && <tr><td colSpan="4" style={{textAlign: 'center'}}>Kardex vacío.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- PICKING (PDA) ---
// --- PICKING (PDA CON DESPACHOS PARCIALES) ---
function Picking() {
  const { id } = useParams(); const navigate = useNavigate();
  const [notaData, setNotaData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [completado, setCompletado] = useState(false);
  
  const [cantidadesDespachadas, setCantidadesDespachadas] = useState([]);
  const [cantidadesPrevias, setCantidadesPrevias] = useState({});

  useEffect(() => {
    // 1. Buscamos la nota original
    fetch(`${API_URL}/capturas/${id}`).then(res => res.json()).then(nota => {
      setNotaData(nota.data);
      
      // 2. Buscamos si hay despachos previos de esta nota
      fetch(`${API_URL}/capturas`).then(res => res.json()).then(todas => {
        const previas = {};
        todas.forEach(fila => {
          // Fila[10] es la referencia a la nota original
          if (fila[10] === String(id) && fila[2] === 'DESPACHO') {
            JSON.parse(fila[6]).lineas.forEach(l => {
              previas[l.codigoMaterial] = (previas[l.codigoMaterial] || 0) + l.cantidad;
            });
          }
        });
        setCantidadesPrevias(previas);
        
        // Inicializamos las cantidades a despachar en 0
        setCantidadesDespachadas(nota.data.lineas.map(() => 0));
        setCargando(false);
      });
    }).catch(err => { console.error(err); setCargando(false); });
  }, [id]);

  const handleCantidadChange = (index, valor) => {
    const nuevas = [...cantidadesDespachadas];
    nuevas[index] = parseFloat(valor) || 0;
    setCantidadesDespachadas(nuevas);
  };

  const confirmarDespacho = async () => {
    setCargando(true);
    // Preparamos los items que realmente se están llevando
    const items = notaData.lineas.map((l, i) => ({
      codigoMaterial: l.codigoMaterial,
      descripcion: l.descripcion,
      ubicacionFisica: l.ubicacionFisica,
      cantidad: cantidadesDespachadas[i]
    })).filter(item => item.cantidad > 0);

    if (items.length === 0) {
      alert("Debes ingresar al menos una cantidad mayor a 0 para despachar.");
      setCargando(false);
      return;
    }

    // Verificamos si con esto se completa la nota
    let esCompleta = true;
    notaData.lineas.forEach((l, i) => {
      const yaDespachado = cantidadesPrevias[l.codigoMaterial] || 0;
      if ((yaDespachado + cantidadesDespachadas[i]) < l.cantidad) esCompleta = false;
    });

    try {
      const res = await fetch(`${API_URL}/despachos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nota_id: id,
          nota_numero: notaData.numero_documento,
          origen: notaData.bodega_origen,
          destino: notaData.sucursal_destino_codigo,
          items: items,
          esCompleta
        })
      });
      if (res.ok) { setCompletado(true); setTimeout(() => navigate('/app/despachos'), 2000); }
      else { const errorData = await res.json(); alert(errorData.error || "Error."); setCargando(false); }
    } catch (err) { alert("Error."); setCargando(false); }
  };

  if (cargando && !notaData) return <h2>Cargando...</h2>;
  if (!notaData) return <h2>Error al cargar.</h2>;
  if (completado) return <div style={{textAlign: 'center', marginTop: '50px'}}><h1 style={{color: '#065f46', fontSize: '40px'}}>✅ ¡Despacho Registrado!</h1></div>;

  let bgColor = notaData.tipo_despacho === 'RETIRO_TIENDA' ? '#d97706' : notaData.tipo_despacho === 'FLETE' ? '#7c3aed' : '#005A9E';
  
  // Verificamos si ya se despachó todo para mostrar la pantalla verde
  const todoDespachado = notaData.lineas.every(l => (cantidadesPrevias[l.codigoMaterial] || 0) >= l.cantidad);

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div className="pda-header" style={{ backgroundColor: bgColor }}>
        <div><h1 style={{ fontSize: '20px', margin: 0 }}>{notaData.tipo_despacho}</h1><p style={{ margin: 0, fontSize: '14px' }}>{notaData.numero_documento}</p></div>
        <button className="btn" style={{backgroundColor: 'rgba(255,255,255,0.2)', color: 'white'}} onClick={() => navigate('/app/despachos')}>✖</button>
      </div>

      {todoDespachado ? (
        <div className="card" style={{textAlign: 'center', padding: '40px', backgroundColor: '#ecfdf5', border: '2px solid #10b981'}}>
          <h2 style={{color: '#065f46'}}>✅ Nota Completamente Despachada</h2>
          <button className="btn btn-primary" onClick={() => navigate('/app/despachos')} style={{marginTop: '20px'}}>Volver</button>
        </div>
      ) : (
        <>
          <div className="card">
            <table>
              <thead><tr><th>Material</th><th>Ubicación</th><th>Pedido</th><th>Falta</th><th>Despachar</th></tr></thead>
              <tbody>
                {notaData.lineas.map((linea, i) => {
                  const yaDespachado = cantidadesPrevias[linea.codigoMaterial] || 0;
                  const falta = linea.cantidad - yaDespachado;
                  
                  if (falta <= 0) return null; // Ocultar lo que ya se fue

                  return (
                    <tr key={i}>
                      <td><strong>{linea.codigoMaterial}</strong><br/><span style={{fontSize:'12px', color:'#666'}}>{linea.descripcion}</span></td>
                      <td><strong style={{color: '#005A9E', fontSize: '16px'}}>{linea.ubicacionFisica}</strong></td>
                      <td>{linea.cantidad}</td>
                      <td style={{color: '#dc2626', fontWeight: 'bold', fontSize: '18px'}}>{falta}</td>
                      <td>
                        <input 
                          type="number" 
                          value={cantidadesDespachadas[i] || 0} 
                          onChange={(e) => handleCantidadChange(i, e.target.value)} 
                          max={falta} min={0}
                          style={{ width: '80px', padding: '10px', fontSize: '18px', textAlign: 'center', border: '2px solid #3b82f6', borderRadius: '6px' }} 
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '20px', marginBottom: '50px' }}>
            <button className="btn-confirmar" onClick={confirmarDespacho} disabled={cargando} style={{ backgroundColor: '#059669' }}>
              ✅ GUARDAR DESPACHO
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- RECEPCIÓN FÍSICA ---
function RecepcionFisica() {
  const { id } = useParams(); const navigate = useNavigate();
  const [ocData, setOcData] = useState(null); const [cargando, setCargando] = useState(true);
  const [completado, setCompletado] = useState(false); const [cantidadesRecibidas, setCantidadesRecibidas] = useState([]);
  const [cantidadesPrevias, setCantidadesPrevias] = useState({});

  useEffect(() => {
    fetch(`${API_URL}/capturas/${id}`).then(res => res.json()).then(oc => {
      setOcData(oc.data);
      fetch(`${API_URL}/capturas`).then(res => res.json()).then(todas => {
        const previas = {};
        todas.forEach(fila => {
          if (fila[10] === String(id) && fila[2] === 'RECEPCION') {
            JSON.parse(fila[6]).lineas.forEach(l => { previas[l.codigoMaterial] = (previas[l.codigoMaterial] || 0) + l.cantidad; });
          }
        });
        setCantidadesPrevias(previas); setCargando(false);
      });
    }).catch(err => { console.error(err); setCargando(false); });
  }, [id]);

  useEffect(() => {
    if (ocData) {
      const iniciales = ocData.lineas.map(() => 0);
      setCantidadesRecibidas(iniciales);
    }
  }, [ocData, cantidadesPrevias]);

  const handleCantidadChange = (index, valor) => {
    const nuevas = [...cantidadesRecibidas]; nuevas[index] = parseFloat(valor) || 0; setCantidadesRecibidas(nuevas);
  };

  const confirmarRecepcion = async () => {
    setCargando(true);
    const items = ocData.lineas.map((l, i) => ({ codigoMaterial: l.codigoMaterial, descripcion: l.descripcion, cantidad: cantidadesRecibidas[i] })).filter(item => item.cantidad > 0);
    if (items.length === 0) { alert("Debes ingresar cantidad."); setCargando(false); return; }

    let esCompleta = true;
    ocData.lineas.forEach((l, i) => { if (((cantidadesPrevias[l.codigoMaterial] || 0) + cantidadesRecibidas[i]) < l.cantidad) esCompleta = false; });

    try {
      const res = await fetch(`${API_URL}/recepciones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oc_id: id, oc_numero: ocData.numero_documento, proveedor: ocData.bodega_origen, items, esCompleta })
      });
      if (res.ok) { setCompletado(true); setTimeout(() => navigate('/app/recepciones'), 2500); }
      else { const errorData = await res.json(); alert(errorData.error || "Error."); setCargando(false); }
    } catch (err) { alert("Error."); setCargando(false); }
  };

  if (cargando && !ocData) return <h2>Cargando...</h2>;
  if (!ocData) return <h2>Error.</h2>;
  if (completado) return <div style={{textAlign: 'center', marginTop: '50px'}}><h1 style={{color: '#065f46', fontSize: '40px'}}>✅ ¡Recepción Guardada!</h1></div>;

  const todoRecibido = ocData.lineas.every(l => (cantidadesPrevias[l.codigoMaterial] || 0) >= l.cantidad);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="pda-header" style={{ backgroundColor: '#059669' }}>
        <div><h1 style={{ fontSize: '20px', margin: 0 }}>RECEPCIÓN</h1><p style={{ margin: 0, fontSize: '14px' }}>OC: {ocData.numero_documento}</p></div>
        <button className="btn" style={{backgroundColor: 'rgba(255,255,255,0.2)', color: 'white'}} onClick={() => navigate('/app/recepciones')}>✖</button>
      </div>

      {todoRecibido ? (
        <div className="card" style={{textAlign: 'center', padding: '40px', backgroundColor: '#ecfdf5', border: '2px solid #10b981'}}>
          <h2 style={{color: '#065f46'}}>✅ Orden Completamente Recibida</h2>
          <button className="btn btn-primary" onClick={() => navigate('/app/recepciones')} style={{marginTop: '20px'}}>Volver</button>
        </div>
      ) : (
        <>
          <div className="card">
            <table>
              <thead><tr><th>Material</th><th>Descripción</th><th>Falta por Recibir</th><th>Recibir Ahora</th></tr></thead>
              <tbody>
                {ocData.lineas.map((linea, i) => {
                  const yaRecibido = cantidadesPrevias[linea.codigoMaterial] || 0;
                  const falta = linea.cantidad - yaRecibido;
                  if (falta <= 0) return null; // Ocultar lo que ya está completo
                  return (
                    <tr key={i}>
                      <td><strong>{linea.codigoMaterial}</strong></td><td>{linea.descripcion}</td>
                      <td style={{color: '#dc2626', fontWeight: 'bold', fontSize: '18px'}}>{falta}</td>
                      <td><input type="number" value={cantidadesRecibidas[i] || 0} onChange={(e) => handleCantidadChange(i, e.target.value)} max={falta} min={0} style={{ width: '80px', padding: '10px', fontSize: '18px', textAlign: 'center', border: '2px solid #3b82f6', borderRadius: '6px' }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '20px', marginBottom: '50px' }}>
            <button className="btn-confirmar" onClick={confirmarRecepcion} disabled={cargando} style={{ backgroundColor: '#059669' }}>✅ GUARDAR RECEPCIÓN</button>
          </div>
        </>
      )}
    </div>
  );
}

// --- RUTEO ---
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="/app/despachos" replace />} />
          <Route path="despachos" element={<Despachos />} />
          <Route path="recepciones" element={<Recepciones />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="picking/:id" element={<Picking />} />
          <Route path="recepcion/:id" element={<RecepcionFisica />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
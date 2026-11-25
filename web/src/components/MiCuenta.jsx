import { useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Campo, MensajeError, Modal } from './Elementos.jsx';

// Configuraciones habituales de servidores de e-mail.
const PRESETS = {
  gmail: { rotulo: 'Gmail / Google Workspace', host: 'smtp.gmail.com', puerto: 465, seguro: true },
  outlook: { rotulo: 'Outlook / Microsoft 365', host: 'smtp.office365.com', puerto: 587, seguro: false },
  otro: { rotulo: 'Otro servidor', host: '', puerto: 587, seguro: false },
};

function EmailDeEnvio({ abierto }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ host: '', puerto: 587, seguro: false, usuario: '', contrasena: '', nombreRemitente: '' });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setMsg(null);
    api
      .get('/auth/me/email')
      .then((c) => {
        setCfg(c);
        setForm({ host: c.host, puerto: c.puerto, seguro: c.seguro, usuario: c.usuario, contrasena: '', nombreRemitente: c.nombreRemitente });
      })
      .catch(setError);
  }, [abierto]);

  const cambiar = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const aplicarPreset = (clave) => {
    const p = PRESETS[clave];
    if (p) setForm((f) => ({ ...f, host: p.host, puerto: p.puerto, seguro: p.seguro }));
  };

  const ejecutar = async (fn, exito) => {
    setError(null);
    setMsg(null);
    setOcupado(true);
    try {
      const r = await fn();
      setMsg(typeof exito === 'function' ? exito(r) : exito);
      return r;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = (e) => {
    e.preventDefault();
    ejecutar(() => api.put('/auth/me/email', form), 'E-mail de envío guardado.').then((c) => {
      if (c) {
        setCfg(c);
        setForm((f) => ({ ...f, contrasena: '' }));
      }
    });
  };
  const probar = () =>
    ejecutar(
      () => api.post('/auth/me/email/prueba'),
      (r) => (r.modo === 'prueba' ? 'Modo prueba: no se ha enviado nada. Configura y guarda primero tu e-mail.' : `E-mail de prueba enviado a ${r.para.join(', ')}.`)
    );
  const quitar = () => {
    if (!window.confirm('¿Quitar el e-mail de envío configurado?')) return;
    ejecutar(() => api.put('/auth/me/email', { quitar: true }), 'Configuración eliminada.').then((c) => c && setCfg(c));
  };

  return (
    <form onSubmit={guardar} className="formulario">
      <h3>E-mail de envío</h3>
      <p className="texto-suave">
        Desde este e-mail Taskly envía el acuerdo de especificaciones al cliente.{' '}
        {cfg?.configurado
          ? 'Configurado.'
          : cfg?.emailGeneralDisponivel
            ? 'Mientras no lo configures, se usará el e-mail general del sistema.'
            : 'Mientras no lo configures, el sistema queda en modo prueba (genera el e-mail, pero no lo envía).'}
      </p>
      <Campo rotulo="Tu proveedor">
        <select defaultValue="" onChange={(e) => aplicarPreset(e.target.value)}>
          <option value="" disabled>
            Elige para rellenar el servidor…
          </option>
          {Object.entries(PRESETS).map(([v, p]) => (
            <option key={v} value={v}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <div className="cuadricula-2">
        <Campo rotulo="Servidor (SMTP)">
          <input value={form.host} onChange={cambiar('host')} placeholder="smtp.gmail.com" />
        </Campo>
        <Campo rotulo="Puerto">
          <input type="number" value={form.puerto} onChange={cambiar('puerto')} min={1} max={65535} />
        </Campo>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={form.seguro} onChange={cambiar('seguro')} />
        Conexión SSL directa (puerto 465)
      </label>
      <Campo rotulo="Tu e-mail (login)">
        <input type="email" value={form.usuario} onChange={cambiar('usuario')} autoComplete="off" />
      </Campo>
      <Campo
        rotulo="Contraseña de aplicación"
        pista={cfg?.configurado ? 'Déjalo en blanco para mantener la actual.' : 'En Gmail/Outlook, genera una "contraseña de aplicación" en la configuración de seguridad de la cuenta.'}
      >
        <input type="password" value={form.contrasena} onChange={cambiar('contrasena')} autoComplete="new-password" />
      </Campo>
      <Campo rotulo="Nombre del remitente (opcional)">
        <input value={form.nombreRemitente} onChange={cambiar('nombreRemitente')} placeholder="P. ej.: Erick – Awakelab" />
      </Campo>
      <MensajeError error={error} />
      {msg && <div className="alerta alerta-ok">{msg}</div>}
      <div className="acciones">
        {cfg?.configurado && (
          <button type="button" className="boton boton-peligro-fantasma" onClick={quitar} disabled={ocupado}>
            Quitar
          </button>
        )}
        <button type="button" className="boton boton-secundario" onClick={probar} disabled={ocupado}>
          Enviar prueba
        </button>
        <button type="submit" className="boton" disabled={ocupado}>
          Guardar e-mail
        </button>
      </div>
    </form>
  );
}

export default function MiCuenta({ abierto, alCerrar }) {
  const { usuario } = useAuth();
  const [form, setForm] = useState({ contrasenaActual: '', nuevaContrasena: '' });
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cerrar = () => {
    setForm({ contrasenaActual: '', nuevaContrasena: '' });
    setError(null);
    setExito(false);
    alCerrar();
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await api.patch('/auth/me/contrasena', form);
      setExito(true);
      setForm({ contrasenaActual: '', nuevaContrasena: '' });
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Mi cuenta" abierto={abierto} alCerrar={cerrar} anchura={560}>
      <p className="texto-suave">
        {usuario?.nombre} · {usuario?.email}
      </p>
      <form onSubmit={enviar} className="formulario">
        <h3>Cambiar contraseña</h3>
        <Campo rotulo="Contraseña actual">
          <input type="password" value={form.contrasenaActual} onChange={(e) => setForm({ ...form, contrasenaActual: e.target.value })} required />
        </Campo>
        <Campo rotulo="Contraseña nueva" pista="Mínimo 6 caracteres">
          <input type="password" minLength={6} value={form.nuevaContrasena} onChange={(e) => setForm({ ...form, nuevaContrasena: e.target.value })} required />
        </Campo>
        <MensajeError error={error} />
        {exito && <div className="alerta alerta-ok">Contraseña cambiada.</div>}
        <div className="acciones">
          <button type="submit" className="boton" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar contraseña nueva'}
          </button>
        </div>
      </form>
      <div className="seccion-form" style={{ marginTop: 20 }}>
        <EmailDeEnvio abierto={abierto} />
      </div>
    </Modal>
  );
}

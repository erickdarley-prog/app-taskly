import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSignature, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { MensajeError } from '../components/Elementos.jsx';
import { MarcaAwakelab } from '../components/Layout.jsx';

const PARTES = ['Hitos', 'Tareas', 'Alcance y acuerdo', 'Diario', 'Asistente'];

// Acepta el enlace completo del e-mail o solo el código del acuerdo.
function extraerCodigo(texto) {
  const valor = String(texto || '').trim();
  const delLink = valor.match(/\/acuerdo\/([A-Za-z0-9_-]+)/);
  return delLink ? delLink[1] : valor;
}

export default function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(email, contrasena);
      navegar('/proyectos', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  const abrirAcuerdo = (e) => {
    e.preventDefault();
    const c = extraerCodigo(codigo);
    if (c) navegar(`/acuerdo/${c}`);
  };

  return (
    <div className="login">
      <section className="login-presentacion">
        <MarcaAwakelab altura={38} />
        <p className="etiqueta-portada">Gestión de proyectos · Awakelab</p>
        <h1>
          Proyectos de clientes, <span className="destacado">del alcance a la entrega</span>
        </h1>
        <p className="login-texto">
          Hitos con fechas, tareas de Awakelab y del cliente, alcance firmado por las dos partes y un diario de lo que pasa cada día.
        </p>
        <ol className="login-partes">
          {PARTES.map((p, i) => (
            <li key={p}>
              <span>{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
        <p className="login-pie">
          <strong>Taskly</strong> · plataforma de uso interno del equipo de Awakelab
        </p>
      </section>

      <section className="login-lado">
        <div className="login-tarjetas">
          <form className="tarjeta login-tarjeta" onSubmit={enviar}>
            <h2>Entrar en Taskly</h2>
            <p className="texto-suave">Equipo y administradores de Awakelab. Usa el e-mail y la contraseña que te dio el administrador.</p>
            <label className="campo">
              <span className="campo-rotulo">E-mail</span>
              <span className="campo-con-icono">
                <Mail size={18} aria-hidden="true" />
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </span>
            </label>
            <label className="campo">
              <span className="campo-rotulo">Contraseña</span>
              <span className="campo-con-icono">
                <Lock size={18} aria-hidden="true" />
                <input type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
              </span>
            </label>
            <MensajeError error={error} />
            <button type="submit" className="boton boton-ancho boton-grande" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <form className="tarjeta login-tarjeta login-cliente" onSubmit={abrirAcuerdo}>
            <h3>
              <FileSignature size={18} aria-hidden="true" /> ¿Eres cliente y has recibido un acuerdo para firmar?
            </h3>
            <p className="texto-suave">Pega el enlace del e-mail o el código del acuerdo. No necesitas cuenta.</p>
            <div className="login-codigo">
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Enlace o código del acuerdo" aria-label="Enlace o código del acuerdo" />
              <button type="submit" className="boton boton-contorno" disabled={!codigo.trim()}>
                Abrir <ArrowRight size={16} />
              </button>
            </div>
          </form>

          <p className="login-aviso">Uso interno de Awakelab · El cliente solo accede al acuerdo que se le envió.</p>
        </div>
      </section>
    </div>
  );
}

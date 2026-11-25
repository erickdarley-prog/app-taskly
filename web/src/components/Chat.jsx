// Asistente de chat: ventana flotante que conversa con la API (/api/chat).
// Se puede quitar borrando este archivo y la línea <Chat /> de Layout.jsx.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { avisarDatosModificados } from '../utils/eventos.js';

const SUGERENCIAS_ADMIN = [
  'Quiero crear un proyecto nuevo',
  '¿Cómo va el avance de los proyectos?',
  '¿Qué tareas están atrasadas en el Portal del Alumno?',
  'Dar de alta un nuevo usuario',
];
const SUGERENCIAS_EQUIPO = [
  '¿Qué tengo pendiente?',
  '¿Tengo alguna tarea atrasada?',
  'Hoy he trabajado 2 horas en una tarea',
  '¿Cómo va el avance de mis proyectos?',
];

// Formato sencillo y seguro: **negrita**, listas con "-" y saltos de línea.
function Negrita({ texto }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>
  );
}

function TextoFormateado({ texto }) {
  // Agrupa líneas de lista seguidas en un mismo bloque.
  const grupos = [];
  texto.split('\n').forEach((linea) => {
    const item = linea.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    const ultimo = grupos[grupos.length - 1];
    if (item) {
      if (ultimo?.tipo === 'lista') ultimo.items.push(item[1]);
      else grupos.push({ tipo: 'lista', items: [item[1]] });
    } else if (linea.trim()) {
      grupos.push({ tipo: 'parrafo', texto: linea });
    }
  });
  return grupos.map((g, i) =>
    g.tipo === 'lista' ? (
      <ul key={i}>
        {g.items.map((t, j) => (
          <li key={j}>
            <Negrita texto={t} />
          </li>
        ))}
      </ul>
    ) : (
      <p key={i}>
        <Negrita texto={g.texto} />
      </p>
    )
  );
}

function TarjetaContrasena({ extra }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(extra.contrasena);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* navegador sin permiso para copiar: la contraseña sigue visible */
    }
  };
  return (
    <div className="chat-contrasena">
      <span>
        Contraseña temporal de <strong>{extra.nombre}</strong> ({extra.email})
      </span>
      <code>{extra.contrasena}</code>
      <button type="button" className="boton boton-secundario" onClick={copiar}>
        {copiado ? '¡Copiada!' : 'Copiar'}
      </button>
      <small>Se muestra solo aquí, una vez. Pásasela a la persona y pídele que la cambie en "Mi cuenta".</small>
    </div>
  );
}

export default function Chat() {
  const { esAdmin } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [configurado, setConfigurado] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const finRef = useRef(null);
  const campoRef = useRef(null);

  useEffect(() => {
    if (!abierto || cargado) return;
    api
      .get('/chat')
      .then((d) => {
        setConfigurado(d.configurado);
        setMensajes(d.mensajes);
      })
      .catch((e) => setMensajes([{ rol: 'error', texto: e.message }]))
      .finally(() => setCargado(true));
  }, [abierto, cargado]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, enviando, abierto]);

  useEffect(() => {
    if (abierto) campoRef.current?.focus();
  }, [abierto]);

  const enviar = useCallback(
    async (contenido) => {
      const mensaje = (contenido ?? texto).trim();
      if (!mensaje || enviando) return;
      setTexto('');
      setMensajes((m) => [...m, { rol: 'usuario', texto: mensaje }]);
      setEnviando(true);
      try {
        const r = await api.post('/chat', { mensaje });
        setMensajes((m) => [...m, { rol: 'asistente', texto: r.respuesta, extras: r.extras }]);
        if (r.modifico) avisarDatosModificados();
      } catch (e) {
        setMensajes((m) => [...m, { rol: 'error', texto: e.message }]);
      } finally {
        setEnviando(false);
        campoRef.current?.focus();
      }
    },
    [texto, enviando]
  );

  const nuevaConversacion = async () => {
    try {
      await api.del('/chat');
      setMensajes([]);
    } catch (e) {
      setMensajes((m) => [...m, { rol: 'error', texto: e.message }]);
    }
  };

  const alTeclear = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const sugerencias = esAdmin ? SUGERENCIAS_ADMIN : SUGERENCIAS_EQUIPO;

  return (
    <>
      {!abierto && (
        <button type="button" className="chat-boton" onClick={() => setAbierto(true)} aria-label="Abrir asistente">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"
              fill="currentColor"
            />
          </svg>
          Asistente
        </button>
      )}

      {abierto && (
        <section className="chat-panel" aria-label="Asistente de Taskly">
          <header className="chat-cabecera">
            <div>
              <strong>Asistente</strong>
              <small>{esAdmin ? 'Puede crear, editar y consultar todo' : 'Consulta y actualiza tus tareas'}</small>
            </div>
            <div className="chat-cabecera-acciones">
              <button type="button" className="boton boton-fantasma claro" onClick={nuevaConversacion} disabled={enviando}>
                Nueva conversación
              </button>
              <button type="button" className="boton-icono claro" onClick={() => setAbierto(false)} aria-label="Cerrar asistente">
                ×
              </button>
            </div>
          </header>

          <div className="chat-mensajes" aria-live="polite">
            {!configurado && (
              <div className="alerta alerta-error">
                El asistente aún no está configurado. Pon la <code>OPENAI_API_KEY</code> en el archivo <code>api/.env</code> y reinicia la API.
              </div>
            )}

            {cargado && mensajes.length === 0 && (
              <div className="chat-bienvenida">
                <p>
                  ¡Hola! Dime qué necesitas y lo hago por ti. {esAdmin ? 'Puedo crear proyectos, tareas y usuarios, ' : 'Puedo mostrar tus tareas, '}
                  {esAdmin ? 'actualizar estados y mostrar el avance.' : 'cambiar el estado y registrar tus horas.'}
                </p>
                <div className="chat-sugerencias">
                  {sugerencias.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)} disabled={enviando || !configurado}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensajes.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.rol}`}>
                {m.rol === 'asistente' ? <TextoFormateado texto={m.texto} /> : <p>{m.texto}</p>}
                {m.extras?.filter((x) => x.tipo === 'contrasena').map((x) => (
                  <TarjetaContrasena key={x.email} extra={x} />
                ))}
              </div>
            ))}

            {enviando && (
              <div className="chat-msg chat-msg-asistente chat-escribiendo" aria-label="El asistente está escribiendo">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form
            className="chat-entrada"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <textarea
              ref={campoRef}
              rows={1}
              placeholder="Escribe aquí… (Enter envía)"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
              disabled={!configurado}
              maxLength={4000}
              aria-label="Mensaje para el asistente"
            />
            <button type="submit" className="boton" disabled={enviando || !texto.trim() || !configurado}>
              Enviar
            </button>
          </form>
        </section>
      )}
    </>
  );
}

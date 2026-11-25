import { useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_PROYECTO, deInputFecha, paraInputFecha } from '../utils/formatos.js';
import { Campo, MensajeError, Modal } from './Elementos.jsx';

function estadoInicial(proyecto, usuarioConectado) {
  return {
    nombre: proyecto?.nombre || '',
    cliente: proyecto?.cliente || '',
    descripcion: proyecto?.descripcion || '',
    status: proyecto?.status || 'planificacion',
    fechaInicio: paraInputFecha(proyecto?.fechaInicio),
    plazo: paraInputFecha(proyecto?.plazo),
    responsable: proyecto?.responsable?._id || proyecto?.responsable || usuarioConectado?._id || '',
    clienteNombre: proyecto?.responsableCliente?.nombre || '',
    clienteEmail: proyecto?.responsableCliente?.email || '',
    clienteCargo: proyecto?.responsableCliente?.cargo || '',
    integrantes: (proyecto?.integrantes || []).map((i) => ({
      usuario: i.usuario?._id || i.usuario,
      funcion: i.funcion || '',
    })),
  };
}

export default function FormProyecto({ abierto, alCerrar, proyecto, alGuardar }) {
  const { usuario } = useAuth();
  const [form, setForm] = useState(() => estadoInicial(proyecto, usuario));
  const [opciones, setOpciones] = useState([]);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setForm(estadoInicial(proyecto, usuario));
    setError(null);
    api.get('/usuarios/opciones').then(setOpciones).catch(setError);
  }, [abierto, proyecto, usuario]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const cambiarIntegrante = (indice, campo, valor) =>
    setForm((f) => {
      const integrantes = [...f.integrantes];
      integrantes[indice] = { ...integrantes[indice], [campo]: valor };
      if (campo === 'usuario' && !integrantes[indice].funcion) {
        integrantes[indice].funcion = opciones.find((o) => o._id === valor)?.funcion || '';
      }
      return { ...f, integrantes };
    });

  const anadirIntegrante = () => setForm((f) => ({ ...f, integrantes: [...f.integrantes, { usuario: '', funcion: '' }] }));
  const quitarIntegrante = (indice) =>
    setForm((f) => ({ ...f, integrantes: f.integrantes.filter((_, i) => i !== indice) }));

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const { clienteNombre, clienteEmail, clienteCargo, ...resto } = form;
      const cuerpo = {
        ...resto,
        responsableCliente: { nombre: clienteNombre, email: clienteEmail, cargo: clienteCargo },
        fechaInicio: deInputFecha(form.fechaInicio),
        plazo: deInputFecha(form.plazo),
        integrantes: form.integrantes.filter((i) => i.usuario),
      };
      const guardado = proyecto?._id
        ? await api.patch(`/proyectos/${proyecto._id}`, cuerpo)
        : await api.post('/proyectos', cuerpo);
      alGuardar(guardado);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const elegidos = new Set(form.integrantes.map((i) => i.usuario));

  return (
    <Modal titulo={proyecto?._id ? 'Editar proyecto' : 'Nuevo proyecto'} abierto={abierto} alCerrar={alCerrar} anchura={680}>
      <form onSubmit={enviar} className="formulario">
        <Campo rotulo="Nombre del proyecto / plataforma">
          <input value={form.nombre} onChange={cambiar('nombre')} required maxLength={150} autoFocus />
        </Campo>
        <div className="cuadricula-2">
          <Campo rotulo="Cliente / empresa">
            <input value={form.cliente} onChange={cambiar('cliente')} maxLength={150} />
          </Campo>
          <Campo rotulo="Estado">
            <select value={form.status} onChange={cambiar('status')}>
              {Object.entries(STATUS_PROYECTO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Descripción">
          <textarea rows={3} value={form.descripcion} onChange={cambiar('descripcion')} maxLength={5000} />
        </Campo>
        <div className="cuadricula-3">
          <Campo rotulo="Responsable Awakelab">
            <select value={form.responsable} onChange={cambiar('responsable')} required>
              {opciones.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Inicio">
            <input type="date" value={form.fechaInicio} onChange={cambiar('fechaInicio')} />
          </Campo>
          <Campo rotulo="Plazo">
            <input type="date" value={form.plazo} onChange={cambiar('plazo')} />
          </Campo>
        </div>

        <div className="seccion-form">
          <h3>Responsable del lado del cliente</h3>
          <p className="texto-suave">Recibe el acuerdo de especificaciones por e-mail y lo acepta con el botón "Acepto".</p>
          <div className="cuadricula-3">
            <Campo rotulo="Nombre">
              <input value={form.clienteNombre} onChange={cambiar('clienteNombre')} maxLength={120} />
            </Campo>
            <Campo rotulo="E-mail">
              <input type="email" value={form.clienteEmail} onChange={cambiar('clienteEmail')} />
            </Campo>
            <Campo rotulo="Cargo">
              <input value={form.clienteCargo} onChange={cambiar('clienteCargo')} maxLength={120} />
            </Campo>
          </div>
        </div>

        <div className="seccion-form">
          <div className="seccion-form-cabecera">
            <h3>Integrantes de Awakelab</h3>
            <button type="button" className="boton boton-secundario" onClick={anadirIntegrante}>
              + Añadir
            </button>
          </div>
          {form.integrantes.length === 0 && <p className="texto-suave">Aún no hay integrantes.</p>}
          {form.integrantes.map((i, indice) => (
            <div className="linea-integrante" key={indice}>
              <select value={i.usuario} onChange={(e) => cambiarIntegrante(indice, 'usuario', e.target.value)} aria-label="Persona">
                <option value="">Elige a la persona…</option>
                {opciones
                  .filter((o) => o._id === i.usuario || !elegidos.has(o._id))
                  .map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.nombre}
                    </option>
                  ))}
              </select>
              <input
                placeholder="Función en el proyecto"
                value={i.funcion}
                onChange={(e) => cambiarIntegrante(indice, 'funcion', e.target.value)}
                aria-label="Función"
                maxLength={80}
              />
              <button type="button" className="boton-icono" onClick={() => quitarIntegrante(indice)} aria-label="Quitar integrante">
                ×
              </button>
            </div>
          ))}
        </div>

        <MensajeError error={error} />
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="boton" disabled={guardando || opciones.length === 0}>
            {opciones.length === 0 ? 'Cargando…' : guardando ? 'Guardando…' : 'Guardar proyecto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

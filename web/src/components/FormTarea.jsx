import { useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { LADOS, PRIORIDADES, STATUS_TAREA, deInputFecha, paraInputFecha } from '../utils/formatos.js';
import { Campo, MensajeError, Modal } from './Elementos.jsx';

// Personas que pueden recibir tareas: integrantes + responsable del proyecto.
export function personasDelProyecto(proyecto) {
  if (!proyecto) return [];
  const mapa = new Map();
  if (proyecto.responsable?._id) mapa.set(proyecto.responsable._id, proyecto.responsable.nombre);
  proyecto.integrantes.forEach((i) => i.usuario?._id && mapa.set(i.usuario._id, i.usuario.nombre));
  return [...mapa.entries()].map(([_id, nombre]) => ({ _id, nombre }));
}

function estadoInicial(tarea, statusInicial, hitoInicial) {
  return {
    titulo: tarea?.titulo || '',
    lado: tarea?.lado || 'awakelab',
    hito: tarea?.hito?._id || tarea?.hito || hitoInicial || '',
    responsableExterno: tarea?.responsableExterno || '',
    descripcion: tarea?.descripcion || '',
    responsable: tarea?.responsable?._id || tarea?.responsable || '',
    prioridad: tarea?.prioridad || 'media',
    status: tarea?.status || statusInicial || 'por_hacer',
    plazo: paraInputFecha(tarea?.plazo),
    horasEstimadas: tarea?.horasEstimadas ?? '',
  };
}

export default function FormTarea({ abierto, alCerrar, proyecto, tarea, statusInicial, hitoInicial, hitos = [], alGuardar }) {
  const [form, setForm] = useState(() => estadoInicial(tarea, statusInicial, hitoInicial));
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setForm(estadoInicial(tarea, statusInicial, hitoInicial));
    setError(null);
  }, [abierto, tarea, statusInicial, hitoInicial]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const personas = personasDelProyecto(proyecto);

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const delCliente = form.lado === 'cliente';
      const cuerpo = {
        ...form,
        plazo: deInputFecha(form.plazo),
        hito: form.hito || null,
        responsable: delCliente ? null : form.responsable || null,
        responsableExterno: delCliente ? form.responsableExterno : '',
        horasEstimadas: form.horasEstimadas === '' ? 0 : Number(form.horasEstimadas),
      };
      const guardada = tarea?._id
        ? await api.patch(`/tareas/${tarea._id}`, cuerpo)
        : await api.post(`/proyectos/${proyecto._id}/tareas`, cuerpo);
      alGuardar(guardada);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={tarea?._id ? 'Editar tarea' : 'Nueva tarea'} abierto={abierto} alCerrar={alCerrar} anchura={620}>
      <form onSubmit={enviar} className="formulario">
        <Campo rotulo="Título">
          <input value={form.titulo} onChange={cambiar('titulo')} required maxLength={200} autoFocus />
        </Campo>
        <Campo rotulo="Descripción">
          <textarea rows={3} value={form.descripcion} onChange={cambiar('descripcion')} maxLength={5000} />
        </Campo>
        <div className="cuadricula-2">
          <Campo rotulo="Hito">
            <select value={form.hito} onChange={cambiar('hito')}>
              <option value="">Sin hito</option>
              {hitos.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.titulo}
                </option>
              ))}
            </select>
          </Campo>
          <fieldset className="campo eleccion-lado">
            <legend className="campo-rotulo">De quién es la tarea</legend>
            <div className="grupo-botones">
              {Object.entries(LADOS).map(([v, r]) => (
                <label key={v} className={`opcion-lado${form.lado === v ? ' activa' : ''}`}>
                  <input type="radio" name="lado" value={v} checked={form.lado === v} onChange={cambiar('lado')} />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="cuadricula-2">
          {form.lado === 'cliente' ? (
            <Campo rotulo="Responsable en el cliente (opcional)">
              <input
                value={form.responsableExterno}
                onChange={cambiar('responsableExterno')}
                placeholder={proyecto?.responsableCliente?.nombre || 'Nombre de la persona del cliente'}
                maxLength={120}
              />
            </Campo>
          ) : (
            <Campo rotulo="Responsable (opcional)">
              <select value={form.responsable} onChange={cambiar('responsable')}>
                <option value="">Sin responsable</option>
                {personas.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Prioridad">
            <select value={form.prioridad} onChange={cambiar('prioridad')}>
              {Object.entries(PRIORIDADES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="cuadricula-3">
          <Campo rotulo="Estado">
            <select value={form.status} onChange={cambiar('status')}>
              {Object.entries(STATUS_TAREA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Plazo">
            <input type="date" value={form.plazo} onChange={cambiar('plazo')} />
          </Campo>
          <Campo rotulo="Horas estimadas">
            <input type="number" min="0" step="0.5" value={form.horasEstimadas} onChange={cambiar('horasEstimadas')} />
          </Campo>
        </div>
        <MensajeError error={error} />
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="boton" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar tarea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_TAREA, formatearFecha, formatearFechaHora, formatearHoras } from '../utils/formatos.js';
import { Campo, MensajeError, Modal, SelloAtrasada, SelloLado, SelloPrioridad, SelloStatusTarea } from './Elementos.jsx';

function describirHistorial(h) {
  const d = h.detalles || {};
  switch (h.accion) {
    case 'creo':
      return 'creó la tarea';
    case 'status':
      return `cambió el estado de "${STATUS_TAREA[d.de] || d.de}" a "${STATUS_TAREA[d.para] || d.para}"`;
    case 'horas':
      return `registró ${formatearHoras(d.horas)}${d.nota ? ` — ${d.nota}` : ''}`;
    case 'edito':
      return `editó ${d.campos?.length ? d.campos.join(', ') : 'la tarea'}`;
    default:
      return h.accion;
  }
}

export default function DetalleTarea({ idTarea, alCerrar, alCambiar, alEditar, alEliminar }) {
  const { usuario, esAdmin } = useAuth();
  const [tarea, setTarea] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [horas, setHoras] = useState({ horas: '', nota: '' });
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    if (!idTarea) return;
    try {
      const [t, h] = await Promise.all([api.get(`/tareas/${idTarea}`), api.get(`/tareas/${idTarea}/historial?limite=50`)]);
      setTarea(t);
      setHistorial(h.items);
    } catch (err) {
      setError(err);
    }
  }, [idTarea]);

  useEffect(() => {
    setTarea(null);
    setHistorial([]);
    setError(null);
    setHoras({ horas: '', nota: '' });
    cargar();
  }, [cargar]);

  const esMi = tarea?.responsable && String(tarea.responsable._id || tarea.responsable) === String(usuario?._id);
  const puedeActualizar = esAdmin || esMi;

  const ejecutar = async (fn) => {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
      alCambiar?.();
    } catch (err) {
      setError(err);
    } finally {
      setOcupado(false);
    }
  };

  const cambiarStatus = (status) => ejecutar(() => api.patch(`/tareas/${idTarea}/status`, { status }));

  const registrarHoras = (e) => {
    e.preventDefault();
    ejecutar(async () => {
      await api.post(`/tareas/${idTarea}/horas`, { horas: Number(String(horas.horas).replace(',', '.')), nota: horas.nota });
      setHoras({ horas: '', nota: '' });
    });
  };

  const eliminar = () => {
    if (!window.confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return;
    setOcupado(true);
    api
      .del(`/tareas/${idTarea}`)
      .then(() => alEliminar?.())
      .catch(setError)
      .finally(() => setOcupado(false));
  };

  return (
    <Modal titulo={tarea?.titulo || 'Tarea'} abierto={Boolean(idTarea)} alCerrar={alCerrar} anchura={640}>
      <MensajeError error={error} />
      {!tarea && !error && <p className="texto-suave">Cargando…</p>}
      {tarea && (
        <div className="detalle-tarea">
          <div className="sellos">
            <SelloLado lado={tarea.lado} />
            <SelloStatusTarea status={tarea.status} />
            <SelloPrioridad prioridad={tarea.prioridad} />
            {tarea.atrasada && <SelloAtrasada />}
          </div>
          {tarea.descripcion && <p className="descripcion">{tarea.descripcion}</p>}

          <dl className="lista-datos">
            <div>
              <dt>Hito</dt>
              <dd>{tarea.hito?.titulo || 'Sin hito'}</dd>
            </div>
            <div>
              <dt>Responsable</dt>
              <dd>
                {tarea.lado === 'cliente'
                  ? `${tarea.responsableExterno || 'Cliente'} (cliente)`
                  : tarea.responsable?.nombre || 'Sin responsable'}
              </dd>
            </div>
            <div>
              <dt>Plazo</dt>
              <dd>{formatearFecha(tarea.plazo)}</dd>
            </div>
            <div>
              <dt>Horas</dt>
              <dd>
                {formatearHoras(tarea.horasGastadas)} de {formatearHoras(tarea.horasEstimadas)}
              </dd>
            </div>
            {tarea.completadaEn && (
              <div>
                <dt>Completada el</dt>
                <dd>{formatearFecha(tarea.completadaEn)}</dd>
              </div>
            )}
          </dl>

          {puedeActualizar && (
            <div className="bloque">
              <h3>Actualizar estado</h3>
              <div className="grupo-botones">
                {Object.entries(STATUS_TAREA).map(([v, r]) => (
                  <button
                    key={v}
                    type="button"
                    className={`boton ${tarea.status === v ? 'boton-seleccionado' : 'boton-secundario'}`}
                    aria-pressed={tarea.status === v}
                    disabled={ocupado || tarea.status === v}
                    onClick={() => cambiarStatus(v)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <h3>Registrar horas trabajadas</h3>
              <form className="form-horas" onSubmit={registrarHoras}>
                <Campo rotulo="Horas">
                  <input
                    inputMode="decimal"
                    placeholder="P. ej.: 1,5"
                    value={horas.horas}
                    onChange={(e) => setHoras({ ...horas, horas: e.target.value })}
                    required
                  />
                </Campo>
                <Campo rotulo="Lo que se hizo (opcional)">
                  <input value={horas.nota} maxLength={500} onChange={(e) => setHoras({ ...horas, nota: e.target.value })} />
                </Campo>
                <button type="submit" className="boton" disabled={ocupado}>
                  Registrar
                </button>
              </form>
            </div>
          )}

          {!puedeActualizar && (
            <p className="texto-suave">
              {tarea.lado === 'cliente'
                ? 'Tarea del cliente: la actualiza un administrador.'
                : 'Solo el responsable de la tarea o un administrador puede actualizarla.'}
            </p>
          )}

          <div className="bloque">
            <h3>Historial</h3>
            {historial.length === 0 && <p className="texto-suave">Sin registros.</p>}
            <ul className="historial">
              {historial.map((h) => (
                <li key={h._id}>
                  <strong>{h.usuario?.nombre || 'Alguien'}</strong> {describirHistorial(h)}
                  <time>{formatearFechaHora(h.createdAt)}</time>
                </li>
              ))}
            </ul>
          </div>

          {esAdmin && (
            <div className="acciones">
              <button type="button" className="boton boton-peligro" onClick={eliminar} disabled={ocupado}>
                Eliminar
              </button>
              <button type="button" className="boton boton-secundario" onClick={() => alEditar(tarea)}>
                Editar tarea
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

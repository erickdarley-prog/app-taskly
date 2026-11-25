// Vista lineal por hito: etapa a etapa, con fechas, estado y las tareas de cada una.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Campo, MensajeError, Modal, Progreso, SelloAtrasada, SelloLado, SelloStatusHito, SelloStatusTarea } from '../Elementos.jsx';
import { deInputFecha, formatearFecha, formatearDiaMes, paraInputFecha } from '../../utils/formatos.js';

function FormHito({ abierto, hito, idProyecto, alCerrar, alGuardar }) {
  const [form, setForm] = useState({ titulo: '', descripcion: '', fechaInicio: '', fechaFin: '' });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setForm({
      titulo: hito?.titulo || '',
      descripcion: hito?.descripcion || '',
      fechaInicio: paraInputFecha(hito?.fechaInicio),
      fechaFin: paraInputFecha(hito?.fechaFin),
    });
  }, [abierto, hito]);

  const cambiar = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = { ...form, fechaInicio: deInputFecha(form.fechaInicio), fechaFin: deInputFecha(form.fechaFin) };
      if (hito?._id) await api.patch(`/hitos/${hito._id}`, cuerpo);
      else await api.post(`/proyectos/${idProyecto}/hitos`, cuerpo);
      alGuardar();
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={hito?._id ? 'Editar hito' : 'Nuevo hito'} abierto={abierto} alCerrar={alCerrar} anchura={540}>
      <form className="formulario" onSubmit={enviar}>
        <Campo rotulo="Nombre del hito" pista='P. ej.: "Recopilar información", "Crear dominios", "Propuesta gráfica"'>
          <input value={form.titulo} onChange={cambiar('titulo')} required maxLength={200} autoFocus />
        </Campo>
        <Campo rotulo="Descripción (opcional)">
          <textarea rows={2} value={form.descripcion} onChange={cambiar('descripcion')} maxLength={5000} />
        </Campo>
        <div className="cuadricula-2">
          <Campo rotulo="Inicio aproximado">
            <input type="date" value={form.fechaInicio} onChange={cambiar('fechaInicio')} />
          </Campo>
          <Campo rotulo="Entrega aproximada">
            <input type="date" value={form.fechaFin} onChange={cambiar('fechaFin')} />
          </Campo>
        </div>
        <MensajeError error={error} />
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="boton" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar hito'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LineaTarea({ tarea, alAbrir }) {
  const quien = tarea.lado === 'cliente' ? tarea.responsableExterno || 'Cliente' : tarea.responsable?.nombre || 'Sin responsable';
  return (
    <li>
      <button type="button" className={`linea-tarea status-${tarea.status}`} onClick={() => alAbrir(tarea._id)}>
        <span className="linea-tarea-marca" aria-hidden="true" />
        <span className="linea-tarea-titulo">{tarea.titulo}</span>
        <span className="linea-tarea-info">
          <SelloLado lado={tarea.lado} />
          <span className="texto-suave">{quien}</span>
          <span className="texto-suave">{tarea.plazo ? formatearFecha(tarea.plazo) : 'Sin plazo'}</span>
          <SelloStatusTarea status={tarea.status} />
          {tarea.atrasada && <SelloAtrasada />}
        </span>
      </button>
    </li>
  );
}

export default function VistaHitos({ proyecto, version, alAbrirTarea, alNuevaTarea, alCambiar }) {
  const { esAdmin } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [formHito, setFormHito] = useState(null); // null | {} | marco
  const [filtroLado, setFiltroLado] = useState('');

  const cargar = useCallback(() => {
    api
      .get(`/proyectos/${proyecto._id}/hitos?conTareas=true`)
      .then(setDatos)
      .catch(setError);
  }, [proyecto._id]);

  useEffect(cargar, [cargar, version]);

  const eliminar = async (m) => {
    if (!window.confirm(`¿Eliminar el hito "${m.titulo}"? Sus tareas no se borran: quedan "sin hito".`)) return;
    try {
      await api.del(`/hitos/${m._id}`);
      alCambiar();
    } catch (e) {
      setError(e);
    }
  };

  if (!datos) return error ? <MensajeError error={error} /> : <p className="texto-suave">Cargando hitos…</p>;

  const filtrar = (tareas) => (filtroLado ? tareas.filter((t) => t.lado === filtroLado) : tareas);
  const grupos = [...datos.hitos];
  if (datos.sinHito?.tareas?.length) {
    grupos.push({ _id: 'sin', titulo: 'Tareas sin hito', sinHito: true, tareas: datos.sinHito.tareas });
  }

  return (
    <div className="vista-hitos">
      <MensajeError error={error} />
      <div className="filtros">
        <div className="grupo-botones" role="group" aria-label="Filtrar tareas por lado">
          {[
            ['', 'Todas'],
            ['awakelab', 'Awakelab'],
            ['cliente', 'Cliente'],
          ].map(([v, r]) => (
            <button
              key={v || 'todas'}
              type="button"
              className={`boton ${filtroLado === v ? 'boton-seleccionado' : 'boton-secundario'}`}
              aria-pressed={filtroLado === v}
              onClick={() => setFiltroLado(v)}
            >
              {r}
            </button>
          ))}
        </div>
        {esAdmin && (
          <button type="button" className="boton" onClick={() => setFormHito({})}>
            + Nuevo hito
          </button>
        )}
      </div>

      {grupos.length === 0 && (
        <div className="estado-vacio">
          Este proyecto aún no tiene hitos.{' '}
          {esAdmin ? 'Crea el primero, por ejemplo "Recopilar información".' : 'El administrador los creará.'}
        </div>
      )}

      <ol className="linea-hitos">
        {grupos.map((m, i) => {
          const tareas = filtrar(m.tareas || []);
          return (
            <li key={m._id} id={`hito-${m._id}`} className={`hito hito-${m.sinHito ? 'sin' : m.status}${m.atrasado ? ' hito-atrasado' : ''}`}>
              <div className="hito-carril" aria-hidden="true">
                <span className="hito-punto">{m.sinHito ? '·' : m.status === 'completado' ? '✓' : i + 1}</span>
              </div>
              <div className="hito-tarjeta">
                <header className="hito-cabecera">
                  <div>
                    <h3>{m.titulo}</h3>
                    {!m.sinHito && (
                      <p className="hito-fechas">
                        {formatearDiaMes(m.fechaInicio)} → {formatearDiaMes(m.fechaFin)}
                        {m.descripcion && <span className="texto-suave"> · {m.descripcion}</span>}
                      </p>
                    )}
                  </div>
                  {!m.sinHito && (
                    <div className="hito-estado">
                      <SelloStatusHito status={m.status} />
                      {m.atrasado && <SelloAtrasada texto="Entrega vencida" />}
                    </div>
                  )}
                </header>
                {!m.sinHito && (
                  <div className="hito-progreso">
                    <Progreso valor={m.porcentaje} />
                    <span className="texto-suave">
                      {m.completadas}/{m.total} tareas · {m.deAwakelab} Awakelab · {m.delCliente} cliente
                    </span>
                  </div>
                )}
                {tareas.length > 0 ? (
                  <ul className="hito-tareas">
                    {tareas.map((t) => (
                      <LineaTarea key={t._id} tarea={t} alAbrir={alAbrirTarea} />
                    ))}
                  </ul>
                ) : (
                  <p className="texto-suave">{filtroLado ? 'Ninguna tarea de este lado.' : 'Ninguna tarea en este hito.'}</p>
                )}
                {esAdmin && !m.sinHito && (
                  <div className="hito-acciones">
                    <button type="button" className="boton boton-fantasma" onClick={() => alNuevaTarea(m._id)}>
                      + Tarea
                    </button>
                    <button type="button" className="boton boton-fantasma" onClick={() => setFormHito(m)}>
                      Editar hito
                    </button>
                    <button type="button" className="boton boton-peligro-fantasma" onClick={() => eliminar(m)}>
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <FormHito
        abierto={Boolean(formHito)}
        hito={formHito}
        idProyecto={proyecto._id}
        alCerrar={() => setFormHito(null)}
        alGuardar={() => {
          setFormHito(null);
          alCambiar();
        }}
      />
    </div>
  );
}

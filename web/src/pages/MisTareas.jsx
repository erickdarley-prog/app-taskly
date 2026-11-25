import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, montarQuery } from '../api/cliente.js';
import {
  Cargando,
  MensajeError,
  Paginacion,
  SelloAtrasada,
  SelloPrioridad,
  SelloStatusTarea,
  Vacio,
} from '../components/Elementos.jsx';
import DetalleTarea from '../components/DetalleTarea.jsx';
import { formatearFecha, formatearHoras } from '../utils/formatos.js';
import { useAlModificarDatos } from '../utils/eventos.js';

const FILTROS = [
  { valor: 'abiertas', rotulo: 'Abiertas' },
  { valor: 'por_hacer', rotulo: 'Por hacer' },
  { valor: 'en_curso', rotulo: 'En curso' },
  { valor: 'completada', rotulo: 'Completadas' },
  { valor: '', rotulo: 'Todas' },
];

export default function MisTareas() {
  const [status, setStatus] = useState('abiertas');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [tareaAbierta, setTareaAbierta] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    api
      .get(`/tareas/mis${montarQuery({ status, pagina, limite: 30 })}`)
      .then(setDatos)
      .catch(setError);
  }, [status, pagina]);

  useEffect(cargar, [cargar]);
  useAlModificarDatos(cargar);

  return (
    <div className="pagina">
      <div className="pagina-cabecera">
        <div>
          <h1>Mis tareas</h1>
          <p className="texto-suave">Todo lo que tienes asignado, en todos los proyectos. Haz clic en una tarea para actualizar el estado o registrar horas.</p>
        </div>
      </div>

      <div className="pestanas" role="tablist">
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todas'}
            type="button"
            role="tab"
            aria-selected={status === f.valor}
            className={status === f.valor ? 'activa' : ''}
            onClick={() => {
              setStatus(f.valor);
              setPagina(1);
            }}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <MensajeError error={error} />
      {!datos && !error && <Cargando />}
      {datos && datos.items.length === 0 && <Vacio>Ninguna tarea aquí.</Vacio>}

      {datos && datos.items.length > 0 && (
        <div className="tabla-desplazamiento">
          <table className="tabla tabla-clicable">
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Proyecto</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Plazo</th>
                <th>Horas</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((t) => (
                <tr key={t._id} onClick={() => setTareaAbierta(t._id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setTareaAbierta(t._id)}>
                  <td>
                    <strong>{t.titulo}</strong> {t.atrasada && <SelloAtrasada />}
                  </td>
                  <td>
                    {t.proyecto ? (
                      <Link to={`/proyectos/${t.proyecto._id}`} onClick={(e) => e.stopPropagation()}>
                        {t.proyecto.nombre}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <SelloStatusTarea status={t.status} />
                  </td>
                  <td>
                    <SelloPrioridad prioridad={t.prioridad} />
                  </td>
                  <td>{formatearFecha(t.plazo)}</td>
                  <td>
                    {formatearHoras(t.horasGastadas)} / {formatearHoras(t.horasEstimadas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && <Paginacion pagina={datos.pagina} paginas={datos.paginas} alCambiar={setPagina} />}

      <DetalleTarea
        idTarea={tareaAbierta}
        alCerrar={() => setTareaAbierta(null)}
        alCambiar={cargar}
        alEditar={() => setTareaAbierta(null)}
        alEliminar={() => {
          setTareaAbierta(null);
          cargar();
        }}
      />
    </div>
  );
}

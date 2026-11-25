import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, montarQuery } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Cargando, MensajeError, Paginacion, Progreso, SelloStatusProyecto, Vacio } from '../components/Elementos.jsx';
import FormProyecto from '../components/FormProyecto.jsx';
import { STATUS_PROYECTO, formatearFecha } from '../utils/formatos.js';
import { useAlModificarDatos } from '../utils/eventos.js';

export default function Proyectos() {
  const { esAdmin } = useAuth();
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState({ busqueda: '', status: '', pagina: 1 });
  const [busquedaEscrita, setBusquedaEscrita] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [params, setParams] = useSearchParams();

  // El menú "Nuevo proyecto" llega aquí con ?nuevo=1
  useEffect(() => {
    if (params.get('nuevo') === '1') {
      if (esAdmin) setFormAbierto(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, esAdmin]);

  const cargar = useCallback(() => {
    setError(null);
    api
      .get(`/proyectos${montarQuery(filtros)}`)
      .then(setDatos)
      .catch(setError);
  }, [filtros]);

  useEffect(cargar, [cargar]);
  useAlModificarDatos(cargar);

  // Espera a que el usuario deje de escribir antes de buscar.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.busqueda === busquedaEscrita ? f : { ...f, busqueda: busquedaEscrita, pagina: 1 })), 350);
    return () => clearTimeout(t);
  }, [busquedaEscrita]);

  return (
    <div className="pagina">
      <div className="pagina-cabecera">
        <div>
          <h1>Proyectos</h1>
          <p className="texto-suave">{esAdmin ? 'Todos los proyectos' : 'Proyectos en los que participas'}</p>
        </div>
        {esAdmin && (
          <button type="button" className="boton" onClick={() => setFormAbierto(true)}>
            + Nuevo proyecto
          </button>
        )}
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nombre o cliente…"
          value={busquedaEscrita}
          onChange={(e) => setBusquedaEscrita(e.target.value)}
          aria-label="Buscar proyectos"
        />
        <select
          value={filtros.status}
          onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value, pagina: 1 }))}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_PROYECTO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <MensajeError error={error} />
      {!datos && !error && <Cargando />}
      {datos && datos.items.length === 0 && (
        <Vacio>{esAdmin ? 'No se ha encontrado ningún proyecto. ¡Crea el primero!' : 'Aún no participas en ningún proyecto.'}</Vacio>
      )}

      {datos && datos.items.length > 0 && (
        <div className="cuadricula-tarjetas">
          {datos.items.map((p) => (
            <Link key={p._id} to={`/proyectos/${p._id}`} className="tarjeta tarjeta-proyecto">
              <div className="tarjeta-proyecto-cabecera">
                <SelloStatusProyecto status={p.status} />
                {p.resumen.atrasadas > 0 && <span className="aviso-retraso">{p.resumen.atrasadas} atrasada(s)</span>}
              </div>
              <h2>{p.nombre}</h2>
              {p.cliente && <p className="texto-suave">{p.cliente}</p>}
              <Progreso valor={p.resumen.porcentaje} />
              <dl className="tarjeta-datos">
                <div>
                  <dt>Tareas</dt>
                  <dd>
                    {p.resumen.completadas}/{p.resumen.total}
                  </dd>
                </div>
                <div>
                  <dt>Equipo</dt>
                  <dd>{p.totalIntegrantes}</dd>
                </div>
                <div>
                  <dt>Plazo</dt>
                  <dd>{formatearFecha(p.plazo)}</dd>
                </div>
              </dl>
              <p className="tarjeta-pie">Responsable: {p.responsable?.nombre || '—'}</p>
            </Link>
          ))}
        </div>
      )}

      {datos && <Paginacion pagina={datos.pagina} paginas={datos.paginas} alCambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />}

      {esAdmin && (
        <FormProyecto
          abierto={formAbierto}
          alCerrar={() => setFormAbierto(false)}
          alGuardar={(nuevo) => {
            setFormAbierto(false);
            navegar(`/proyectos/${nuevo._id}`);
          }}
        />
      )}
    </div>
  );
}

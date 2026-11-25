import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, montarQuery } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Avatar,
  Cargando,
  MensajeError,
  Progreso,
  SelloAtrasada,
  SelloLado,
  SelloPrioridad,
  SelloStatusProyecto,
} from '../components/Elementos.jsx';
import FormProyecto from '../components/FormProyecto.jsx';
import FormTarea, { personasDelProyecto } from '../components/FormTarea.jsx';
import DetalleTarea from '../components/DetalleTarea.jsx';
import VistaHitos from '../components/proyecto/VistaHitos.jsx';
import AlcanceAcuerdo from '../components/proyecto/AlcanceAcuerdo.jsx';
import Diario from '../components/proyecto/Diario.jsx';
import { PRIORIDADES, STATUS_TAREA, formatearFecha, formatearHoras, formatearHorasPar } from '../utils/formatos.js';
import { useAlModificarDatos } from '../utils/eventos.js';
import Portada, { Anillo, ChipPortada } from '../components/Portada.jsx';
import Cronograma from '../components/proyecto/Cronograma.jsx';
import Adjuntos from '../components/proyecto/Adjuntos.jsx';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  FileSignature,
  Flag,
  KanbanSquare,
  ListChecks,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

const POR_COLUMNA = 30;

export default function ProyectoDetalle() {
  const { id } = useParams();
  const { esAdmin } = useAuth();
  const navegar = useNavigate();

  const [proyecto, setProyecto] = useState(null);
  const [avance, setAvance] = useState(null);
  const [hitos, setHitos] = useState([]);
  const [acuerdo, setAcuerdo] = useState(null);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState('hitos');
  const [version, setVersion] = useState(0); // cambia para recargar el tablero y el avance
  const [filtros, setFiltros] = useState({ responsable: '', prioridad: '', busqueda: '' });

  const [formProyectoAbierto, setFormProyectoAbierto] = useState(false);
  const [formTarea, setFormTarea] = useState(null); // { tarea?, statusInicial? }
  const [tareaAbierta, setTareaAbierta] = useState(null);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  useAlModificarDatos(recargar);

  useEffect(() => {
    setError(null);
    Promise.all([
      api.get(`/proyectos/${id}`),
      api.get(`/proyectos/${id}/avance`),
      api.get(`/proyectos/${id}/hitos`),
      api.get(`/proyectos/${id}/acuerdos`).catch(() => null),
    ])
      .then(([p, a, m, ac]) => {
        setProyecto(p);
        setAvance(a);
        setHitos(m.hitos);
        setAcuerdo(ac);
      })
      .catch(setError);
  }, [id, version]);

  const eliminarProyecto = async () => {
    if (!window.confirm(`¿Eliminar el proyecto "${proyecto.nombre}" y todas sus tareas? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`/proyectos/${id}`);
      navegar('/proyectos', { replace: true });
    } catch (err) {
      setError(err);
    }
  };

  if (error && !proyecto) {
    return (
      <div className="pagina">
        <Link to="/proyectos" className="volver">
          <ArrowLeft size={16} /> Proyectos
        </Link>
        <MensajeError error={error} />
      </div>
    );
  }
  if (!proyecto || !avance) return <Cargando />;

  const g = avance.general;
  const personas = personasDelProyecto(proyecto);

  const rc = proyecto.responsableCliente;
  const hitosCompletados = hitos.filter((m) => m.status === 'completado').length;
  const textoAcuerdo = acuerdo?.enCurso?.status === 'esperando'
    ? 'pendiente de firma'
    : acuerdo?.vigente
      ? `firmado · v${acuerdo.vigente.version}`
      : acuerdo?.enCurso
        ? 'en borrador'
        : 'sin definir';

  const abrirHito = (idHito) => {
    setPestana('hitos');
    setTimeout(() => document.getElementById(`hito-${idHito}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="pagina">
      <Link to="/proyectos" className="volver">
        <ArrowLeft size={16} /> Proyectos
      </Link>

      <Portada
        etiqueta={`Proyecto${proyecto.cliente ? ` · ${proyecto.cliente}` : ''}`}
        titulo={proyecto.nombre}
        subtitulo={proyecto.descripcion}
        chips={
          <>
            <ChipPortada icono={Flag} valor={`${hitosCompletados}/${hitos.length}`} rotulo="hitos completados" />
            <ChipPortada icono={AlertTriangle} valor={g.atrasadas} rotulo="tareas atrasadas" alerta={g.atrasadas > 0} />
            <ChipPortada icono={FileSignature} valor="Alcance" rotulo={textoAcuerdo} alerta={acuerdo?.enCurso?.status === 'esperando'} />
            <ChipPortada icono={CalendarDays} valor={formatearFecha(proyecto.plazo)} rotulo="plazo de entrega" />
          </>
        }
        acciones={
          esAdmin && (
            <>
              <button type="button" className="boton boton-claro" onClick={() => setFormProyectoAbierto(true)}>
                <Pencil size={16} /> Editar proyecto
              </button>
              <button type="button" className="boton boton-contorno-claro" onClick={() => setFormTarea({ statusInicial: 'por_hacer' })}>
                <Plus size={16} /> Nueva tarea
              </button>
              <button type="button" className="boton boton-fantasma-claro" onClick={eliminarProyecto}>
                <Trash2 size={16} /> Eliminar
              </button>
            </>
          )
        }
        lado={
          <div className="portada-resumen">
            <Anillo valor={g.porcentaje} rotulo="completado" />
            <div className="portada-resumen-texto">
              <p>
                <strong>{g.completadas}</strong>
                <span> / {g.total}</span>
              </p>
              <small>tareas completadas</small>
              <dl>
                <div>
                  <dt>Awakelab</dt>
                  <dd>{proyecto.responsable?.nombre || '—'}</dd>
                </div>
                <div>
                  <dt>Cliente</dt>
                  <dd>{rc?.nombre || '—'}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <SelloStatusProyecto status={proyecto.status} />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        }
      />

      <MensajeError error={error} />

      <Cronograma hitos={hitos} alElegir={abrirHito} />

      <div className="pestanas-pildora" role="tablist" aria-label="Partes del proyecto">
        {[
          ['hitos', 'Hitos', ListChecks],
          ['alcance', 'Alcance y acuerdo', FileSignature],
          ['diario', 'Diario', NotebookPen],
          ['adjuntos', 'Adjuntos', Paperclip],
          ['tareas', 'Tablero de tareas', KanbanSquare],
          ['equipo', 'Avance del equipo', Users],
        ].map(([valor, rotulo, Icono]) => (
          <button key={valor} type="button" role="tab" aria-selected={pestana === valor} className={pestana === valor ? 'activa' : ''} onClick={() => setPestana(valor)}>
            <Icono size={16} aria-hidden="true" /> {rotulo}
          </button>
        ))}
      </div>

      {pestana === 'hitos' && (
        <VistaHitos
          proyecto={proyecto}
          version={version}
          alAbrirTarea={setTareaAbierta}
          alNuevaTarea={(hitoInicial) => setFormTarea({ statusInicial: 'por_hacer', hitoInicial })}
          alCambiar={recargar}
        />
      )}
      {pestana === 'alcance' && <AlcanceAcuerdo proyecto={proyecto} version={version} alCambiar={recargar} />}
      {pestana === 'diario' && <Diario proyecto={proyecto} version={version} />}
      {pestana === 'adjuntos' && <Adjuntos proyecto={proyecto} version={version} />}

      {pestana === 'tareas' && (
        <>
          <div className="filtros">
            <input
              type="search"
              placeholder="Buscar tarea…"
              value={filtros.busqueda}
              onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })}
              aria-label="Buscar tarea"
            />
            <select value={filtros.responsable} onChange={(e) => setFiltros({ ...filtros, responsable: e.target.value })} aria-label="Filtrar por responsable">
              <option value="">Todas las personas</option>
              {personas.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.nombre}
                </option>
              ))}
              <option value="sin">Sin responsable</option>
            </select>
            <select value={filtros.prioridad} onChange={(e) => setFiltros({ ...filtros, prioridad: e.target.value })} aria-label="Filtrar por prioridad">
              <option value="">Todas las prioridades</option>
              {Object.entries(PRIORIDADES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            {esAdmin && (
              <button type="button" className="boton" onClick={() => setFormTarea({ statusInicial: 'por_hacer' })}>
                + Nueva tarea
              </button>
            )}
          </div>

          <div className="tablero">
            {Object.entries(STATUS_TAREA).map(([status, rotulo]) => (
              <ColumnaTareas
                key={status}
                idProyecto={id}
                status={status}
                rotulo={rotulo}
                filtros={filtros}
                version={version}
                alAbrir={setTareaAbierta}
              />
            ))}
          </div>
        </>
      )}

      {pestana === 'equipo' && <AvanceEquipo avance={avance} />}

      {esAdmin && (
        <>
          <FormProyecto
            abierto={formProyectoAbierto}
            proyecto={proyecto}
            alCerrar={() => setFormProyectoAbierto(false)}
            alGuardar={() => {
              setFormProyectoAbierto(false);
              recargar();
            }}
          />
          <FormTarea
            abierto={Boolean(formTarea)}
            proyecto={proyecto}
            tarea={formTarea?.tarea}
            statusInicial={formTarea?.statusInicial}
            hitoInicial={formTarea?.hitoInicial}
            hitos={hitos}
            alCerrar={() => setFormTarea(null)}
            alGuardar={() => {
              setFormTarea(null);
              recargar();
            }}
          />
        </>
      )}

      <DetalleTarea
        idTarea={tareaAbierta}
        alCerrar={() => setTareaAbierta(null)}
        alCambiar={recargar}
        alEditar={(t) => {
          setTareaAbierta(null);
          setFormTarea({ tarea: t });
        }}
        alEliminar={() => {
          setTareaAbierta(null);
          recargar();
        }}
      />
    </div>
  );
}

// Cada columna carga sus propias tareas poco a poco ("Cargar más"),
// para que el tablero siga siendo ligero en proyectos con muchas tareas.
function ColumnaTareas({ idProyecto, status, rotulo, filtros, version, alAbrir }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState(filtros.busqueda);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(filtros.busqueda), 300);
    return () => clearTimeout(t);
  }, [filtros.busqueda]);

  const buscar = useCallback(
    (pag) =>
      api.get(
        `/proyectos/${idProyecto}/tareas${montarQuery({
          status,
          responsable: filtros.responsable,
          prioridad: filtros.prioridad,
          busqueda,
          pagina: pag,
          limite: POR_COLUMNA,
        })}`
      ),
    [idProyecto, status, filtros.responsable, filtros.prioridad, busqueda]
  );

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    buscar(1)
      .then((d) => {
        if (!activo) return;
        setItems(d.items);
        setTotal(d.total);
        setPagina(1);
      })
      .catch((e) => activo && setError(e))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [buscar, version]);

  const cargarMas = async () => {
    setCargando(true);
    try {
      const d = await buscar(pagina + 1);
      setItems((actuales) => [...actuales, ...d.items]);
      setTotal(d.total);
      setPagina(pagina + 1);
    } catch (e) {
      setError(e);
    } finally {
      setCargando(false);
    }
  };

  return (
    <section className={`columna columna-${status}`}>
      <header className="columna-cabecera">
        <h2>{rotulo}</h2>
        <span className="contador">{total}</span>
      </header>
      <MensajeError error={error} />
      <div className="columna-lista">
        {items.map((t) => (
          <TarjetaTarea key={t._id} tarea={t} alAbrir={() => alAbrir(t._id)} />
        ))}
        {!cargando && items.length === 0 && <p className="columna-vacia">Ninguna tarea</p>}
        {cargando && items.length === 0 && <p className="columna-vacia">Cargando…</p>}
      </div>
      {items.length < total && (
        <button type="button" className="boton boton-fantasma" onClick={cargarMas} disabled={cargando}>
          Cargar más ({total - items.length})
        </button>
      )}
    </section>
  );
}

function TarjetaTarea({ tarea, alAbrir }) {
  return (
    <button type="button" className={`tarjeta-tarea${tarea.atrasada ? ' atrasada' : ''}`} onClick={alAbrir}>
      <span className="tarjeta-tarea-titulo">{tarea.titulo}</span>
      {tarea.hito?.titulo && <span className="texto-suave tarjeta-tarea-hito">{tarea.hito.titulo}</span>}
      <span className="sellos">
        <SelloLado lado={tarea.lado} />
        <SelloPrioridad prioridad={tarea.prioridad} />
        {tarea.atrasada && <SelloAtrasada />}
      </span>
      <span className="tarjeta-tarea-pie">
        <span className="persona">
          {tarea.lado === 'cliente' ? (
            <span className="texto-suave">{tarea.responsableExterno || 'Cliente'}</span>
          ) : tarea.responsable ? (
            <>
              <Avatar nombre={tarea.responsable.nombre} tamano="pequeno" />
              {tarea.responsable.nombre.split(' ')[0]}
            </>
          ) : (
            <span className="texto-suave">Sin responsable</span>
          )}
        </span>
        <span className="texto-suave">
          {tarea.plazo ? formatearFecha(tarea.plazo) : 'Sin plazo'} · {formatearHorasPar(tarea.horasGastadas, tarea.horasEstimadas)}
        </span>
      </span>
    </button>
  );
}

function AvanceEquipo({ avance }) {
  const { porIntegrante, porPrioridad, sinResponsable } = avance;

  return (
    <div className="avance">
      <p className="nota">
        Esta vista muestra <strong>dónde está el proyecto</strong> y dónde puede necesitar ayuda. No es un ranking: el orden sigue la lista de
        integrantes del proyecto.
      </p>

      {porIntegrante.length === 0 ? (
        <p className="texto-suave">Este proyecto aún no tiene integrantes.</p>
      ) : (
        <div className="tabla-desplazamiento">
          <table className="tabla">
            <thead>
              <tr>
                <th>Integrante</th>
                <th className="col-progreso">Completadas</th>
                <th>En curso</th>
                <th>Por hacer</th>
                <th>Atrasadas</th>
                <th>Horas (gastadas / estimadas)</th>
              </tr>
            </thead>
            <tbody>
              {porIntegrante.map((i) => (
                <tr key={i.usuario._id}>
                  <td>
                    <span className="persona">
                      <Avatar nombre={i.usuario.nombre} />
                      <span>
                        <strong>{i.usuario.nombre}</strong>
                        <small className="texto-suave">{i.funcion}</small>
                      </span>
                    </span>
                  </td>
                  <td className="col-progreso">
                    <span className="texto-suave">
                      {i.completadas} de {i.total}
                    </span>
                    <Progreso valor={i.porcentaje} />
                  </td>
                  <td>{i.enCurso}</td>
                  <td>{i.porHacer}</td>
                  <td>{i.atrasadas > 0 ? <span className="aviso-retraso">{i.atrasadas}</span> : 0}</td>
                  <td>
                    {formatearHoras(i.horasGastadas)} / {formatearHoras(i.horasEstimadas)}
                  </td>
                </tr>
              ))}
              {sinResponsable && (
                <tr className="linea-suave">
                  <td>Sin responsable</td>
                  <td className="col-progreso">
                    <span className="texto-suave">
                      {sinResponsable.completadas} de {sinResponsable.total}
                    </span>
                    <Progreso valor={sinResponsable.porcentaje} />
                  </td>
                  <td>{sinResponsable.enCurso}</td>
                  <td>{sinResponsable.porHacer}</td>
                  <td>{sinResponsable.atrasadas}</td>
                  <td>
                    {formatearHoras(sinResponsable.horasGastadas)} / {formatearHoras(sinResponsable.horasEstimadas)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="subtitulo">Por prioridad</h2>
      <div className="indicadores">
        {Object.keys(PRIORIDADES).map((p) => {
          const d = porPrioridad[p];
          return (
            <div className="indicador" key={p}>
              <span className="indicador-rotulo">
                Prioridad <SelloPrioridad prioridad={p} />
              </span>
              <strong>
                {d.completadas}
                <small>/{d.total}</small>
              </strong>
              <Progreso valor={d.porcentaje} />
              <span className="texto-suave">{d.atrasadas} atrasada(s)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

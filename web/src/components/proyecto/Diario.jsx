// Diario del proyecto: lo que pasó cada día, con observaciones.
import { useCallback, useEffect, useState } from 'react';
import { api, montarQuery } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Campo, MensajeError, Modal } from '../Elementos.jsx';
import { CATEGORIAS_DIARIO, formatearDia, hoyISO } from '../../utils/formatos.js';

const ICONOS = { avance: '▲', observacion: '✎', problema: '!', reunion: '◎', cliente: '✉', tarea: '•' };
const VACIO = () => ({ fecha: hoyISO(), texto: '', categoria: 'avance', hito: '' });

function FormRegistro({ valor, hitos, alCambiar, alEnviar, enviando, rotuloBoton }) {
  const cambiar = (c) => (e) => alCambiar({ ...valor, [c]: e.target.value });
  return (
    <form className="formulario" onSubmit={alEnviar}>
      <Campo rotulo="¿Qué ha pasado? (con observaciones)">
        <textarea
          rows={3}
          value={valor.texto}
          onChange={cambiar('texto')}
          maxLength={5000}
          required
          placeholder="P. ej.: Moodle 4.5 instalado. Obs.: faltaba el certificado SSL, resuelto por la tarde."
        />
      </Campo>
      <div className="cuadricula-3">
        <Campo rotulo="Día">
          <input type="date" value={valor.fecha} max={hoyISO()} onChange={cambiar('fecha')} required />
        </Campo>
        <Campo rotulo="Tipo">
          <select value={valor.categoria} onChange={cambiar('categoria')}>
            {Object.entries(CATEGORIAS_DIARIO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Hito (opcional)">
          <select value={valor.hito} onChange={cambiar('hito')}>
            <option value="">—</option>
            {hitos.map((m) => (
              <option key={m._id} value={m._id}>
                {m.titulo}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="acciones">
        <button type="submit" className="boton" disabled={enviando || !valor.texto.trim()}>
          {enviando ? 'Guardando…' : rotuloBoton}
        </button>
      </div>
    </form>
  );
}

export default function Diario({ proyecto, version }) {
  const { usuario, esAdmin } = useAuth();
  const [hitos, setHitos] = useState([]);
  const [dias, setDias] = useState([]);
  const [anterior, setAnterior] = useState(null);
  const [automaticos, setAutomaticos] = useState(true);
  const [nuevo, setNuevo] = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);

  const buscar = useCallback(
    (hasta) => api.get(`/proyectos/${proyecto._id}/diario${montarQuery({ hasta, dias: 30, automaticos: automaticos ? undefined : 'false' })}`),
    [proyecto._id, automaticos]
  );

  const cargar = useCallback(() => {
    setCargando(true);
    buscar()
      .then((d) => {
        setDias(d.dias);
        setAnterior(d.anterior);
      })
      .catch(setError)
      .finally(() => setCargando(false));
  }, [buscar]);

  useEffect(cargar, [cargar, version]);
  useEffect(() => {
    api
      .get(`/proyectos/${proyecto._id}/hitos`)
      .then((d) => setHitos(d.hitos))
      .catch(() => {});
  }, [proyecto._id, version]);

  const cargarAnteriores = async () => {
    setCargando(true);
    try {
      const d = await buscar(anterior);
      setDias((actuales) => [...actuales, ...d.dias]);
      setAnterior(d.anterior);
    } catch (e) {
      setError(e);
    } finally {
      setCargando(false);
    }
  };

  const registrar = async (e) => {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      await api.post(`/proyectos/${proyecto._id}/diario`, { ...nuevo, hito: nuevo.hito || null });
      setNuevo(VACIO());
      cargar();
    } catch (err) {
      setError(err);
    } finally {
      setOcupado(false);
    }
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      await api.patch(`/diario/${editando.id}`, { texto: editando.texto, fecha: editando.fecha, categoria: editando.categoria, hito: editando.hito || null });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err);
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async (item) => {
    if (!window.confirm('¿Eliminar este registro del diario?')) return;
    try {
      await api.del(`/diario/${item.id}`);
      cargar();
    } catch (err) {
      setError(err);
    }
  };

  const puedeModificar = (item) => item.tipo === 'manual' && (esAdmin || item.autorId === usuario?._id);

  return (
    <div className="diario">
      <section className="tarjeta diario-nuevo">
        <h2>Registrar en el diario</h2>
        <FormRegistro valor={nuevo} hitos={hitos} alCambiar={setNuevo} alEnviar={registrar} enviando={ocupado} rotuloBoton="Registrar" />
      </section>

      <MensajeError error={error} />

      <div className="filtros diario-filtros">
        <label className="checkbox">
          <input type="checkbox" checked={automaticos} onChange={(e) => setAutomaticos(e.target.checked)} />
          Mostrar también los cambios en las tareas y los eventos automáticos
        </label>
      </div>

      {!cargando && dias.length === 0 && <div className="estado-vacio">Ningún registro en los últimos 30 días.</div>}

      <ol className="diario-dias">
        {dias.map((d) => (
          <li key={d.dia} className="diario-dia">
            <h3 className="diario-fecha">{formatearDia(d.dia)}</h3>
            <ul className="diario-items">
              {d.items.map((item) => (
                <li key={item.id} className={`diario-item diario-${item.tipo} categoria-${item.categoria}`}>
                  <span className="diario-icono" aria-hidden="true">
                    {item.tipo === 'tarea' ? ICONOS.tarea : ICONOS[item.categoria] || '•'}
                  </span>
                  <div className="diario-contenido">
                    <p>
                      {item.tipo === 'tarea' && <strong>{item.autor} </strong>}
                      {item.texto}
                    </p>
                    <small className="texto-suave">
                      {item.tipo !== 'tarea' && <>{CATEGORIAS_DIARIO[item.categoria]} · </>}
                      {item.tipo === 'manual' && item.autor && <>{item.autor} · </>}
                      {item.tipo === 'sistema' && <>automático · </>}
                      {item.hito && <>{item.hito} · </>}
                      registrado {new Date(item.cuando).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </div>
                  {puedeModificar(item) && (
                    <div className="diario-acciones">
                      <button
                        type="button"
                        className="boton boton-fantasma"
                        onClick={() => setEditando({ id: item.id, texto: item.texto, fecha: d.dia, categoria: item.categoria, hito: item.hitoId || '' })}
                      >
                        Editar
                      </button>
                      <button type="button" className="boton boton-peligro-fantasma" onClick={() => eliminar(item)}>
                        Eliminar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {anterior && (
        <div className="paginacion">
          <button type="button" className="boton boton-secundario" onClick={cargarAnteriores} disabled={cargando}>
            {cargando ? 'Cargando…' : 'Cargar los 30 días anteriores'}
          </button>
        </div>
      )}

      <Modal titulo="Editar registro" abierto={Boolean(editando)} alCerrar={() => setEditando(null)} anchura={620}>
        {editando && (
          <FormRegistro valor={editando} hitos={hitos} alCambiar={setEditando} alEnviar={guardarEdicion} enviando={ocupado} rotuloBoton="Guardar" />
        )}
      </Modal>
    </div>
  );
}

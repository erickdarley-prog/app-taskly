// Área de adjuntos del proyecto: subir y ver vídeos, imágenes, documentos y otros archivos.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, File, FileArchive, FileImage, FileText, FileVideo, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { api, enviarArchivos, montarQuery, urlApi } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { MensajeError } from '../Elementos.jsx';
import Visualizador, { descargarAdjunto } from './Visualizador.jsx';
import { formatearFecha, formatearTamano } from '../../utils/formatos.js';

const TIPOS = [
  ['', 'Todos'],
  ['video', 'Vídeos'],
  ['imagen', 'Imágenes'],
  ['documento', 'Documentos'],
  ['archivo', 'Archivos'],
];
const ICONOS = { video: FileVideo, imagen: FileImage, documento: FileText, archivo: File };

function IconoTipo({ adjunto, tamano = 34 }) {
  const Icono = adjunto.tipo === 'archivo' && ['zip', 'rar', '7z'].includes(adjunto.extension) ? FileArchive : ICONOS[adjunto.tipo] || File;
  return <Icono size={tamano} strokeWidth={1.6} aria-hidden="true" />;
}

// Miniatura de las imágenes (pide el enlace temporal solo cuando aparece en pantalla)
function Miniatura({ adjunto }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let activo = true;
    api
      .get(`/adjuntos/${adjunto._id}/link`)
      .then((l) => activo && setUrl(urlApi(l.ver)))
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [adjunto._id]);
  return url ? <img src={url} alt="" loading="lazy" /> : <IconoTipo adjunto={adjunto} />;
}

export default function Adjuntos({ proyecto, version }) {
  const { usuario, esAdmin } = useAuth();
  const [datos, setDatos] = useState(null);
  const [tipo, setTipo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [cola, setCola] = useState([]); // archivos elegidos, aún no enviados
  const [descripcion, setDescripcion] = useState('');
  const [progreso, setProgreso] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const inputRef = useRef(null);

  const cargar = useCallback(() => {
    api
      .get(`/proyectos/${proyecto._id}/adjuntos${montarQuery({ tipo, busqueda })}`)
      .then(setDatos)
      .catch(setError);
  }, [proyecto._id, tipo, busqueda]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda, version]);

  const anadir = (lista) => {
    const nuevos = Array.from(lista || []);
    if (!nuevos.length) return;
    setError(null);
    const limite = (datos?.maxUploadMb || 500) * 1024 * 1024;
    const grandes = nuevos.filter((f) => f.size > limite);
    if (grandes.length) setError(new Error(`Archivo demasiado grande (máximo ${datos?.maxUploadMb || 500} MB): ${grandes.map((f) => f.name).join(', ')}`));
    setCola((f) => [...f, ...nuevos.filter((x) => x.size <= limite)].slice(0, 10));
  };

  const enviar = async () => {
    if (!cola.length) return;
    setError(null);
    setProgreso(0);
    try {
      await enviarArchivos(`/proyectos/${proyecto._id}/adjuntos`, cola, { descripcion, alProgreso: setProgreso });
      setCola([]);
      setDescripcion('');
      cargar();
    } catch (e) {
      setError(e);
    } finally {
      setProgreso(null);
    }
  };

  const eliminar = async (adjunto) => {
    if (!window.confirm(`¿Eliminar el adjunto "${adjunto.nombre}"? El archivo se borrará.`)) return;
    try {
      await api.del(`/adjuntos/${adjunto._id}`);
      cargar();
    } catch (e) {
      setError(e);
    }
  };

  const soltar = (e) => {
    e.preventDefault();
    setArrastrando(false);
    anadir(e.dataTransfer.files);
  };

  const visualizables = (datos?.items || []).filter((a) => a.visualizador);
  const puedeEliminar = (a) => esAdmin || a.enviadoPor?._id === usuario?._id;

  return (
    <div className="adjuntos">
      <section
        className={`tarjeta adjuntos-envio${arrastrando ? ' arrastrando' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
      >
        <div className="adjuntos-envio-zona">
          <UploadCloud size={36} aria-hidden="true" />
          <div>
            <strong>Arrastra archivos aquí o</strong>{' '}
            <button type="button" className="link-boton" onClick={() => inputRef.current?.click()}>
              elígelos en el ordenador
            </button>
            <p className="texto-suave">
              Vídeos, imágenes, documentos (Word, PDF, texto, Markdown) y otros archivos · hasta {datos?.maxUploadMb || 500} MB cada uno · 10 por vez
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              anadir(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {cola.length > 0 && (
          <div className="adjuntos-cola">
            <ul>
              {cola.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span className="adjuntos-cola-nombre">{f.name}</span>
                  <span className="texto-suave">{formatearTamano(f.size)}</span>
                  {progreso === null && (
                    <button type="button" className="boton-icono" aria-label={`Quitar ${f.name}`} onClick={() => setCola((l) => l.filter((_, j) => j !== i))}>
                      <X size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional) – p. ej.: grabación de la reunión de kickoff"
              maxLength={1000}
              aria-label="Descripción de los archivos"
              disabled={progreso !== null}
            />
            {progreso !== null && (
              <div className="progreso" aria-label="Progreso de la subida">
                <div className="progreso-carril">
                  <div className="progreso-barra" style={{ width: `${progreso}%` }} />
                </div>
                <span className="progreso-valor">{progreso}%</span>
              </div>
            )}
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => setCola([])} disabled={progreso !== null}>
                Cancelar
              </button>
              <button type="button" className="boton" onClick={enviar} disabled={progreso !== null}>
                <UploadCloud size={16} /> {progreso !== null ? 'Subiendo…' : `Enviar ${cola.length} arquivo${cola.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </section>

      <MensajeError error={error} />

      <div className="filtros adjuntos-filtros">
        <div className="chips-filtro" role="group" aria-label="Filtrar por tipo">
          {TIPOS.map(([v, r]) => (
            <button key={v || 'todos'} type="button" className={`chip-filtro${tipo === v ? ' activo' : ''}`} aria-pressed={tipo === v} onClick={() => setTipo(v)}>
              {r}
              <span>{v ? datos?.porTipo?.[v] ?? 0 : datos?.total ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="busqueda-pildora">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Buscar archivo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar adjunto" />
        </label>
      </div>

      {datos && datos.items.length === 0 && (
        <div className="estado-vacio">{tipo || busqueda ? 'Ningún adjunto encontrado con ese filtro.' : 'Aún no hay adjuntos en este proyecto. Sube el primero arriba.'}</div>
      )}

      {datos && datos.items.length > 0 && (
        <ul className="adjuntos-cuadricula">
          {datos.items.map((a) => (
            <li key={a._id} className={`tarjeta adjunto adjunto-${a.tipo}`}>
              <button
                type="button"
                className="adjunto-previa"
                onClick={() => (a.visualizador ? setAbierto(a) : descargarAdjunto(a).catch(setError))}
                aria-label={a.visualizador ? `Ver ${a.nombre}` : `Descargar ${a.nombre}`}
              >
                {a.tipo === 'imagen' && a.visualizador ? <Miniatura adjunto={a} /> : <IconoTipo adjunto={a} tamano={44} />}
                <span className="adjunto-extension">{a.extension || 'archivo'}</span>
              </button>
              <div className="adjunto-cuerpo">
                <strong className="adjunto-nombre" title={a.nombre}>
                  {a.nombre}
                </strong>
                <small className="texto-suave">
                  {formatearTamano(a.tamano)} · {formatearFecha(a.createdAt)} · {a.enviadoPor?.nombre || '—'}
                </small>
                {a.descripcion && <p className="adjunto-descripcion">{a.descripcion}</p>}
              </div>
              <div className="adjunto-acciones">
                {a.visualizador ? (
                  <button type="button" className="boton boton-secundario" onClick={() => setAbierto(a)}>
                    <Eye size={15} /> Ver
                  </button>
                ) : (
                  <span className="adjunto-solo-descargar">Solo para descargar</span>
                )}
                <button type="button" className="boton-icono" onClick={() => descargarAdjunto(a).catch(setError)} aria-label={`Descargar ${a.nombre}`} title="Descargar">
                  <Download size={18} />
                </button>
                {puedeEliminar(a) && (
                  <button type="button" className="boton-icono peligro" onClick={() => eliminar(a)} aria-label={`Eliminar ${a.nombre}`} title="Eliminar">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Visualizador adjunto={abierto} lista={visualizables} alCerrar={() => setAbierto(null)} alNavegar={setAbierto} />
    </div>
  );
}

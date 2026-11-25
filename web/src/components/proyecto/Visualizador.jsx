// Visualizador de adjuntos: vídeo, imagen, PDF, Word (.docx), texto y Markdown.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { api, urlApi } from '../../api/cliente.js';
import { formatearFechaHora, formatearTamano } from '../../utils/formatos.js';

export async function descargarAdjunto(adjunto) {
  const link = await api.get(`/adjuntos/${adjunto._id}/link`);
  const a = document.createElement('a');
  a.href = urlApi(link.descargar);
  a.download = adjunto.nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ContenidoDocx({ url }) {
  const ref = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const [{ renderAsync }, respuesta] = await Promise.all([import('docx-preview'), fetch(url)]);
        const blob = await respuesta.blob();
        if (!activo || !ref.current) return;
        ref.current.innerHTML = '';
        await renderAsync(blob, ref.current, null, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true });
      } catch {
        if (activo) setError('No se ha podido mostrar este documento. Usa el botón Descargar.');
      }
    })();
    return () => {
      activo = false;
    };
  }, [url]);
  return (
    <div className="visor-docx">
      {error && <p className="visor-aviso">{error}</p>}
      <div ref={ref} />
    </div>
  );
}

function ContenidoTexto({ url, markdown }) {
  const [html, setHtml] = useState(null);
  const [texto, setTexto] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const contenido = await (await fetch(url)).text();
        if (!activo) return;
        if (markdown) {
          const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
          setHtml(DOMPurify.sanitize(marked.parse(contenido)));
        } else setTexto(contenido);
      } catch {
        if (activo) setError('No se ha podido leer este archivo.');
      }
    })();
    return () => {
      activo = false;
    };
  }, [url, markdown]);
  if (error) return <p className="visor-aviso">{error}</p>;
  if (markdown) {
    // HTML ya limpiado por DOMPurify (sin scripts ni atributos peligrosos)
    return <article className="visor-markdown" dangerouslySetInnerHTML={{ __html: html ?? '' }} />;
  }
  return <pre className="visor-texto">{texto ?? 'Cargando…'}</pre>;
}

function ContenidoVideo({ url }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return <p className="visor-aviso">El navegador no ha podido reproducir este vídeo (formato no compatible). Usa el botón Descargar.</p>;
  return <video className="visor-video" src={url} controls preload="metadata" onError={() => setFallo(true)} />;
}

export default function Visualizador({ adjunto, lista = [], alCerrar, alNavegar }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  const indice = lista.findIndex((a) => a._id === adjunto?._id);
  const anterior = indice > 0 ? lista[indice - 1] : null;
  const siguiente = indice >= 0 && indice < lista.length - 1 ? lista[indice + 1] : null;

  useEffect(() => {
    if (!adjunto) return;
    setLink(null);
    setError(null);
    api.get(`/adjuntos/${adjunto._id}/link`).then(setLink).catch(setError);
  }, [adjunto]);

  useEffect(() => {
    if (!adjunto) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') alCerrar();
      if (e.key === 'ArrowLeft' && anterior) alNavegar(anterior);
      if (e.key === 'ArrowRight' && siguiente) alNavegar(siguiente);
    };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [adjunto, anterior, siguiente, alCerrar, alNavegar]);

  if (!adjunto) return null;
  const url = link ? urlApi(link.ver) : null;

  let contenido = <p className="visor-aviso">Cargando…</p>;
  if (error) contenido = <p className="visor-aviso">{error.message}</p>;
  else if (url) {
    switch (adjunto.visualizador) {
      case 'imagen':
        contenido = <img className="visor-imagen" src={url} alt={adjunto.nombre} />;
        break;
      case 'video':
        contenido = <ContenidoVideo key={url} url={url} />;
        break;
      case 'pdf':
        contenido = <iframe className="visor-pdf" src={url} title={adjunto.nombre} />;
        break;
      case 'docx':
        contenido = <ContenidoDocx key={url} url={url} />;
        break;
      case 'texto':
      case 'markdown':
        contenido = <ContenidoTexto key={url} url={url} markdown={adjunto.visualizador === 'markdown'} />;
        break;
      default:
        contenido = <p className="visor-aviso">Este tipo de archivo no tiene vista previa. Usa el botón Descargar.</p>;
    }
  }

  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label={`Ver ${adjunto.nombre}`}>
      <header className="visor-cabecera">
        <div className="visor-info">
          <strong title={adjunto.nombre}>{adjunto.nombre}</strong>
          <small>
            {formatearTamano(adjunto.tamano)} · {adjunto.enviadoPor?.nombre || '—'} · {formatearFechaHora(adjunto.createdAt)}
            {lista.length > 1 && indice >= 0 && (
              <>
                {' '}
                · {indice + 1} de {lista.length}
              </>
            )}
          </small>
        </div>
        <div className="visor-acciones">
          <button type="button" className="boton boton-contorno-claro" onClick={() => descargarAdjunto(adjunto).catch(setError)}>
            <Download size={16} /> Descargar
          </button>
          <button type="button" className="visor-boton" onClick={alCerrar} aria-label="Cerrar">
            <X size={22} />
          </button>
        </div>
      </header>
      <div className="visor-cuerpo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
        {anterior && (
          <button type="button" className="visor-nav visor-nav-anterior" onClick={() => alNavegar(anterior)} aria-label="Anterior">
            <ChevronLeft size={28} />
          </button>
        )}
        <div className={`visor-contenido visor-modo-${adjunto.visualizador}`}>{contenido}</div>
        {siguiente && (
          <button type="button" className="visor-nav visor-nav-siguiente" onClick={() => alNavegar(siguiente)} aria-label="Siguiente">
            <ChevronRight size={28} />
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { LADOS, PRIORIDADES, STATUS_ACUERDO, STATUS_HITO, STATUS_PROYECTO, STATUS_TAREA, iniciales } from '../utils/formatos.js';

export function Progreso({ valor = 0, rotulo = true }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div className="progreso" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="progreso-carril">
        <div className="progreso-barra" style={{ width: `${v}%` }} />
      </div>
      {rotulo && <span className="progreso-valor">{v}%</span>}
    </div>
  );
}

export function SelloStatusProyecto({ status }) {
  return <span className={`sello sello-proyecto-${status}`}>{STATUS_PROYECTO[status] || status}</span>;
}

export function SelloStatusTarea({ status }) {
  return <span className={`sello sello-tarea-${status}`}>{STATUS_TAREA[status] || status}</span>;
}

export function SelloPrioridad({ prioridad }) {
  return <span className={`sello sello-prioridad-${prioridad}`}>{PRIORIDADES[prioridad] || prioridad}</span>;
}

export function SelloAtrasada({ texto = 'Atrasada' }) {
  return <span className="sello sello-atrasada">{texto}</span>;
}

export function SelloLado({ lado }) {
  return <span className={`sello sello-lado-${lado || 'awakelab'}`}>{LADOS[lado] || LADOS.awakelab}</span>;
}

export function SelloStatusHito({ status }) {
  return <span className={`sello sello-hito-${status}`}>{STATUS_HITO[status] || status}</span>;
}

export function SelloStatusAcuerdo({ status }) {
  return <span className={`sello sello-acuerdo-${status}`}>{STATUS_ACUERDO[status] || status}</span>;
}

export function Avatar({ nombre, tamano = 'normal' }) {
  return (
    <span className={`avatar avatar-${tamano}`} title={nombre}>
      {iniciales(nombre) || '?'}
    </span>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="estado-vacio">{texto}</div>;
}

export function MensajeError({ error }) {
  if (!error) return null;
  return <div className="alerta alerta-error">{error.message || String(error)}</div>;
}

export function Vacio({ children }) {
  return <div className="estado-vacio">{children}</div>;
}

export function Modal({ titulo, abierto, alCerrar, children, anchura = 560 }) {
  useEffect(() => {
    if (!abierto) return undefined;
    const tecla = (e) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [abierto, alCerrar]);

  if (!abierto) return null;
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modal" style={{ maxWidth: anchura }} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="boton-icono" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}

export function Paginacion({ pagina, paginas, alCambiar }) {
  if (!paginas || paginas <= 1) return null;
  return (
    <div className="paginacion">
      <button type="button" className="boton boton-secundario" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
        Anterior
      </button>
      <span>
        Página {pagina} de {paginas}
      </span>
      <button
        type="button"
        className="boton boton-secundario"
        disabled={pagina >= paginas}
        onClick={() => alCambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </div>
  );
}

export function Campo({ rotulo, children, pista }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {pista && <span className="campo-pista">{pista}</span>}
    </label>
  );
}

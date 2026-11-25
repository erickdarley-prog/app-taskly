// Portada en la cabecera de las pantallas: franja en degradado con etiqueta, título, indicadores y acciones.

export function Anillo({ valor = 0, rotulo = 'avance', tamano = 132 }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  const radio = 52;
  const circ = 2 * Math.PI * radio;
  return (
    <div className="anillo" style={{ width: tamano, height: tamano }} role="img" aria-label={`${v}% de ${rotulo}`}>
      <svg viewBox="0 0 120 120" width={tamano} height={tamano} aria-hidden="true">
        <circle cx="60" cy="60" r={radio} className="anillo-carril" />
        <circle
          cx="60"
          cy="60"
          r={radio}
          className="anillo-barra"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="anillo-texto">
        <strong>{v}%</strong>
        <small>{rotulo}</small>
      </span>
    </div>
  );
}

export function ChipPortada({ icono: Icono, valor, rotulo, alerta = false }) {
  return (
    <div className={`chip-portada${alerta ? ' alerta' : ''}`}>
      {Icono && <Icono size={17} aria-hidden="true" />}
      <span>
        <strong>{valor}</strong>
        <small>{rotulo}</small>
      </span>
    </div>
  );
}

export default function Portada({ etiqueta, titulo, subtitulo, chips, acciones, lado, children }) {
  return (
    <section className="portada">
      <div className="portada-principal">
        {etiqueta && <p className="etiqueta-portada">{etiqueta}</p>}
        <h1>{titulo}</h1>
        {subtitulo && <p className="portada-subtitulo">{subtitulo}</p>}
        {chips && <div className="portada-chips">{chips}</div>}
        {children}
        {acciones && <div className="portada-acciones">{acciones}</div>}
      </div>
      {lado && <aside className="portada-lado">{lado}</aside>}
    </section>
  );
}

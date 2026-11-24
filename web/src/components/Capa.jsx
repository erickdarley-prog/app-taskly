// Capa no topo das telas: faixa em degradê com etiqueta, título, indicadores e ações.

export function Anel({ valor = 0, rotulo = 'andamento', tamanho = 132 }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  const raio = 52;
  const circ = 2 * Math.PI * raio;
  return (
    <div className="anel" style={{ width: tamanho, height: tamanho }} role="img" aria-label={`${v}% de ${rotulo}`}>
      <svg viewBox="0 0 120 120" width={tamanho} height={tamanho} aria-hidden="true">
        <circle cx="60" cy="60" r={raio} className="anel-trilho" />
        <circle
          cx="60"
          cy="60"
          r={raio}
          className="anel-barra"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - v / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="anel-texto">
        <strong>{v}%</strong>
        <small>{rotulo}</small>
      </span>
    </div>
  );
}

export function ChipCapa({ icone: Icone, valor, rotulo, alerta = false }) {
  return (
    <div className={`chip-capa${alerta ? ' alerta' : ''}`}>
      {Icone && <Icone size={17} aria-hidden="true" />}
      <span>
        <strong>{valor}</strong>
        <small>{rotulo}</small>
      </span>
    </div>
  );
}

export default function Capa({ etiqueta, titulo, subtitulo, chips, acoes, lado, children }) {
  return (
    <section className="capa">
      <div className="capa-principal">
        {etiqueta && <p className="etiqueta-capa">{etiqueta}</p>}
        <h1>{titulo}</h1>
        {subtitulo && <p className="capa-subtitulo">{subtitulo}</p>}
        {chips && <div className="capa-chips">{chips}</div>}
        {children}
        {acoes && <div className="capa-acoes">{acoes}</div>}
      </div>
      {lado && <aside className="capa-lado">{lado}</aside>}
    </section>
  );
}

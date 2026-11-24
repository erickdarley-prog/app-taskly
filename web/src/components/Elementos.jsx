import { useEffect } from 'react';
import { LADOS, PRIORIDADES, STATUS_ACORDO, STATUS_MARCO, STATUS_PROJETO, STATUS_TAREFA, iniciais } from '../utils/formatos.js';

export function Progresso({ valor = 0, rotulo = true }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div className="progresso" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="progresso-trilho">
        <div className="progresso-barra" style={{ width: `${v}%` }} />
      </div>
      {rotulo && <span className="progresso-valor">{v}%</span>}
    </div>
  );
}

export function SeloStatusProjeto({ status }) {
  return <span className={`selo selo-projeto-${status}`}>{STATUS_PROJETO[status] || status}</span>;
}

export function SeloStatusTarefa({ status }) {
  return <span className={`selo selo-tarefa-${status}`}>{STATUS_TAREFA[status] || status}</span>;
}

export function SeloPrioridade({ prioridade }) {
  return <span className={`selo selo-prioridade-${prioridade}`}>{PRIORIDADES[prioridade] || prioridade}</span>;
}

export function SeloAtrasada({ texto = 'Atrasada' }) {
  return <span className="selo selo-atrasada">{texto}</span>;
}

export function SeloLado({ lado }) {
  return <span className={`selo selo-lado-${lado || 'awakelab'}`}>{LADOS[lado] || LADOS.awakelab}</span>;
}

export function SeloStatusMarco({ status }) {
  return <span className={`selo selo-marco-${status}`}>{STATUS_MARCO[status] || status}</span>;
}

export function SeloStatusAcordo({ status }) {
  return <span className={`selo selo-acordo-${status}`}>{STATUS_ACORDO[status] || status}</span>;
}

export function Avatar({ nome, tamanho = 'normal' }) {
  return (
    <span className={`avatar avatar-${tamanho}`} title={nome}>
      {iniciais(nome) || '?'}
    </span>
  );
}

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="estado-vazio">{texto}</div>;
}

export function MensagemErro({ erro }) {
  if (!erro) return null;
  return <div className="alerta alerta-erro">{erro.message || String(erro)}</div>;
}

export function Vazio({ children }) {
  return <div className="estado-vazio">{children}</div>;
}

export function Modal({ titulo, aberto, aoFechar, children, largura = 560 }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (e) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" style={{ maxWidth: largura }} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}

export function Paginacao({ pagina, paginas, aoMudar }) {
  if (!paginas || paginas <= 1) return null;
  return (
    <div className="paginacao">
      <button type="button" className="botao botao-secundario" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>
        Anterior
      </button>
      <span>
        Página {pagina} de {paginas}
      </span>
      <button
        type="button"
        className="botao botao-secundario"
        disabled={pagina >= paginas}
        onClick={() => aoMudar(pagina + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

export function Campo({ rotulo, children, dica }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

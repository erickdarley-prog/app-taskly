// Roteiro do projeto: os marcos numa linha do tempo horizontal (visão rápida).
import { Check } from 'lucide-react';
import { SeloAtrasada, SeloStatusMarco } from '../Elementos.jsx';
import { formatarDiaMes } from '../../utils/formatos.js';

export default function Roteiro({ marcos, aoEscolher }) {
  if (!marcos?.length) return null;
  const concluidos = marcos.filter((m) => m.status === 'concluido').length;
  const total = marcos.reduce((s, m) => s + m.total, 0);
  const feitas = marcos.reduce((s, m) => s + m.concluidas, 0);

  return (
    <section className="cartao roteiro">
      <header className="roteiro-topo">
        <div>
          <p className="etiqueta-secao">Entregas por marco</p>
          <h2>Roteiro do projeto</h2>
        </div>
        <p className="texto-suave">
          {concluidos} de {marcos.length} marcos concluídos · {feitas}/{total} tarefas
        </p>
      </header>
      <ol className="roteiro-linha">
        {marcos.map((m, i) => {
          const proximo = marcos[i + 1];
          const trechoFeito = m.status === 'concluido' && proximo && proximo.status !== 'pendente';
          return (
            <li key={m._id} className={`roteiro-etapa etapa-${m.status}${m.atrasado ? ' etapa-atrasada' : ''}`}>
              <div className="roteiro-marcador">
                <button type="button" className="roteiro-numero" onClick={() => aoEscolher?.(m._id)} aria-label={`Ver o marco ${m.titulo}`}>
                  {m.status === 'concluido' ? <Check size={18} strokeWidth={3} /> : i + 1}
                </button>
                {proximo && <span className={`roteiro-trecho${trechoFeito ? ' feito' : ''}`} aria-hidden="true" />}
              </div>
              <h3>{m.titulo}</h3>
              <p className="roteiro-datas">
                {formatarDiaMes(m.dataInicio)} → {formatarDiaMes(m.dataFim)}
              </p>
              <div className="roteiro-selos">
                <SeloStatusMarco status={m.status} />
                {m.atrasado && <SeloAtrasada texto="Vencido" />}
              </div>
              <ul className="roteiro-contas">
                <li>
                  {m.concluidas}/{m.total} tarefas concluídas
                </li>
                {m.doCliente > 0 && <li>{m.doCliente} com o cliente</li>}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

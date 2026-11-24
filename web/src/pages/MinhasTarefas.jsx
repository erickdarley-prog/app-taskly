import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, montarQuery } from '../api/cliente.js';
import {
  Carregando,
  MensagemErro,
  Paginacao,
  SeloAtrasada,
  SeloPrioridade,
  SeloStatusTarefa,
  Vazio,
} from '../components/Elementos.jsx';
import DetalheTarefa from '../components/DetalheTarefa.jsx';
import { formatarData, formatarHoras } from '../utils/formatos.js';
import { useAoAlterarDados } from '../utils/eventos.js';

const FILTROS = [
  { valor: 'abertas', rotulo: 'Abertas' },
  { valor: 'a_fazer', rotulo: 'A fazer' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'concluida', rotulo: 'Concluídas' },
  { valor: '', rotulo: 'Todas' },
];

export default function MinhasTarefas() {
  const [status, setStatus] = useState('abertas');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [tarefaAberta, setTarefaAberta] = useState(null);

  const carregar = useCallback(() => {
    setErro(null);
    api
      .get(`/tarefas/minhas${montarQuery({ status, pagina, limite: 30 })}`)
      .then(setDados)
      .catch(setErro);
  }, [status, pagina]);

  useEffect(carregar, [carregar]);
  useAoAlterarDados(carregar);

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Minhas tarefas</h1>
          <p className="texto-suave">Tudo o que está com você, em todos os projetos. Clique numa tarefa para atualizar o status ou lançar horas.</p>
        </div>
      </div>

      <div className="abas" role="tablist">
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todas'}
            type="button"
            role="tab"
            aria-selected={status === f.valor}
            className={status === f.valor ? 'ativa' : ''}
            onClick={() => {
              setStatus(f.valor);
              setPagina(1);
            }}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <MensagemErro erro={erro} />
      {!dados && !erro && <Carregando />}
      {dados && dados.itens.length === 0 && <Vazio>Nenhuma tarefa aqui.</Vazio>}

      {dados && dados.itens.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela tabela-clicavel">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Projeto</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Prazo</th>
                <th>Horas</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((t) => (
                <tr key={t._id} onClick={() => setTarefaAberta(t._id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setTarefaAberta(t._id)}>
                  <td>
                    <strong>{t.titulo}</strong> {t.atrasada && <SeloAtrasada />}
                  </td>
                  <td>
                    {t.projeto ? (
                      <Link to={`/projetos/${t.projeto._id}`} onClick={(e) => e.stopPropagation()}>
                        {t.projeto.nome}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <SeloStatusTarefa status={t.status} />
                  </td>
                  <td>
                    <SeloPrioridade prioridade={t.prioridade} />
                  </td>
                  <td>{formatarData(t.prazo)}</td>
                  <td>
                    {formatarHoras(t.horasGastas)} / {formatarHoras(t.horasEstimadas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados && <Paginacao pagina={dados.pagina} paginas={dados.paginas} aoMudar={setPagina} />}

      <DetalheTarefa
        idTarefa={tarefaAberta}
        aoFechar={() => setTarefaAberta(null)}
        aoMudar={carregar}
        aoEditar={() => setTarefaAberta(null)}
        aoExcluir={() => {
          setTarefaAberta(null);
          carregar();
        }}
      />
    </div>
  );
}

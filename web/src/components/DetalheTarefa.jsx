import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_TAREFA, formatarData, formatarDataHora, formatarHoras } from '../utils/formatos.js';
import { Campo, MensagemErro, Modal, SeloAtrasada, SeloLado, SeloPrioridade, SeloStatusTarefa } from './Elementos.jsx';

function descreverHistorico(h) {
  const d = h.detalhes || {};
  switch (h.acao) {
    case 'criou':
      return 'criou a tarefa';
    case 'status':
      return `mudou o status de "${STATUS_TAREFA[d.de] || d.de}" para "${STATUS_TAREFA[d.para] || d.para}"`;
    case 'horas':
      return `lançou ${formatarHoras(d.horas)}${d.nota ? ` — ${d.nota}` : ''}`;
    case 'editou':
      return `editou ${d.campos?.length ? d.campos.join(', ') : 'a tarefa'}`;
    default:
      return h.acao;
  }
}

export default function DetalheTarefa({ idTarefa, aoFechar, aoMudar, aoEditar, aoExcluir }) {
  const { usuario, ehAdmin } = useAuth();
  const [tarefa, setTarefa] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [horas, setHoras] = useState({ horas: '', nota: '' });
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!idTarefa) return;
    try {
      const [t, h] = await Promise.all([api.get(`/tarefas/${idTarefa}`), api.get(`/tarefas/${idTarefa}/historico?limite=50`)]);
      setTarefa(t);
      setHistorico(h.itens);
    } catch (err) {
      setErro(err);
    }
  }, [idTarefa]);

  useEffect(() => {
    setTarefa(null);
    setHistorico([]);
    setErro(null);
    setHoras({ horas: '', nota: '' });
    carregar();
  }, [carregar]);

  const ehMinha = tarefa?.responsavel && String(tarefa.responsavel._id || tarefa.responsavel) === String(usuario?._id);
  const podeAtualizar = ehAdmin || ehMinha;

  const executar = async (fn) => {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
      await carregar();
      aoMudar?.();
    } catch (err) {
      setErro(err);
    } finally {
      setOcupado(false);
    }
  };

  const mudarStatus = (status) => executar(() => api.patch(`/tarefas/${idTarefa}/status`, { status }));

  const lancarHoras = (e) => {
    e.preventDefault();
    executar(async () => {
      await api.post(`/tarefas/${idTarefa}/horas`, { horas: Number(String(horas.horas).replace(',', '.')), nota: horas.nota });
      setHoras({ horas: '', nota: '' });
    });
  };

  const excluir = () => {
    if (!window.confirm('Excluir esta tarefa? Essa ação não pode ser desfeita.')) return;
    setOcupado(true);
    api
      .del(`/tarefas/${idTarefa}`)
      .then(() => aoExcluir?.())
      .catch(setErro)
      .finally(() => setOcupado(false));
  };

  return (
    <Modal titulo={tarefa?.titulo || 'Tarefa'} aberto={Boolean(idTarefa)} aoFechar={aoFechar} largura={640}>
      <MensagemErro erro={erro} />
      {!tarefa && !erro && <p className="texto-suave">Carregando…</p>}
      {tarefa && (
        <div className="detalhe-tarefa">
          <div className="selos">
            <SeloLado lado={tarefa.lado} />
            <SeloStatusTarefa status={tarefa.status} />
            <SeloPrioridade prioridade={tarefa.prioridade} />
            {tarefa.atrasada && <SeloAtrasada />}
          </div>
          {tarefa.descricao && <p className="descricao">{tarefa.descricao}</p>}

          <dl className="lista-dados">
            <div>
              <dt>Marco</dt>
              <dd>{tarefa.marco?.titulo || 'Sem marco'}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>
                {tarefa.lado === 'cliente'
                  ? `${tarefa.responsavelExterno || 'Cliente'} (cliente)`
                  : tarefa.responsavel?.nome || 'Sem responsável'}
              </dd>
            </div>
            <div>
              <dt>Prazo</dt>
              <dd>{formatarData(tarefa.prazo)}</dd>
            </div>
            <div>
              <dt>Horas</dt>
              <dd>
                {formatarHoras(tarefa.horasGastas)} de {formatarHoras(tarefa.horasEstimadas)}
              </dd>
            </div>
            {tarefa.concluidaEm && (
              <div>
                <dt>Concluída em</dt>
                <dd>{formatarData(tarefa.concluidaEm)}</dd>
              </div>
            )}
          </dl>

          {podeAtualizar && (
            <div className="bloco">
              <h3>Atualizar status</h3>
              <div className="grupo-botoes">
                {Object.entries(STATUS_TAREFA).map(([v, r]) => (
                  <button
                    key={v}
                    type="button"
                    className={`botao ${tarefa.status === v ? 'botao-selecionado' : 'botao-secundario'}`}
                    aria-pressed={tarefa.status === v}
                    disabled={ocupado || tarefa.status === v}
                    onClick={() => mudarStatus(v)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <h3>Lançar horas trabalhadas</h3>
              <form className="form-horas" onSubmit={lancarHoras}>
                <Campo rotulo="Horas">
                  <input
                    inputMode="decimal"
                    placeholder="Ex.: 1,5"
                    value={horas.horas}
                    onChange={(e) => setHoras({ ...horas, horas: e.target.value })}
                    required
                  />
                </Campo>
                <Campo rotulo="O que foi feito (opcional)">
                  <input value={horas.nota} maxLength={500} onChange={(e) => setHoras({ ...horas, nota: e.target.value })} />
                </Campo>
                <button type="submit" className="botao" disabled={ocupado}>
                  Lançar
                </button>
              </form>
            </div>
          )}

          {!podeAtualizar && (
            <p className="texto-suave">
              {tarefa.lado === 'cliente'
                ? 'Tarefa do cliente: quem atualiza é um administrador.'
                : 'Só o responsável pela tarefa ou um administrador pode atualizá-la.'}
            </p>
          )}

          <div className="bloco">
            <h3>Histórico</h3>
            {historico.length === 0 && <p className="texto-suave">Sem registros.</p>}
            <ul className="historico">
              {historico.map((h) => (
                <li key={h._id}>
                  <strong>{h.usuario?.nome || 'Alguém'}</strong> {descreverHistorico(h)}
                  <time>{formatarDataHora(h.createdAt)}</time>
                </li>
              ))}
            </ul>
          </div>

          {ehAdmin && (
            <div className="acoes">
              <button type="button" className="botao botao-perigo" onClick={excluir} disabled={ocupado}>
                Excluir
              </button>
              <button type="button" className="botao botao-secundario" onClick={() => aoEditar(tarefa)}>
                Editar tarefa
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

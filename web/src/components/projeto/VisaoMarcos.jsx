// Visão linear por marco: etapa por etapa, com datas, status e as tarefas de cada uma.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Campo, MensagemErro, Modal, Progresso, SeloAtrasada, SeloLado, SeloStatusMarco, SeloStatusTarefa } from '../Elementos.jsx';
import { deInputData, formatarData, formatarDiaMes, paraInputData } from '../../utils/formatos.js';

function FormMarco({ aberto, marco, idProjeto, aoFechar, aoSalvar }) {
  const [form, setForm] = useState({ titulo: '', descricao: '', dataInicio: '', dataFim: '' });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setForm({
      titulo: marco?.titulo || '',
      descricao: marco?.descricao || '',
      dataInicio: paraInputData(marco?.dataInicio),
      dataFim: paraInputData(marco?.dataFim),
    });
  }, [aberto, marco]);

  const mudar = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo = { ...form, dataInicio: deInputData(form.dataInicio), dataFim: deInputData(form.dataFim) };
      if (marco?._id) await api.patch(`/marcos/${marco._id}`, corpo);
      else await api.post(`/projetos/${idProjeto}/marcos`, corpo);
      aoSalvar();
    } catch (err) {
      setErro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={marco?._id ? 'Editar marco' : 'Novo marco'} aberto={aberto} aoFechar={aoFechar} largura={540}>
      <form className="formulario" onSubmit={enviar}>
        <Campo rotulo="Nome do marco" dica='Ex.: "Recopilar informação", "Criar domínios", "Proposta gráfica"'>
          <input value={form.titulo} onChange={mudar('titulo')} required maxLength={200} autoFocus />
        </Campo>
        <Campo rotulo="Descrição (opcional)">
          <textarea rows={2} value={form.descricao} onChange={mudar('descricao')} maxLength={5000} />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Início aproximado">
            <input type="date" value={form.dataInicio} onChange={mudar('dataInicio')} />
          </Campo>
          <Campo rotulo="Entrega aproximada">
            <input type="date" value={form.dataFim} onChange={mudar('dataFim')} />
          </Campo>
        </div>
        <MensagemErro erro={erro} />
        <div className="acoes">
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar marco'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LinhaTarefa({ tarefa, aoAbrir }) {
  const quem = tarefa.lado === 'cliente' ? tarefa.responsavelExterno || 'Cliente' : tarefa.responsavel?.nome || 'Sem responsável';
  return (
    <li>
      <button type="button" className={`linha-tarefa status-${tarefa.status}`} onClick={() => aoAbrir(tarefa._id)}>
        <span className="linha-tarefa-marca" aria-hidden="true" />
        <span className="linha-tarefa-titulo">{tarefa.titulo}</span>
        <span className="linha-tarefa-info">
          <SeloLado lado={tarefa.lado} />
          <span className="texto-suave">{quem}</span>
          <span className="texto-suave">{tarefa.prazo ? formatarData(tarefa.prazo) : 'Sem prazo'}</span>
          <SeloStatusTarefa status={tarefa.status} />
          {tarefa.atrasada && <SeloAtrasada />}
        </span>
      </button>
    </li>
  );
}

export default function VisaoMarcos({ projeto, versao, aoAbrirTarefa, aoNovaTarefa, aoMudar }) {
  const { ehAdmin } = useAuth();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [formMarco, setFormMarco] = useState(null); // null | {} | marco
  const [filtroLado, setFiltroLado] = useState('');

  const carregar = useCallback(() => {
    api
      .get(`/projetos/${projeto._id}/marcos?comTarefas=true`)
      .then(setDados)
      .catch(setErro);
  }, [projeto._id]);

  useEffect(carregar, [carregar, versao]);

  const excluir = async (m) => {
    if (!window.confirm(`Excluir o marco "${m.titulo}"? As tarefas dele não são apagadas: ficam "sem marco".`)) return;
    try {
      await api.del(`/marcos/${m._id}`);
      aoMudar();
    } catch (e) {
      setErro(e);
    }
  };

  if (!dados) return erro ? <MensagemErro erro={erro} /> : <p className="texto-suave">Carregando marcos…</p>;

  const filtrar = (tarefas) => (filtroLado ? tarefas.filter((t) => t.lado === filtroLado) : tarefas);
  const grupos = [...dados.marcos];
  if (dados.semMarco?.tarefas?.length) {
    grupos.push({ _id: 'sem', titulo: 'Tarefas sem marco', semMarco: true, tarefas: dados.semMarco.tarefas });
  }

  return (
    <div className="visao-marcos">
      <MensagemErro erro={erro} />
      <div className="filtros">
        <div className="grupo-botoes" role="group" aria-label="Filtrar tarefas por lado">
          {[
            ['', 'Todas'],
            ['awakelab', 'Awakelab'],
            ['cliente', 'Cliente'],
          ].map(([v, r]) => (
            <button
              key={v || 'todas'}
              type="button"
              className={`botao ${filtroLado === v ? 'botao-selecionado' : 'botao-secundario'}`}
              aria-pressed={filtroLado === v}
              onClick={() => setFiltroLado(v)}
            >
              {r}
            </button>
          ))}
        </div>
        {ehAdmin && (
          <button type="button" className="botao" onClick={() => setFormMarco({})}>
            + Novo marco
          </button>
        )}
      </div>

      {grupos.length === 0 && (
        <div className="estado-vazio">
          Este projeto ainda não tem marcos.{' '}
          {ehAdmin ? 'Crie o primeiro, por exemplo "Recopilar informação".' : 'O administrador vai criá-los.'}
        </div>
      )}

      <ol className="linha-marcos">
        {grupos.map((m, i) => {
          const tarefas = filtrar(m.tarefas || []);
          return (
            <li key={m._id} id={`marco-${m._id}`} className={`marco marco-${m.semMarco ? 'sem' : m.status}${m.atrasado ? ' marco-atrasado' : ''}`}>
              <div className="marco-trilho" aria-hidden="true">
                <span className="marco-ponto">{m.semMarco ? '·' : m.status === 'concluido' ? '✓' : i + 1}</span>
              </div>
              <div className="marco-cartao">
                <header className="marco-topo">
                  <div>
                    <h3>{m.titulo}</h3>
                    {!m.semMarco && (
                      <p className="marco-datas">
                        {formatarDiaMes(m.dataInicio)} → {formatarDiaMes(m.dataFim)}
                        {m.descricao && <span className="texto-suave"> · {m.descricao}</span>}
                      </p>
                    )}
                  </div>
                  {!m.semMarco && (
                    <div className="marco-estado">
                      <SeloStatusMarco status={m.status} />
                      {m.atrasado && <SeloAtrasada texto="Entrega vencida" />}
                    </div>
                  )}
                </header>
                {!m.semMarco && (
                  <div className="marco-progresso">
                    <Progresso valor={m.percentual} />
                    <span className="texto-suave">
                      {m.concluidas}/{m.total} tarefas · {m.daAwakelab} Awakelab · {m.doCliente} cliente
                    </span>
                  </div>
                )}
                {tarefas.length > 0 ? (
                  <ul className="marco-tarefas">
                    {tarefas.map((t) => (
                      <LinhaTarefa key={t._id} tarefa={t} aoAbrir={aoAbrirTarefa} />
                    ))}
                  </ul>
                ) : (
                  <p className="texto-suave">{filtroLado ? 'Nenhuma tarefa deste lado.' : 'Nenhuma tarefa neste marco.'}</p>
                )}
                {ehAdmin && !m.semMarco && (
                  <div className="marco-acoes">
                    <button type="button" className="botao botao-fantasma" onClick={() => aoNovaTarefa(m._id)}>
                      + Tarefa
                    </button>
                    <button type="button" className="botao botao-fantasma" onClick={() => setFormMarco(m)}>
                      Editar marco
                    </button>
                    <button type="button" className="botao botao-perigo-fantasma" onClick={() => excluir(m)}>
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <FormMarco
        aberto={Boolean(formMarco)}
        marco={formMarco}
        idProjeto={projeto._id}
        aoFechar={() => setFormMarco(null)}
        aoSalvar={() => {
          setFormMarco(null);
          aoMudar();
        }}
      />
    </div>
  );
}

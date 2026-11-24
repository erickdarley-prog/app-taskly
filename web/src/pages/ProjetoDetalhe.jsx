import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, montarQuery } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Avatar,
  Carregando,
  MensagemErro,
  Progresso,
  SeloAtrasada,
  SeloLado,
  SeloPrioridade,
  SeloStatusProjeto,
} from '../components/Elementos.jsx';
import FormProjeto from '../components/FormProjeto.jsx';
import FormTarefa, { pessoasDoProjeto } from '../components/FormTarefa.jsx';
import DetalheTarefa from '../components/DetalheTarefa.jsx';
import VisaoMarcos from '../components/projeto/VisaoMarcos.jsx';
import EscopoAcordo from '../components/projeto/EscopoAcordo.jsx';
import Diario from '../components/projeto/Diario.jsx';
import { PRIORIDADES, STATUS_TAREFA, formatarData, formatarHoras, formatarHorasPar } from '../utils/formatos.js';
import { useAoAlterarDados } from '../utils/eventos.js';
import Capa, { Anel, ChipCapa } from '../components/Capa.jsx';
import Roteiro from '../components/projeto/Roteiro.jsx';
import Anexos from '../components/projeto/Anexos.jsx';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  FileSignature,
  Flag,
  KanbanSquare,
  ListChecks,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

const POR_COLUNA = 30;

export default function ProjetoDetalhe() {
  const { id } = useParams();
  const { ehAdmin } = useAuth();
  const navegar = useNavigate();

  const [projeto, setProjeto] = useState(null);
  const [andamento, setAndamento] = useState(null);
  const [marcos, setMarcos] = useState([]);
  const [acordo, setAcordo] = useState(null);
  const [erro, setErro] = useState(null);
  const [aba, setAba] = useState('marcos');
  const [versao, setVersao] = useState(0); // muda para recarregar quadro e andamento
  const [filtros, setFiltros] = useState({ responsavel: '', prioridade: '', busca: '' });

  const [formProjetoAberto, setFormProjetoAberto] = useState(false);
  const [formTarefa, setFormTarefa] = useState(null); // { tarefa?, statusInicial? }
  const [tarefaAberta, setTarefaAberta] = useState(null);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  useAoAlterarDados(recarregar);

  useEffect(() => {
    setErro(null);
    Promise.all([
      api.get(`/projetos/${id}`),
      api.get(`/projetos/${id}/andamento`),
      api.get(`/projetos/${id}/marcos`),
      api.get(`/projetos/${id}/acordos`).catch(() => null),
    ])
      .then(([p, a, m, ac]) => {
        setProjeto(p);
        setAndamento(a);
        setMarcos(m.marcos);
        setAcordo(ac);
      })
      .catch(setErro);
  }, [id, versao]);

  const excluirProjeto = async () => {
    if (!window.confirm(`Excluir o projeto "${projeto.nome}" e todas as suas tarefas? Essa ação não pode ser desfeita.`)) return;
    try {
      await api.del(`/projetos/${id}`);
      navegar('/projetos', { replace: true });
    } catch (err) {
      setErro(err);
    }
  };

  if (erro && !projeto) {
    return (
      <div className="pagina">
        <Link to="/projetos" className="voltar">
          <ArrowLeft size={16} /> Projetos
        </Link>
        <MensagemErro erro={erro} />
      </div>
    );
  }
  if (!projeto || !andamento) return <Carregando />;

  const g = andamento.geral;
  const pessoas = pessoasDoProjeto(projeto);

  const rc = projeto.responsavelCliente;
  const marcosConcluidos = marcos.filter((m) => m.status === 'concluido').length;
  const textoAcordo = acordo?.emAndamento?.status === 'aguardando'
    ? 'aguardando assinatura'
    : acordo?.vigente
      ? `assinado · v${acordo.vigente.versao}`
      : acordo?.emAndamento
        ? 'em rascunho'
        : 'não definido';

  const abrirMarco = (idMarco) => {
    setAba('marcos');
    setTimeout(() => document.getElementById(`marco-${idMarco}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  return (
    <div className="pagina">
      <Link to="/projetos" className="voltar">
        <ArrowLeft size={16} /> Projetos
      </Link>

      <Capa
        etiqueta={`Projeto${projeto.cliente ? ` · ${projeto.cliente}` : ''}`}
        titulo={projeto.nome}
        subtitulo={projeto.descricao}
        chips={
          <>
            <ChipCapa icone={Flag} valor={`${marcosConcluidos}/${marcos.length}`} rotulo="marcos concluídos" />
            <ChipCapa icone={AlertTriangle} valor={g.atrasadas} rotulo="tarefas atrasadas" alerta={g.atrasadas > 0} />
            <ChipCapa icone={FileSignature} valor="Escopo" rotulo={textoAcordo} alerta={acordo?.emAndamento?.status === 'aguardando'} />
            <ChipCapa icone={CalendarDays} valor={formatarData(projeto.prazo)} rotulo="prazo de entrega" />
          </>
        }
        acoes={
          ehAdmin && (
            <>
              <button type="button" className="botao botao-claro" onClick={() => setFormProjetoAberto(true)}>
                <Pencil size={16} /> Editar projeto
              </button>
              <button type="button" className="botao botao-contorno-claro" onClick={() => setFormTarefa({ statusInicial: 'a_fazer' })}>
                <Plus size={16} /> Nova tarefa
              </button>
              <button type="button" className="botao botao-fantasma-claro" onClick={excluirProjeto}>
                <Trash2 size={16} /> Excluir
              </button>
            </>
          )
        }
        lado={
          <div className="capa-resumo">
            <Anel valor={g.percentual} rotulo="concluído" />
            <div className="capa-resumo-texto">
              <p>
                <strong>{g.concluidas}</strong>
                <span> / {g.total}</span>
              </p>
              <small>tarefas concluídas</small>
              <dl>
                <div>
                  <dt>Awakelab</dt>
                  <dd>{projeto.responsavel?.nome || '—'}</dd>
                </div>
                <div>
                  <dt>Cliente</dt>
                  <dd>{rc?.nome || '—'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <SeloStatusProjeto status={projeto.status} />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        }
      />

      <MensagemErro erro={erro} />

      <Roteiro marcos={marcos} aoEscolher={abrirMarco} />

      <div className="abas-pilula" role="tablist" aria-label="Partes do projeto">
        {[
          ['marcos', 'Marcos', ListChecks],
          ['escopo', 'Escopo e acordo', FileSignature],
          ['diario', 'Diário', NotebookPen],
          ['anexos', 'Anexos', Paperclip],
          ['tarefas', 'Quadro de tarefas', KanbanSquare],
          ['equipe', 'Andamento da equipe', Users],
        ].map(([valor, rotulo, Icone]) => (
          <button key={valor} type="button" role="tab" aria-selected={aba === valor} className={aba === valor ? 'ativa' : ''} onClick={() => setAba(valor)}>
            <Icone size={16} aria-hidden="true" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === 'marcos' && (
        <VisaoMarcos
          projeto={projeto}
          versao={versao}
          aoAbrirTarefa={setTarefaAberta}
          aoNovaTarefa={(marcoInicial) => setFormTarefa({ statusInicial: 'a_fazer', marcoInicial })}
          aoMudar={recarregar}
        />
      )}
      {aba === 'escopo' && <EscopoAcordo projeto={projeto} versao={versao} aoMudar={recarregar} />}
      {aba === 'diario' && <Diario projeto={projeto} versao={versao} />}
      {aba === 'anexos' && <Anexos projeto={projeto} versao={versao} />}

      {aba === 'tarefas' && (
        <>
          <div className="filtros">
            <input
              type="search"
              placeholder="Buscar tarefa…"
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              aria-label="Buscar tarefa"
            />
            <select value={filtros.responsavel} onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })} aria-label="Filtrar por responsável">
              <option value="">Todas as pessoas</option>
              {pessoas.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.nome}
                </option>
              ))}
              <option value="sem">Sem responsável</option>
            </select>
            <select value={filtros.prioridade} onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })} aria-label="Filtrar por prioridade">
              <option value="">Todas as prioridades</option>
              {Object.entries(PRIORIDADES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            {ehAdmin && (
              <button type="button" className="botao" onClick={() => setFormTarefa({ statusInicial: 'a_fazer' })}>
                + Nova tarefa
              </button>
            )}
          </div>

          <div className="quadro">
            {Object.entries(STATUS_TAREFA).map(([status, rotulo]) => (
              <ColunaTarefas
                key={status}
                idProjeto={id}
                status={status}
                rotulo={rotulo}
                filtros={filtros}
                versao={versao}
                aoAbrir={setTarefaAberta}
              />
            ))}
          </div>
        </>
      )}

      {aba === 'equipe' && <AndamentoEquipe andamento={andamento} />}

      {ehAdmin && (
        <>
          <FormProjeto
            aberto={formProjetoAberto}
            projeto={projeto}
            aoFechar={() => setFormProjetoAberto(false)}
            aoSalvar={() => {
              setFormProjetoAberto(false);
              recarregar();
            }}
          />
          <FormTarefa
            aberto={Boolean(formTarefa)}
            projeto={projeto}
            tarefa={formTarefa?.tarefa}
            statusInicial={formTarefa?.statusInicial}
            marcoInicial={formTarefa?.marcoInicial}
            marcos={marcos}
            aoFechar={() => setFormTarefa(null)}
            aoSalvar={() => {
              setFormTarefa(null);
              recarregar();
            }}
          />
        </>
      )}

      <DetalheTarefa
        idTarefa={tarefaAberta}
        aoFechar={() => setTarefaAberta(null)}
        aoMudar={recarregar}
        aoEditar={(t) => {
          setTarefaAberta(null);
          setFormTarefa({ tarefa: t });
        }}
        aoExcluir={() => {
          setTarefaAberta(null);
          recarregar();
        }}
      />
    </div>
  );
}

// Cada coluna carrega as próprias tarefas aos poucos ("Carregar mais"),
// para o quadro continuar leve em projetos com muitas tarefas.
function ColunaTarefas({ idProjeto, status, rotulo, filtros, versao, aoAbrir }) {
  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState(filtros.busca);

  useEffect(() => {
    const t = setTimeout(() => setBusca(filtros.busca), 300);
    return () => clearTimeout(t);
  }, [filtros.busca]);

  const buscar = useCallback(
    (pag) =>
      api.get(
        `/projetos/${idProjeto}/tarefas${montarQuery({
          status,
          responsavel: filtros.responsavel,
          prioridade: filtros.prioridade,
          busca,
          pagina: pag,
          limite: POR_COLUNA,
        })}`
      ),
    [idProjeto, status, filtros.responsavel, filtros.prioridade, busca]
  );

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    buscar(1)
      .then((d) => {
        if (!ativo) return;
        setItens(d.itens);
        setTotal(d.total);
        setPagina(1);
      })
      .catch((e) => ativo && setErro(e))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [buscar, versao]);

  const carregarMais = async () => {
    setCarregando(true);
    try {
      const d = await buscar(pagina + 1);
      setItens((atuais) => [...atuais, ...d.itens]);
      setTotal(d.total);
      setPagina(pagina + 1);
    } catch (e) {
      setErro(e);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <section className={`coluna coluna-${status}`}>
      <header className="coluna-topo">
        <h2>{rotulo}</h2>
        <span className="contador">{total}</span>
      </header>
      <MensagemErro erro={erro} />
      <div className="coluna-lista">
        {itens.map((t) => (
          <CartaoTarefa key={t._id} tarefa={t} aoAbrir={() => aoAbrir(t._id)} />
        ))}
        {!carregando && itens.length === 0 && <p className="coluna-vazia">Nenhuma tarefa</p>}
        {carregando && itens.length === 0 && <p className="coluna-vazia">Carregando…</p>}
      </div>
      {itens.length < total && (
        <button type="button" className="botao botao-fantasma" onClick={carregarMais} disabled={carregando}>
          Carregar mais ({total - itens.length})
        </button>
      )}
    </section>
  );
}

function CartaoTarefa({ tarefa, aoAbrir }) {
  return (
    <button type="button" className={`cartao-tarefa${tarefa.atrasada ? ' atrasada' : ''}`} onClick={aoAbrir}>
      <span className="cartao-tarefa-titulo">{tarefa.titulo}</span>
      {tarefa.marco?.titulo && <span className="texto-suave cartao-tarefa-marco">{tarefa.marco.titulo}</span>}
      <span className="selos">
        <SeloLado lado={tarefa.lado} />
        <SeloPrioridade prioridade={tarefa.prioridade} />
        {tarefa.atrasada && <SeloAtrasada />}
      </span>
      <span className="cartao-tarefa-rodape">
        <span className="pessoa">
          {tarefa.lado === 'cliente' ? (
            <span className="texto-suave">{tarefa.responsavelExterno || 'Cliente'}</span>
          ) : tarefa.responsavel ? (
            <>
              <Avatar nome={tarefa.responsavel.nome} tamanho="pequeno" />
              {tarefa.responsavel.nome.split(' ')[0]}
            </>
          ) : (
            <span className="texto-suave">Sem responsável</span>
          )}
        </span>
        <span className="texto-suave">
          {tarefa.prazo ? formatarData(tarefa.prazo) : 'Sem prazo'} · {formatarHorasPar(tarefa.horasGastas, tarefa.horasEstimadas)}
        </span>
      </span>
    </button>
  );
}

function AndamentoEquipe({ andamento }) {
  const { porIntegrante, porPrioridade, semResponsavel } = andamento;

  return (
    <div className="andamento">
      <p className="nota">
        Esta visão mostra <strong>onde o projeto está</strong> e onde pode precisar de ajuda. Não é um ranking: a ordem segue a lista de
        integrantes do projeto.
      </p>

      {porIntegrante.length === 0 ? (
        <p className="texto-suave">Este projeto ainda não tem integrantes.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Integrante</th>
                <th className="col-progresso">Concluídas</th>
                <th>Em andamento</th>
                <th>A fazer</th>
                <th>Atrasadas</th>
                <th>Horas (gastas / estimadas)</th>
              </tr>
            </thead>
            <tbody>
              {porIntegrante.map((i) => (
                <tr key={i.usuario._id}>
                  <td>
                    <span className="pessoa">
                      <Avatar nome={i.usuario.nome} />
                      <span>
                        <strong>{i.usuario.nome}</strong>
                        <small className="texto-suave">{i.funcao}</small>
                      </span>
                    </span>
                  </td>
                  <td className="col-progresso">
                    <span className="texto-suave">
                      {i.concluidas} de {i.total}
                    </span>
                    <Progresso valor={i.percentual} />
                  </td>
                  <td>{i.emAndamento}</td>
                  <td>{i.aFazer}</td>
                  <td>{i.atrasadas > 0 ? <span className="aviso-atraso">{i.atrasadas}</span> : 0}</td>
                  <td>
                    {formatarHoras(i.horasGastas)} / {formatarHoras(i.horasEstimadas)}
                  </td>
                </tr>
              ))}
              {semResponsavel && (
                <tr className="linha-suave">
                  <td>Sem responsável</td>
                  <td className="col-progresso">
                    <span className="texto-suave">
                      {semResponsavel.concluidas} de {semResponsavel.total}
                    </span>
                    <Progresso valor={semResponsavel.percentual} />
                  </td>
                  <td>{semResponsavel.emAndamento}</td>
                  <td>{semResponsavel.aFazer}</td>
                  <td>{semResponsavel.atrasadas}</td>
                  <td>
                    {formatarHoras(semResponsavel.horasGastas)} / {formatarHoras(semResponsavel.horasEstimadas)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="subtitulo">Por prioridade</h2>
      <div className="indicadores">
        {Object.keys(PRIORIDADES).map((p) => {
          const d = porPrioridade[p];
          return (
            <div className="indicador" key={p}>
              <span className="indicador-rotulo">
                Prioridade <SeloPrioridade prioridade={p} />
              </span>
              <strong>
                {d.concluidas}
                <small>/{d.total}</small>
              </strong>
              <Progresso valor={d.percentual} />
              <span className="texto-suave">{d.atrasadas} atrasada(s)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, montarQuery } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Carregando, MensagemErro, Paginacao, Progresso, SeloStatusProjeto, Vazio } from '../components/Elementos.jsx';
import FormProjeto from '../components/FormProjeto.jsx';
import { STATUS_PROJETO, formatarData } from '../utils/formatos.js';
import { useAoAlterarDados } from '../utils/eventos.js';

export default function Projetos() {
  const { ehAdmin } = useAuth();
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState({ busca: '', status: '', pagina: 1 });
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [params, setParams] = useSearchParams();

  // Menu "Novo projeto" chega aqui com ?novo=1
  useEffect(() => {
    if (params.get('novo') === '1') {
      if (ehAdmin) setFormAberto(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, ehAdmin]);

  const carregar = useCallback(() => {
    setErro(null);
    api
      .get(`/projetos${montarQuery(filtros)}`)
      .then(setDados)
      .catch(setErro);
  }, [filtros]);

  useEffect(carregar, [carregar]);
  useAoAlterarDados(carregar);

  // Espera o usuário parar de digitar antes de buscar.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.busca === buscaDigitada ? f : { ...f, busca: buscaDigitada, pagina: 1 })), 350);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Projetos</h1>
          <p className="texto-suave">{ehAdmin ? 'Todos os projetos' : 'Projetos de que você participa'}</p>
        </div>
        {ehAdmin && (
          <button type="button" className="botao" onClick={() => setFormAberto(true)}>
            + Novo projeto
          </button>
        )}
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nome ou cliente…"
          value={buscaDigitada}
          onChange={(e) => setBuscaDigitada(e.target.value)}
          aria-label="Buscar projetos"
        />
        <select
          value={filtros.status}
          onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value, pagina: 1 }))}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_PROJETO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <MensagemErro erro={erro} />
      {!dados && !erro && <Carregando />}
      {dados && dados.itens.length === 0 && (
        <Vazio>{ehAdmin ? 'Nenhum projeto encontrado. Crie o primeiro!' : 'Você ainda não participa de nenhum projeto.'}</Vazio>
      )}

      {dados && dados.itens.length > 0 && (
        <div className="grade-cartoes">
          {dados.itens.map((p) => (
            <Link key={p._id} to={`/projetos/${p._id}`} className="cartao cartao-projeto">
              <div className="cartao-projeto-topo">
                <SeloStatusProjeto status={p.status} />
                {p.resumo.atrasadas > 0 && <span className="aviso-atraso">{p.resumo.atrasadas} atrasada(s)</span>}
              </div>
              <h2>{p.nome}</h2>
              {p.cliente && <p className="texto-suave">{p.cliente}</p>}
              <Progresso valor={p.resumo.percentual} />
              <dl className="cartao-dados">
                <div>
                  <dt>Tarefas</dt>
                  <dd>
                    {p.resumo.concluidas}/{p.resumo.total}
                  </dd>
                </div>
                <div>
                  <dt>Equipe</dt>
                  <dd>{p.totalIntegrantes}</dd>
                </div>
                <div>
                  <dt>Prazo</dt>
                  <dd>{formatarData(p.prazo)}</dd>
                </div>
              </dl>
              <p className="cartao-rodape">Responsável: {p.responsavel?.nome || '—'}</p>
            </Link>
          ))}
        </div>
      )}

      {dados && <Paginacao pagina={dados.pagina} paginas={dados.paginas} aoMudar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />}

      {ehAdmin && (
        <FormProjeto
          aberto={formAberto}
          aoFechar={() => setFormAberto(false)}
          aoSalvar={(novo) => {
            setFormAberto(false);
            navegar(`/projetos/${novo._id}`);
          }}
        />
      )}
    </div>
  );
}

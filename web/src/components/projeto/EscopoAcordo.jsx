// Escopo do projeto (o que vai / o que não vai) e o acordo assinado pelas duas partes.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { MensagemErro, Modal, SeloStatusAcordo } from '../Elementos.jsx';
import { formatarDataHora } from '../../utils/formatos.js';

function ListaEditavel({ titulo, tipo, itens, aoMudar, editavel }) {
  const [novo, setNovo] = useState('');
  const adicionar = (e) => {
    e.preventDefault();
    const texto = novo.trim();
    if (!texto) return;
    aoMudar([...itens, texto]);
    setNovo('');
  };
  return (
    <section className={`escopo-lista escopo-${tipo}`}>
      <h3>
        <span aria-hidden="true">{tipo === 'incluido' ? '✓' : '✕'}</span> {titulo}
        <span className="contador">{itens.length}</span>
      </h3>
      {itens.length === 0 && <p className="texto-suave">Nenhum item.</p>}
      <ul>
        {itens.map((texto, i) => (
          <li key={`${i}-${texto}`}>
            <span>{texto}</span>
            {editavel && (
              <button type="button" className="botao-icone" aria-label={`Remover "${texto}"`} onClick={() => aoMudar(itens.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {editavel && (
        <form className="escopo-adicionar" onSubmit={adicionar}>
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder={tipo === 'incluido' ? 'Ex.: Dashboard administrativo para o SEPE' : 'Ex.: Compra do domínio'}
            maxLength={500}
            aria-label={`Novo item em ${titulo}`}
          />
          <button type="submit" className="botao botao-secundario">
            Adicionar
          </button>
        </form>
      )}
    </section>
  );
}

function Assinaturas({ acordo }) {
  const e = acordo.assinaturaEmpresa;
  const c = acordo.assinaturaCliente;
  return (
    <div className="assinaturas">
      <div className={`assinatura${e?.em ? ' feita' : ''}`}>
        <span className="assinatura-rotulo">Awakelab</span>
        {e?.em ? (
          <>
            <strong>✓ {e.nome}</strong>
            <small>assinou em {formatarDataHora(e.em)}</small>
          </>
        ) : (
          <small>Aguardando a assinatura do responsável</small>
        )}
      </div>
      <div className={`assinatura${c?.em ? ' feita' : ''}`}>
        <span className="assinatura-rotulo">Cliente</span>
        {c?.em ? (
          <>
            <strong>✓ {c.nome || c.email}</strong>
            <small>concordou pelo e-mail em {formatarDataHora(c.em)}</small>
          </>
        ) : (
          <small>
            {acordo.cliente?.email ? `Aguardando ${acordo.cliente.nome || acordo.cliente.email} clicar em "Concordo" no e-mail` : 'Ainda não enviado'}
          </small>
        )}
      </div>
    </div>
  );
}

function Comprovante({ id, aoFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    if (!id) return;
    setDados(null);
    api.get(`/acordos/${id}/comprovante`).then(setDados).catch(setErro);
  }, [id]);

  return (
    <Modal titulo={dados ? `Comprovante – versão ${dados.versao}` : 'Comprovante'} aberto={Boolean(id)} aoFechar={aoFechar} largura={760}>
      <MensagemErro erro={erro} />
      {!dados && !erro && <p className="texto-suave">Carregando…</p>}
      {dados && (
        <div className="comprovante">
          <dl className="lista-dados">
            <div>
              <dt>Projeto</dt>
              <dd>{dados.projeto?.nome}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <SeloStatusAcordo status={dados.status} />
              </dd>
            </div>
            <div>
              <dt>Enviado por</dt>
              <dd>{dados.enviadoPor?.nome || '—'}</dd>
            </div>
            <div>
              <dt>Enviado em</dt>
              <dd>{formatarDataHora(dados.enviadoEm)}</dd>
            </div>
          </dl>
          <Assinaturas acordo={dados} />
          {dados.assinaturaCliente?.em && (
            <p className="texto-suave">
              Registro da concordância do cliente: IP {dados.assinaturaCliente.ip || '—'} · {dados.assinaturaCliente.navegador || '—'}
            </p>
          )}
          <h3>E-mails anexados</h3>
          {dados.emails.length === 0 && <p className="texto-suave">Nenhum e-mail.</p>}
          {dados.emails.map((e, i) => (
            <details key={i} className="email-anexo" open={i === dados.emails.length - 1}>
              <summary>
                <strong>{e.tipo === 'pedido' ? 'Pedido de concordância' : 'Confirmação de concordância'}</strong> · {formatarDataHora(e.enviadoEm)}
                {e.modo === 'teste' && <span className="selo selo-acordo-rascunho">modo teste</span>}
              </summary>
              <p className="texto-suave">
                De: {e.de}
                <br />
                Para: {e.para.join(', ')}
                <br />
                Assunto: {e.assunto}
              </p>
              <iframe title={`E-mail ${i + 1}`} sandbox="" srcDoc={e.html} className="email-previa" />
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function EscopoAcordo({ projeto, versao, aoMudar }) {
  const { usuario, ehAdmin } = useAuth();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [edicao, setEdicao] = useState(null); // { incluidos: [], naoIncluidos: [], observacoes }
  const [alterado, setAlterado] = useState(false);
  const [aviso, setAviso] = useState(null); // { modo, linkTeste }
  const [comprovante, setComprovante] = useState(null);

  const carregar = useCallback(() => {
    api
      .get(`/projetos/${projeto._id}/acordos`)
      .then((d) => {
        setDados(d);
        const r = d.emAndamento?.status === 'rascunho' ? d.emAndamento : null;
        setEdicao(r ? { incluidos: r.incluidos.map((i) => i.texto), naoIncluidos: r.naoIncluidos.map((i) => i.texto), observacoes: r.observacoes || '' } : null);
        setAlterado(false);
      })
      .catch(setErro);
  }, [projeto._id]);

  useEffect(carregar, [carregar, versao]);

  const executar = async (fn) => {
    setErro(null);
    setOcupado(true);
    try {
      const r = await fn();
      carregar();
      aoMudar?.();
      return r;
    } catch (e) {
      setErro(e);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const abrirRascunho = () => executar(() => api.post(`/projetos/${projeto._id}/acordos/rascunho`));
  const salvar = () => executar(() => api.patch(`/acordos/${dados.emAndamento._id}`, edicao));
  const enviar = async () => {
    const rc = projeto.responsavelCliente;
    if (!rc?.email) {
      setErro(new Error('Cadastre o e-mail do responsável do cliente em "Editar projeto" antes de enviar.'));
      return;
    }
    if (!window.confirm(`Enviar a versão ${dados.emAndamento.versao} do acordo para ${rc.nome || rc.email} (${rc.email})?`)) return;
    const r = await executar(async () => {
      if (alterado) await api.patch(`/acordos/${dados.emAndamento._id}`, edicao);
      return api.post(`/acordos/${dados.emAndamento._id}/enviar`);
    });
    if (r) setAviso({ modo: r.modoEmail, linkTeste: r.linkTeste });
  };
  const assinar = () => {
    if (!window.confirm('Confirmar a sua assinatura pela Awakelab neste acordo?')) return;
    executar(() => api.post(`/acordos/${dados.emAndamento._id}/assinar`));
  };
  const cancelar = () => {
    if (!window.confirm('Cancelar esta versão? O link enviado ao cliente deixará de funcionar.')) return;
    setAviso(null);
    executar(() => api.post(`/acordos/${dados.emAndamento._id}/cancelar`));
  };

  if (!dados) return erro ? <MensagemErro erro={erro} /> : <p className="texto-suave">Carregando escopo…</p>;

  const atual = dados.emAndamento || dados.vigente;
  const ehResponsavel = String(dados.responsavelEmpresa?._id) === String(usuario?._id);
  const emEdicao = Boolean(edicao) && ehAdmin;
  const listas = edicao || {
    incluidos: atual?.incluidos.map((i) => i.texto) || [],
    naoIncluidos: atual?.naoIncluidos.map((i) => i.texto) || [],
    observacoes: atual?.observacoes || '',
  };
  const mudarLista = (campo) => (itens) => {
    setEdicao((e) => ({ ...e, [campo]: itens }));
    setAlterado(true);
  };
  const rc = dados.responsavelCliente;

  return (
    <div className="escopo">
      <div className="partes">
        <div>
          <span className="assinatura-rotulo">Responsável Awakelab</span>
          <strong>{dados.responsavelEmpresa?.nome || '—'}</strong>
        </div>
        <div>
          <span className="assinatura-rotulo">Responsável do cliente</span>
          <strong>{rc?.nome || '—'}</strong>
          <small>{rc?.email || 'sem e-mail cadastrado'}</small>
        </div>
      </div>

      <MensagemErro erro={erro} />

      {aviso && (
        <div className={`alerta ${aviso.modo === 'teste' ? 'alerta-aviso' : 'alerta-ok'}`}>
          {aviso.modo === 'teste' ? (
            <>
              <strong>Modo teste:</strong> o e-mail foi gerado e anexado, mas não foi enviado de verdade (configure seu e-mail em "Minha conta").{' '}
              <a href={aviso.linkTeste} target="_blank" rel="noreferrer">
                Abrir a página do cliente
              </a>{' '}
              para simular o clique em "Concordo".
            </>
          ) : (
            <>E-mail enviado para {rc?.email}. Quando o cliente clicar em "Concordo", a assinatura aparece aqui.</>
          )}
        </div>
      )}

      {!atual && (
        <div className="estado-vazio">
          Ainda não há escopo definido para este projeto.
          {ehAdmin && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="botao" onClick={abrirRascunho} disabled={ocupado}>
                Definir o escopo
              </button>
            </div>
          )}
        </div>
      )}

      {atual && (
        <section className="escopo-versao">
          <header className="escopo-topo">
            <div className="titulo-linha">
              <h2>Versão {atual.versao}</h2>
              <SeloStatusAcordo status={atual.status} />
              {atual.status === 'assinado' && <span className="texto-suave">vigente desde {formatarDataHora(atual.assinadoEm)}</span>}
            </div>
            <div className="grupo-botoes">
              {atual.status === 'rascunho' && ehAdmin && (
                <>
                  <button type="button" className="botao botao-secundario" onClick={salvar} disabled={ocupado || !alterado}>
                    {alterado ? 'Salvar rascunho' : 'Salvo'}
                  </button>
                  <button type="button" className="botao" onClick={enviar} disabled={ocupado}>
                    Enviar para assinatura
                  </button>
                </>
              )}
              {atual.status === 'aguardando' && ehResponsavel && !atual.assinaturaEmpresa?.em && (
                <button type="button" className="botao" onClick={assinar} disabled={ocupado}>
                  Assinar pela Awakelab
                </button>
              )}
              {atual.status === 'aguardando' && ehAdmin && (
                <button type="button" className="botao botao-perigo-fantasma" onClick={cancelar} disabled={ocupado}>
                  Cancelar envio
                </button>
              )}
              {atual.status === 'assinado' && ehAdmin && (
                <button type="button" className="botao botao-secundario" onClick={abrirRascunho} disabled={ocupado}>
                  Alterar escopo (nova versão)
                </button>
              )}
            </div>
          </header>

          {atual.status === 'rascunho' && (
            <p className="nota">
              Rascunho: altere as listas e clique em <strong>Enviar para assinatura</strong>. O cliente recebe um e-mail com o botão "Concordo", e o
              responsável da Awakelab assina aqui. Toda alteração depois disso gera uma nova versão.
            </p>
          )}
          {atual.status === 'aguardando' && <Assinaturas acordo={atual} />}
          {atual.status === 'aguardando' && !ehResponsavel && !atual.assinaturaEmpresa?.em && (
            <p className="texto-suave">Só {dados.responsavelEmpresa?.nome} (responsável do projeto) pode assinar pela Awakelab.</p>
          )}

          <div className="escopo-colunas">
            <ListaEditavel titulo="Vai no projeto" tipo="incluido" itens={listas.incluidos} editavel={emEdicao} aoMudar={mudarLista('incluidos')} />
            <ListaEditavel titulo="Não vai no projeto" tipo="nao-incluido" itens={listas.naoIncluidos} editavel={emEdicao} aoMudar={mudarLista('naoIncluidos')} />
          </div>

          {(emEdicao || listas.observacoes) && (
            <label className="campo">
              <span className="campo-rotulo">Observações do acordo</span>
              {emEdicao ? (
                <textarea
                  rows={3}
                  value={listas.observacoes}
                  maxLength={3000}
                  onChange={(e) => {
                    setEdicao((ed) => ({ ...ed, observacoes: e.target.value }));
                    setAlterado(true);
                  }}
                />
              ) : (
                <p className="descricao">{listas.observacoes}</p>
              )}
            </label>
          )}

          {atual.status === 'assinado' && <Assinaturas acordo={atual} />}
        </section>
      )}

      {dados.versoes.length > 0 && (
        <>
          <h2 className="subtitulo">Histórico de versões</h2>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Versão</th>
                  <th>Status</th>
                  <th>Itens</th>
                  <th>Enviado</th>
                  <th>Awakelab</th>
                  <th>Cliente</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.versoes.map((v) => (
                  <tr key={v._id}>
                    <td>v{v.versao}</td>
                    <td>
                      <SeloStatusAcordo status={v.status} />
                    </td>
                    <td>
                      {v.incluidos.length} vão · {v.naoIncluidos.length} não vão
                    </td>
                    <td>{v.enviadoEm ? formatarDataHora(v.enviadoEm) : '—'}</td>
                    <td>{v.assinaturaEmpresa?.em ? `✓ ${formatarDataHora(v.assinaturaEmpresa.em)}` : '—'}</td>
                    <td>{v.assinaturaCliente?.em ? `✓ ${formatarDataHora(v.assinaturaCliente.em)}` : '—'}</td>
                    <td>
                      {v.enviadoEm && (
                        <button type="button" className="botao botao-fantasma" onClick={() => setComprovante(v._id)}>
                          Comprovante
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Comprovante id={comprovante} aoFechar={() => setComprovante(null)} />
    </div>
  );
}

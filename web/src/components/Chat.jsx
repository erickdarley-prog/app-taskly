// Assistente de chat: janela flutuante que conversa com a API (/api/chat).
// Pode ser removido apagando este arquivo e a linha <Chat /> em Layout.jsx.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { avisarDadosAlterados } from '../utils/eventos.js';

const SUGESTOES_ADMIN = [
  'Quero criar um novo projeto',
  'Como está o andamento dos projetos?',
  'Quais tarefas estão atrasadas no Portal do Aluno?',
  'Cadastrar um novo usuário',
];
const SUGESTOES_EQUIPE = [
  'O que eu tenho pra fazer?',
  'Tenho alguma tarefa atrasada?',
  'Trabalhei 2 horas hoje numa tarefa',
  'Como está o andamento dos meus projetos?',
];

// Formatação simples e segura: **negrito**, listas com "-" e quebras de linha.
function Negrito({ texto }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>
  );
}

function TextoFormatado({ texto }) {
  // Agrupa linhas seguidas de lista num mesmo bloco.
  const grupos = [];
  texto.split('\n').forEach((linha) => {
    const item = linha.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    const ultimo = grupos[grupos.length - 1];
    if (item) {
      if (ultimo?.tipo === 'lista') ultimo.itens.push(item[1]);
      else grupos.push({ tipo: 'lista', itens: [item[1]] });
    } else if (linha.trim()) {
      grupos.push({ tipo: 'paragrafo', texto: linha });
    }
  });
  return grupos.map((g, i) =>
    g.tipo === 'lista' ? (
      <ul key={i}>
        {g.itens.map((t, j) => (
          <li key={j}>
            <Negrito texto={t} />
          </li>
        ))}
      </ul>
    ) : (
      <p key={i}>
        <Negrito texto={g.texto} />
      </p>
    )
  );
}

function CartaoSenha({ extra }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(extra.senha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* navegador sem permissão de copiar: a senha continua visível */
    }
  };
  return (
    <div className="chat-senha">
      <span>
        Senha temporária de <strong>{extra.nome}</strong> ({extra.email})
      </span>
      <code>{extra.senha}</code>
      <button type="button" className="botao botao-secundario" onClick={copiar}>
        {copiado ? 'Copiada!' : 'Copiar'}
      </button>
      <small>Mostrada só aqui, uma vez. Passe para a pessoa e peça que troque em "Minha conta".</small>
    </div>
  );
}

export default function Chat() {
  const { ehAdmin } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [configurado, setConfigurado] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const fimRef = useRef(null);
  const campoRef = useRef(null);

  useEffect(() => {
    if (!aberto || carregado) return;
    api
      .get('/chat')
      .then((d) => {
        setConfigurado(d.configurado);
        setMensagens(d.mensagens);
      })
      .catch((e) => setMensagens([{ papel: 'erro', texto: e.message }]))
      .finally(() => setCarregado(true));
  }, [aberto, carregado]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, enviando, aberto]);

  useEffect(() => {
    if (aberto) campoRef.current?.focus();
  }, [aberto]);

  const enviar = useCallback(
    async (conteudo) => {
      const mensagem = (conteudo ?? texto).trim();
      if (!mensagem || enviando) return;
      setTexto('');
      setMensagens((m) => [...m, { papel: 'usuario', texto: mensagem }]);
      setEnviando(true);
      try {
        const r = await api.post('/chat', { mensagem });
        setMensagens((m) => [...m, { papel: 'assistente', texto: r.resposta, extras: r.extras }]);
        if (r.alterou) avisarDadosAlterados();
      } catch (e) {
        setMensagens((m) => [...m, { papel: 'erro', texto: e.message }]);
      } finally {
        setEnviando(false);
        campoRef.current?.focus();
      }
    },
    [texto, enviando]
  );

  const novaConversa = async () => {
    try {
      await api.del('/chat');
      setMensagens([]);
    } catch (e) {
      setMensagens((m) => [...m, { papel: 'erro', texto: e.message }]);
    }
  };

  const aoTeclar = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  const sugestoes = ehAdmin ? SUGESTOES_ADMIN : SUGESTOES_EQUIPE;

  return (
    <>
      {!aberto && (
        <button type="button" className="chat-botao" onClick={() => setAberto(true)} aria-label="Abrir assistente">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"
              fill="currentColor"
            />
          </svg>
          Assistente
        </button>
      )}

      {aberto && (
        <section className="chat-painel" aria-label="Assistente do Taskly">
          <header className="chat-topo">
            <div>
              <strong>Assistente</strong>
              <small>{ehAdmin ? 'Pode criar, editar e consultar tudo' : 'Consulte e atualize suas tarefas'}</small>
            </div>
            <div className="chat-topo-acoes">
              <button type="button" className="botao botao-fantasma claro" onClick={novaConversa} disabled={enviando}>
                Nova conversa
              </button>
              <button type="button" className="botao-icone claro" onClick={() => setAberto(false)} aria-label="Fechar assistente">
                ×
              </button>
            </div>
          </header>

          <div className="chat-mensagens" aria-live="polite">
            {!configurado && (
              <div className="alerta alerta-erro">
                O assistente ainda não está configurado. Coloque a <code>OPENAI_API_KEY</code> no arquivo <code>api/.env</code> e reinicie a API.
              </div>
            )}

            {carregado && mensagens.length === 0 && (
              <div className="chat-boas-vindas">
                <p>
                  Olá! Me diga o que você precisa e eu faço por você. {ehAdmin ? 'Posso criar projetos, tarefas e usuários, ' : 'Posso mostrar suas tarefas, '}
                  {ehAdmin ? 'atualizar status e mostrar o andamento.' : 'mudar o status e lançar suas horas.'}
                </p>
                <div className="chat-sugestoes">
                  {sugestoes.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)} disabled={enviando || !configurado}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensagens.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.papel}`}>
                {m.papel === 'assistente' ? <TextoFormatado texto={m.texto} /> : <p>{m.texto}</p>}
                {m.extras?.filter((x) => x.tipo === 'senha').map((x) => (
                  <CartaoSenha key={x.email} extra={x} />
                ))}
              </div>
            ))}

            {enviando && (
              <div className="chat-msg chat-msg-assistente chat-digitando" aria-label="Assistente digitando">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <form
            className="chat-entrada"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <textarea
              ref={campoRef}
              rows={1}
              placeholder="Escreva aqui… (Enter envia)"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              disabled={!configurado}
              maxLength={4000}
              aria-label="Mensagem para o assistente"
            />
            <button type="submit" className="botao" disabled={enviando || !texto.trim() || !configurado}>
              Enviar
            </button>
          </form>
        </section>
      )}
    </>
  );
}

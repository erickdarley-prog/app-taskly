import { useCallback, useEffect, useState } from 'react';
import { api, montarQuery } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Campo, Carregando, MensagemErro, Modal, Paginacao, Vazio } from '../components/Elementos.jsx';
import { useAoAlterarDados } from '../utils/eventos.js';

const VAZIO = { nome: '', email: '', senha: '', papel: 'equipe', funcao: '', ativo: true };

export default function Usuarios() {
  const { usuario: eu } = useAuth();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null); // null | {} (novo) | usuario

  const carregar = useCallback(() => {
    setErro(null);
    api
      .get(`/usuarios${montarQuery({ busca, pagina, limite: 20 })}`)
      .then(setDados)
      .catch(setErro);
  }, [busca, pagina]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);
  useAoAlterarDados(carregar);

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Usuários</h1>
          <p className="texto-suave">Quem pode entrar no Taskly. Administradores criam projetos e tarefas; a equipe atualiza as próprias tarefas.</p>
        </div>
        <button type="button" className="botao" onClick={() => setEditando({})}>
          + Novo usuário
        </button>
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nome ou e-mail…"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(1);
          }}
          aria-label="Buscar usuários"
        />
      </div>

      <MensagemErro erro={erro} />
      {!dados && !erro && <Carregando />}
      {dados && dados.itens.length === 0 && <Vazio>Nenhum usuário encontrado.</Vazio>}

      {dados && dados.itens.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela tabela-clicavel">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Função</th>
                <th>Perfil</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((u) => (
                <tr key={u._id} onClick={() => setEditando(u)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditando(u)}>
                  <td>
                    <span className="pessoa">
                      <Avatar nome={u.nome} />
                      <strong>{u.nome}</strong>
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.funcao || '—'}</td>
                  <td>
                    <span className={`selo ${u.papel === 'admin' ? 'selo-admin' : 'selo-neutro'}`}>{u.papel === 'admin' ? 'Admin' : 'Equipe'}</span>
                  </td>
                  <td>{u.ativo ? 'Ativo' : <span className="texto-suave">Desativado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados && <Paginacao pagina={dados.pagina} paginas={dados.paginas} aoMudar={setPagina} />}

      <FormUsuario
        usuario={editando}
        ehEuMesmo={editando?._id === eu?._id}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => {
          setEditando(null);
          carregar();
        }}
      />
    </div>
  );
}

function FormUsuario({ usuario, ehEuMesmo, aoFechar, aoSalvar }) {
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const novo = !usuario?._id;

  useEffect(() => {
    if (!usuario) return;
    setForm({ ...VAZIO, ...usuario, senha: '' });
    setErro(null);
  }, [usuario]);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const corpo = { nome: form.nome, email: form.email, papel: form.papel, funcao: form.funcao };
      if (form.senha) corpo.senha = form.senha;
      if (novo) await api.post('/usuarios', corpo);
      else await api.patch(`/usuarios/${usuario._id}`, { ...corpo, ativo: form.ativo });
      aoSalvar();
    } catch (err) {
      setErro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={novo ? 'Novo usuário' : 'Editar usuário'} aberto={Boolean(usuario)} aoFechar={aoFechar} largura={520}>
      <form onSubmit={enviar} className="formulario">
        <Campo rotulo="Nome">
          <input value={form.nome} onChange={mudar('nome')} required maxLength={120} autoFocus />
        </Campo>
        <Campo rotulo="E-mail">
          <input type="email" value={form.email} onChange={mudar('email')} required />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Função">
            <input value={form.funcao} onChange={mudar('funcao')} placeholder="Ex.: Front-end" maxLength={80} />
          </Campo>
          <Campo rotulo="Perfil">
            <select value={form.papel} onChange={mudar('papel')} disabled={ehEuMesmo}>
              <option value="equipe">Equipe</option>
              <option value="admin">Admin</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo={novo ? 'Senha' : 'Nova senha'} dica={novo ? 'Mínimo de 6 caracteres' : 'Deixe em branco para manter a senha atual'}>
          <input type="password" value={form.senha} onChange={mudar('senha')} minLength={6} required={novo} autoComplete="new-password" />
        </Campo>
        {!novo && (
          <label className="checkbox">
            <input type="checkbox" checked={form.ativo} disabled={ehEuMesmo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            Usuário ativo (pode entrar no sistema)
          </label>
        )}
        <MensagemErro erro={erro} />
        <div className="acoes">
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

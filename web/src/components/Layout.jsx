import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CheckSquare, FolderKanban, LogOut, Menu, Plus, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './Elementos.jsx';
import MinhaConta from './MinhaConta.jsx';
import Chat from './Chat.jsx';

const LOGO_AWAKELAB_ESCURO = 'https://media.awakelab.world/MARCA_AWK26/awakelab_logo_fondo-oscuro_transparente.png';
const ISOTIPO_AWAKELAB_CLARO = 'https://media.awakelab.world/MARCA_AWK26/awakelab_isotipo_fondo-blanco_transparente.png';

// Subtítulo do topo conforme a tela aberta
function secaoAtual(caminho) {
  if (caminho.startsWith('/projetos/')) return 'Projeto';
  if (caminho.startsWith('/minhas-tarefas')) return 'Minhas tarefas';
  if (caminho.startsWith('/usuarios')) return 'Usuários';
  return 'Projetos de clientes';
}

export default function Layout() {
  const { usuario, ehAdmin, sair } = useAuth();
  const { pathname } = useLocation();
  const [contaAberta, setContaAberta] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  const link = ({ isActive }) => `menu-link${isActive ? ' ativo' : ''}`;

  return (
    <div className="app">
      <header className="barra-topo">
        <button
          type="button"
          className="barra-topo-menu"
          onClick={() => setMenuAberto((v) => !v)}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
        >
          {menuAberto ? <X size={22} /> : <Menu size={22} />}
        </button>
        <MarcaAwakelab />
        <span className="barra-topo-divisor" aria-hidden="true" />
        <div className="barra-topo-titulo">
          <strong>Taskly</strong>
          <small>{secaoAtual(pathname)}</small>
        </div>
        <div className="barra-topo-usuario">
          <button type="button" className="usuario-botao" onClick={() => setContaAberta(true)} title="Minha conta">
            <Avatar nome={usuario?.nome} />
            <span>
              <strong>{usuario?.nome}</strong>
              <small>{ehAdmin ? 'Administrador' : usuario?.funcao || 'Equipe'}</small>
            </span>
          </button>
          <button type="button" className="barra-topo-sair" onClick={sair} aria-label="Sair" title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="app-corpo">
        <aside className={`menu-lateral${menuAberto ? ' aberto' : ''}`} onClick={() => setMenuAberto(false)}>
          <nav className="menu">
            <NavLink to="/projetos" className={link}>
              <FolderKanban size={19} /> Projetos
            </NavLink>
            {ehAdmin && (
              <NavLink to="/projetos?novo=1" className={() => 'menu-link'}>
                <Plus size={19} /> Novo projeto
              </NavLink>
            )}
            <NavLink to="/minhas-tarefas" className={link}>
              <CheckSquare size={19} /> Minhas tarefas
            </NavLink>
            {ehAdmin && (
              <NavLink to="/usuarios" className={link}>
                <Users size={19} /> Usuários
              </NavLink>
            )}
          </nav>
          <div className="menu-rodape">
            <img src={ISOTIPO_AWAKELAB_CLARO} alt="" width="30" height="30" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <span>
              <strong>Taskly</strong>
              <small>gestão de projetos · Awakelab</small>
            </span>
          </div>
        </aside>

        <main className="conteudo">
          <Outlet />
        </main>
      </div>

      <MinhaConta aberto={contaAberta} aoFechar={() => setContaAberta(false)} />
      <Chat />
    </div>
  );
}

// Logo da Awakelab para fundos escuros; se a imagem não carregar (sem internet), mostra o nome em texto.
export function MarcaAwakelab({ altura = 30 }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <span className="marca-texto">awakelab</span>;
  return <img className="marca-awakelab" src={LOGO_AWAKELAB_ESCURO} alt="Awakelab" style={{ height: altura }} onError={() => setFalhou(true)} />;
}

// Marca do Taskly (ícone + nome)
export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--ciano)" />
        <path d="M9 16.5l4.5 4.5L23 11" stroke="var(--marinho)" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Taskly
    </span>
  );
}

import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CheckSquare, FolderKanban, LogOut, Menu, Plus, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './Elementos.jsx';
import MiCuenta from './MiCuenta.jsx';
import Chat from './Chat.jsx';

const LOGO_AWAKELAB_OSCURO = 'https://media.awakelab.world/MARCA_AWK26/awakelab_logo_fondo-oscuro_transparente.png';
const ISOTIPO_AWAKELAB_CLARO = 'https://media.awakelab.world/MARCA_AWK26/awakelab_isotipo_fondo-blanco_transparente.png';

// Subtítulo de la cabecera según la pantalla abierta
function seccionActual(ruta) {
  if (ruta.startsWith('/proyectos/')) return 'Proyecto';
  if (ruta.startsWith('/mis-tareas')) return 'Mis tareas';
  if (ruta.startsWith('/usuarios')) return 'Usuarios';
  return 'Proyectos de clientes';
}

export default function Layout() {
  const { usuario, esAdmin, salir } = useAuth();
  const { pathname } = useLocation();
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const link = ({ isActive }) => `menu-link${isActive ? ' activo' : ''}`;

  return (
    <div className="app">
      <header className="barra-cabecera">
        <button
          type="button"
          className="barra-cabecera-menu"
          onClick={() => setMenuAbierto((v) => !v)}
          aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuAbierto}
        >
          {menuAbierto ? <X size={22} /> : <Menu size={22} />}
        </button>
        <MarcaAwakelab />
        <span className="barra-cabecera-divisor" aria-hidden="true" />
        <div className="barra-cabecera-titulo">
          <strong>Taskly</strong>
          <small>{seccionActual(pathname)}</small>
        </div>
        <div className="barra-cabecera-usuario">
          <button type="button" className="usuario-boton" onClick={() => setCuentaAbierta(true)} title="Mi cuenta">
            <Avatar nombre={usuario?.nombre} />
            <span>
              <strong>{usuario?.nombre}</strong>
              <small>{esAdmin ? 'Administrador' : usuario?.funcion || 'Equipo'}</small>
            </span>
          </button>
          <button type="button" className="barra-cabecera-salir" onClick={salir} aria-label="Salir" title="Salir">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="app-cuerpo">
        <aside className={`menu-lateral${menuAbierto ? ' abierto' : ''}`} onClick={() => setMenuAbierto(false)}>
          <nav className="menu">
            <NavLink to="/proyectos" className={link}>
              <FolderKanban size={19} /> Proyectos
            </NavLink>
            {esAdmin && (
              <NavLink to="/proyectos?nuevo=1" className={() => 'menu-link'}>
                <Plus size={19} /> Nuevo proyecto
              </NavLink>
            )}
            <NavLink to="/mis-tareas" className={link}>
              <CheckSquare size={19} /> Mis tareas
            </NavLink>
            {esAdmin && (
              <NavLink to="/usuarios" className={link}>
                <Users size={19} /> Usuarios
              </NavLink>
            )}
          </nav>
          <div className="menu-pie">
            <img src={ISOTIPO_AWAKELAB_CLARO} alt="" width="30" height="30" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <span>
              <strong>Taskly</strong>
              <small>gestión de proyectos · Awakelab</small>
            </span>
          </div>
        </aside>

        <main className="contenido">
          <Outlet />
        </main>
      </div>

      <MiCuenta abierto={cuentaAbierta} alCerrar={() => setCuentaAbierta(false)} />
      <Chat />
    </div>
  );
}

// Logo de Awakelab para fondos oscuros; si la imagen no carga (sin internet), muestra el nombre en texto.
export function MarcaAwakelab({ altura = 30 }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return <span className="marca-texto">awakelab</span>;
  return <img className="marca-awakelab" src={LOGO_AWAKELAB_OSCURO} alt="Awakelab" style={{ height: altura }} onError={() => setFallo(true)} />;
}

// Marca de Taskly (icono + nombre)
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

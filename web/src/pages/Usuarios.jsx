import { useCallback, useEffect, useState } from 'react';
import { api, montarQuery } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Campo, Cargando, MensajeError, Modal, Paginacion, Vacio } from '../components/Elementos.jsx';
import { useAlModificarDatos } from '../utils/eventos.js';

const VACIO = { nombre: '', email: '', contrasena: '', rol: 'equipo', funcion: '', activo: true };

export default function Usuarios() {
  const { usuario: eu } = useAuth();
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null); // null | {} (nuevo) | usuario

  const cargar = useCallback(() => {
    setError(null);
    api
      .get(`/usuarios${montarQuery({ busqueda, pagina, limite: 20 })}`)
      .then(setDatos)
      .catch(setError);
  }, [busqueda, pagina]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);
  useAlModificarDatos(cargar);

  return (
    <div className="pagina">
      <div className="pagina-cabecera">
        <div>
          <h1>Usuarios</h1>
          <p className="texto-suave">Quién puede entrar en Taskly. Los administradores crean proyectos y tareas; el equipo actualiza sus propias tareas.</p>
        </div>
        <button type="button" className="boton" onClick={() => setEditando({})}>
          + Nuevo usuario
        </button>
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nombre o e-mail…"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(1);
          }}
          aria-label="Buscar usuarios"
        />
      </div>

      <MensajeError error={error} />
      {!datos && !error && <Cargando />}
      {datos && datos.items.length === 0 && <Vacio>No se ha encontrado ningún usuario.</Vacio>}

      {datos && datos.items.length > 0 && (
        <div className="tabla-desplazamiento">
          <table className="tabla tabla-clicable">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>E-mail</th>
                <th>Función</th>
                <th>Perfil</th>
                <th>Situación</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((u) => (
                <tr key={u._id} onClick={() => setEditando(u)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditando(u)}>
                  <td>
                    <span className="persona">
                      <Avatar nombre={u.nombre} />
                      <strong>{u.nombre}</strong>
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.funcion || '—'}</td>
                  <td>
                    <span className={`sello ${u.rol === 'admin' ? 'sello-admin' : 'sello-neutro'}`}>{u.rol === 'admin' ? 'Admin' : 'Equipo'}</span>
                  </td>
                  <td>{u.activo ? 'Activo' : <span className="texto-suave">Desactivado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && <Paginacion pagina={datos.pagina} paginas={datos.paginas} alCambiar={setPagina} />}

      <FormUsuario
        usuario={editando}
        esEuMismo={editando?._id === eu?._id}
        alCerrar={() => setEditando(null)}
        alGuardar={() => {
          setEditando(null);
          cargar();
        }}
      />
    </div>
  );
}

function FormUsuario({ usuario, esEuMismo, alCerrar, alGuardar }) {
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const nuevo = !usuario?._id;

  useEffect(() => {
    if (!usuario) return;
    setForm({ ...VACIO, ...usuario, contrasena: '' });
    setError(null);
  }, [usuario]);

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = { nombre: form.nombre, email: form.email, rol: form.rol, funcion: form.funcion };
      if (form.contrasena) cuerpo.contrasena = form.contrasena;
      if (nuevo) await api.post('/usuarios', cuerpo);
      else await api.patch(`/usuarios/${usuario._id}`, { ...cuerpo, activo: form.activo });
      alGuardar();
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={nuevo ? 'Nuevo usuario' : 'Editar usuario'} abierto={Boolean(usuario)} alCerrar={alCerrar} anchura={520}>
      <form onSubmit={enviar} className="formulario">
        <Campo rotulo="Nombre">
          <input value={form.nombre} onChange={cambiar('nombre')} required maxLength={120} autoFocus />
        </Campo>
        <Campo rotulo="E-mail">
          <input type="email" value={form.email} onChange={cambiar('email')} required />
        </Campo>
        <div className="cuadricula-2">
          <Campo rotulo="Función">
            <input value={form.funcion} onChange={cambiar('funcion')} placeholder="P. ej.: Front-end" maxLength={80} />
          </Campo>
          <Campo rotulo="Perfil">
            <select value={form.rol} onChange={cambiar('rol')} disabled={esEuMismo}>
              <option value="equipo">Equipo</option>
              <option value="admin">Admin</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo={nuevo ? 'Contraseña' : 'Contraseña nueva'} pista={nuevo ? 'Mínimo 6 caracteres' : 'Déjalo en blanco para mantener la contraseña actual'}>
          <input type="password" value={form.contrasena} onChange={cambiar('contrasena')} minLength={6} required={nuevo} autoComplete="new-password" />
        </Campo>
        {!nuevo && (
          <label className="checkbox">
            <input type="checkbox" checked={form.activo} disabled={esEuMismo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Usuario activo (puede entrar en el sistema)
          </label>
        )}
        <MensajeError error={error} />
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="boton" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

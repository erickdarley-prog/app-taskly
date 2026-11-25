import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, definirAlExpirarSesion, token } from '../api/cliente.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(Boolean(token.leer()));

  const salir = useCallback(() => {
    token.limpiar();
    setUsuario(null);
  }, []);

  useEffect(() => {
    definirAlExpirarSesion(salir);
    if (!token.leer()) return;
    api
      .get('/auth/me')
      .then((d) => setUsuario(d.usuario))
      .catch(() => salir())
      .finally(() => setCargando(false));
  }, [salir]);

  const entrar = useCallback(async (email, contrasena) => {
    const d = await api.post('/auth/login', { email, contrasena });
    token.guardar(d.token);
    setUsuario(d.usuario);
    return d.usuario;
  }, []);

  const valor = useMemo(
    () => ({ usuario, cargando, entrar, salir, esAdmin: usuario?.rol === 'admin' }),
    [usuario, cargando, entrar, salir]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, definirAoExpirarSessao, token } from '../api/cliente.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(Boolean(token.ler()));

  const sair = useCallback(() => {
    token.limpar();
    setUsuario(null);
  }, []);

  useEffect(() => {
    definirAoExpirarSessao(sair);
    if (!token.ler()) return;
    api
      .get('/auth/me')
      .then((d) => setUsuario(d.usuario))
      .catch(() => sair())
      .finally(() => setCarregando(false));
  }, [sair]);

  const entrar = useCallback(async (email, senha) => {
    const d = await api.post('/auth/login', { email, senha });
    token.salvar(d.token);
    setUsuario(d.usuario);
    return d.usuario;
  }, []);

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, ehAdmin: usuario?.papel === 'admin' }),
    [usuario, carregando, entrar, sair]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

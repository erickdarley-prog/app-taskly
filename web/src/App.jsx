import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Carregando } from './components/Elementos.jsx';
import Login from './pages/Login.jsx';
import Projetos from './pages/Projetos.jsx';
import ProjetoDetalhe from './pages/ProjetoDetalhe.jsx';
import MinhasTarefas from './pages/MinhasTarefas.jsx';
import Usuarios from './pages/Usuarios.jsx';
import AcordoPublico from './pages/AcordoPublico.jsx';

function Protegida({ children, somenteAdmin = false }) {
  const { usuario, carregando, ehAdmin } = useAuth();
  if (carregando) return <Carregando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (somenteAdmin && !ehAdmin) return <Navigate to="/projetos" replace />;
  return children;
}

export default function App() {
  const { usuario, carregando } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!carregando && usuario ? <Navigate to="/projetos" replace /> : <Login />} />
      {/* Página pública: o cliente abre pelo link do e-mail, sem login */}
      <Route path="/acordo/:token" element={<AcordoPublico />} />
      <Route
        element={
          <Protegida>
            <Layout />
          </Protegida>
        }
      >
        <Route path="/projetos" element={<Projetos />} />
        <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
        <Route path="/minhas-tarefas" element={<MinhasTarefas />} />
        <Route
          path="/usuarios"
          element={
            <Protegida somenteAdmin>
              <Usuarios />
            </Protegida>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/projetos" replace />} />
    </Routes>
  );
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Cargando } from './components/Elementos.jsx';
import Login from './pages/Login.jsx';
import Proyectos from './pages/Proyectos.jsx';
import ProyectoDetalle from './pages/ProyectoDetalle.jsx';
import MisTareas from './pages/MisTareas.jsx';
import Usuarios from './pages/Usuarios.jsx';
import AcuerdoPublico from './pages/AcuerdoPublico.jsx';

function Protegida({ children, soloAdmin = false }) {
  const { usuario, cargando, esAdmin } = useAuth();
  if (cargando) return <Cargando />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (soloAdmin && !esAdmin) return <Navigate to="/proyectos" replace />;
  return children;
}

export default function App() {
  const { usuario, cargando } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!cargando && usuario ? <Navigate to="/proyectos" replace /> : <Login />} />
      {/* Página pública: el cliente la abre desde el enlace del e-mail, sin login */}
      <Route path="/acuerdo/:token" element={<AcuerdoPublico />} />
      <Route
        element={
          <Protegida>
            <Layout />
          </Protegida>
        }
      >
        <Route path="/proyectos" element={<Proyectos />} />
        <Route path="/proyectos/:id" element={<ProyectoDetalle />} />
        <Route path="/mis-tareas" element={<MisTareas />} />
        <Route
          path="/usuarios"
          element={
            <Protegida soloAdmin>
              <Usuarios />
            </Protegida>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/proyectos" replace />} />
    </Routes>
  );
}

import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRutas from './routes/auth.js';
import usuariosRutas from './routes/usuarios.js';
import proyectosRutas from './routes/proyectos.js';
import tareasRutas from './routes/tareas.js';
import chatRutas from './routes/chat.js';
import { rutasHitos, rutasHitosDelProyecto } from './routes/hitos.js';
import { rutasAcuerdos, rutasAcuerdosDelProyecto, rutasPublicas } from './routes/acuerdos.js';
import { rutasDiario, rutasDiarioDelProyecto } from './routes/diario.js';
import { rutasAdjuntos, rutasAdjuntosDelProyecto, rutasArchivos } from './routes/adjuntos.js';
import { rutaNoEncontrada, tratarErrores } from './middlewares/errores.js';

export function crearApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/salud', (_req, res) => res.json({ ok: true, app: 'Taskly API' }));

  app.use('/api/auth', authRutas);
  app.use('/api/usuarios', usuariosRutas);

  // Partes del proyecto (registradas antes de /api/proyectos/:id)
  app.use('/api/proyectos/:id/hitos', rutasHitosDelProyecto);
  app.use('/api/proyectos/:id/acuerdos', rutasAcuerdosDelProyecto);
  app.use('/api/proyectos/:id/diario', rutasDiarioDelProyecto);
  app.use('/api/proyectos/:id/adjuntos', rutasAdjuntosDelProyecto);
  app.use('/api/proyectos', proyectosRutas);

  app.use('/api/tareas', tareasRutas);
  app.use('/api/hitos', rutasHitos);
  app.use('/api/acuerdos', rutasAcuerdos);
  app.use('/api/diario', rutasDiario);
  app.use('/api/adjuntos', rutasAdjuntos);
  app.use('/api/archivos', rutasArchivos); // ver/descargar adjuntos con enlace temporal
  app.use('/api/publico', rutasPublicas); // página del cliente para aceptar el acuerdo (sin login)
  app.use('/api/chat', chatRutas); // asistente de chat (puede eliminarse sin afectar al resto)

  app.use(rutaNoEncontrada);
  app.use(tratarErrores);
  return app;
}

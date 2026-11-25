import { Router } from 'express';
import { autenticar, soloAdmin } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as tareas from '../servicios/tareas.js';

const router = Router();
router.use(autenticar);

// Tareas del usuario conectado, en todos los proyectos
router.get('/mis', ruta(async (req, res) => res.json(await tareas.misTareas(req.usuario, req.query))));

router.get('/:id', ruta(async (req, res) => res.json(await tareas.obtenerTarea(req.usuario, req.params.id))));

// Edición completa: solo admin
router.patch(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => res.json(await tareas.actualizarTarea(req.usuario, req.params.id, req.body)))
);

// Estado: admin o el responsable de la tarea
router.patch(
  '/:id/status',
  ruta(async (req, res) => res.json(await tareas.cambiarStatus(req.usuario, req.params.id, req.body?.status)))
);

// Registrar horas: admin o el responsable de la tarea
router.post(
  '/:id/horas',
  ruta(async (req, res) => res.json(await tareas.registrarHoras(req.usuario, req.params.id, req.body?.horas, req.body?.nota)))
);

router.delete(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => {
    await tareas.eliminarTarea(req.usuario, req.params.id);
    res.status(204).end();
  })
);

router.get(
  '/:id/historial',
  ruta(async (req, res) => res.json(await tareas.historialDeTarea(req.usuario, req.params.id, req.query)))
);

export default router;

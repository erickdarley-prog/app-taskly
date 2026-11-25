import { Router } from 'express';
import { autenticar, soloAdmin } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as proyectos from '../servicios/proyectos.js';

const router = Router();
router.use(autenticar);

router.get('/', ruta(async (req, res) => res.json(await proyectos.listarProyectos(req.usuario, req.query))));

router.post(
  '/',
  soloAdmin,
  ruta(async (req, res) => res.status(201).json(await proyectos.crearProyecto(req.usuario, req.body)))
);

router.get('/:id', ruta(async (req, res) => res.json(await proyectos.obtenerProyecto(req.usuario, req.params.id))));

router.patch(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => res.json(await proyectos.actualizarProyecto(req.usuario, req.params.id, req.body)))
);

router.delete(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => {
    await proyectos.eliminarProyecto(req.usuario, req.params.id);
    res.status(204).end();
  })
);

router.get('/:id/avance', ruta(async (req, res) => res.json(await proyectos.obtenerAvance(req.usuario, req.params.id))));

router.get(
  '/:id/tareas',
  ruta(async (req, res) => res.json(await proyectos.listarTareasDelProyecto(req.usuario, req.params.id, req.query)))
);

router.post(
  '/:id/tareas',
  soloAdmin,
  ruta(async (req, res) => res.status(201).json(await proyectos.crearTarea(req.usuario, req.params.id, req.body)))
);

export default router;

import { Router } from 'express';
import { autenticar, soloAdmin } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as hitos from '../servicios/hitos.js';

// Rutas /api/proyectos/:id/hitos (lista y creación) y /api/hitos/:id (edición y eliminación)
export const rutasHitosDelProyecto = Router({ mergeParams: true });
rutasHitosDelProyecto.use(autenticar);
rutasHitosDelProyecto.get(
  '/',
  ruta(async (req, res) =>
    res.json(await hitos.listarHitos(req.usuario, req.params.id, { conTareas: req.query.conTareas === 'true' }))
  )
);
rutasHitosDelProyecto.post(
  '/',
  soloAdmin,
  ruta(async (req, res) => res.status(201).json(await hitos.crearHito(req.usuario, req.params.id, req.body)))
);

export const rutasHitos = Router();
rutasHitos.use(autenticar, soloAdmin);
rutasHitos.patch('/:id', ruta(async (req, res) => res.json(await hitos.actualizarHito(req.usuario, req.params.id, req.body))));
rutasHitos.delete('/:id', ruta(async (req, res) => res.json(await hitos.eliminarHito(req.usuario, req.params.id))));

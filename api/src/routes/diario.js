import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as diario from '../servicios/diario.js';

// /api/proyectos/:id/diario
export const rutasDiarioDelProyecto = Router({ mergeParams: true });
rutasDiarioDelProyecto.use(autenticar);
rutasDiarioDelProyecto.get('/', ruta(async (req, res) => res.json(await diario.obtenerDiario(req.usuario, req.params.id, req.query))));
rutasDiarioDelProyecto.post(
  '/',
  ruta(async (req, res) => res.status(201).json(await diario.crearRegistro(req.usuario, req.params.id, req.body)))
);

// /api/diario/:id
export const rutasDiario = Router();
rutasDiario.use(autenticar);
rutasDiario.patch('/:id', ruta(async (req, res) => res.json(await diario.actualizarRegistro(req.usuario, req.params.id, req.body))));
rutasDiario.delete('/:id', ruta(async (req, res) => res.json(await diario.eliminarRegistro(req.usuario, req.params.id))));

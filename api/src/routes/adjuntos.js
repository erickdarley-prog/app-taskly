import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as adjuntos from '../servicios/adjuntos.js';

// /api/proyectos/:id/adjuntos — lista y subida (cualquier participante del proyecto)
export const rutasAdjuntosDelProyecto = Router({ mergeParams: true });
rutasAdjuntosDelProyecto.use(autenticar);
rutasAdjuntosDelProyecto.get('/', ruta(async (req, res) => res.json(await adjuntos.listarAdjuntos(req.usuario, req.params.id, req.query))));
rutasAdjuntosDelProyecto.post(
  '/',
  adjuntos.prepararEnvio,
  adjuntos.recibir,
  ruta(async (req, res) => res.status(201).json(await adjuntos.registrarEnvio(req.usuario, req.proyecto, req.files, req.body?.descripcion)))
);

// /api/adjuntos/:id — enlace para ver/descargar y eliminación
export const rutasAdjuntos = Router();
rutasAdjuntos.use(autenticar);
rutasAdjuntos.get('/:id/link', ruta(async (req, res) => res.json(await adjuntos.linkTemporal(req.usuario, req.params.id))));
rutasAdjuntos.delete('/:id', ruta(async (req, res) => res.json(await adjuntos.eliminarAdjunto(req.usuario, req.params.id))));

// /api/archivos/:id?t=... — entrega el archivo (el enlace temporal sustituye al login)
export const rutasArchivos = Router();
rutasArchivos.get('/:id', adjuntos.servirArchivo);

import { Router } from 'express';
import { autenticar, soloAdmin } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as acuerdos from '../servicios/acuerdos.js';

const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

// /api/proyectos/:id/acuerdos
export const rutasAcuerdosDelProyecto = Router({ mergeParams: true });
rutasAcuerdosDelProyecto.use(autenticar);
rutasAcuerdosDelProyecto.get('/', ruta(async (req, res) => res.json(await acuerdos.listarAcuerdos(req.usuario, req.params.id))));
// Abre (o crea) la versión en borrador para editar el alcance
rutasAcuerdosDelProyecto.post(
  '/borrador',
  soloAdmin,
  ruta(async (req, res) => res.json(await acuerdos.abrirBorrador(req.usuario, req.params.id)))
);

// /api/acuerdos/:id
export const rutasAcuerdos = Router();
rutasAcuerdos.use(autenticar);
rutasAcuerdos.get('/:id/comprobante', ruta(async (req, res) => res.json(await acuerdos.comprobante(req.usuario, req.params.id))));
rutasAcuerdos.patch(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => res.json(await acuerdos.actualizarBorrador(req.usuario, req.params.id, req.body)))
);
rutasAcuerdos.post(
  '/:id/enviar',
  soloAdmin,
  ruta(async (req, res) => res.json(await acuerdos.enviarParaFirma(req.usuario, req.params.id)))
);
rutasAcuerdos.post(
  '/:id/cancelar',
  soloAdmin,
  ruta(async (req, res) => res.json(await acuerdos.cancelarEnvio(req.usuario, req.params.id)))
);
rutasAcuerdos.post(
  '/:id/firmar',
  ruta(async (req, res) => res.json(await acuerdos.firmarPorEmpresa(req.usuario, req.params.id, ipDe(req))))
);

// /api/publico/acuerdos/:token — página del cliente (sin login)
export const rutasPublicas = Router();
rutasPublicas.get('/acuerdos/:token', ruta(async (req, res) => res.json(await acuerdos.verAcuerdoPublico(req.params.token))));
rutasPublicas.post(
  '/acuerdos/:token/aceptar',
  ruta(async (req, res) =>
    res.json(await acuerdos.aceptarPublico(req.params.token, { ip: ipDe(req), navegador: req.headers['user-agent'] }))
  )
);

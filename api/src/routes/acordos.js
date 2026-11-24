import { Router } from 'express';
import { autenticar, somenteAdmin } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as acordos from '../servicos/acordos.js';

const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

// /api/projetos/:id/acordos
export const rotasAcordosDoProjeto = Router({ mergeParams: true });
rotasAcordosDoProjeto.use(autenticar);
rotasAcordosDoProjeto.get('/', rota(async (req, res) => res.json(await acordos.listarAcordos(req.usuario, req.params.id))));
// Abre (ou cria) a versão em rascunho para editar o escopo
rotasAcordosDoProjeto.post(
  '/rascunho',
  somenteAdmin,
  rota(async (req, res) => res.json(await acordos.abrirRascunho(req.usuario, req.params.id)))
);

// /api/acordos/:id
export const rotasAcordos = Router();
rotasAcordos.use(autenticar);
rotasAcordos.get('/:id/comprovante', rota(async (req, res) => res.json(await acordos.comprovante(req.usuario, req.params.id))));
rotasAcordos.patch(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => res.json(await acordos.atualizarRascunho(req.usuario, req.params.id, req.body)))
);
rotasAcordos.post(
  '/:id/enviar',
  somenteAdmin,
  rota(async (req, res) => res.json(await acordos.enviarParaAssinatura(req.usuario, req.params.id)))
);
rotasAcordos.post(
  '/:id/cancelar',
  somenteAdmin,
  rota(async (req, res) => res.json(await acordos.cancelarEnvio(req.usuario, req.params.id)))
);
rotasAcordos.post(
  '/:id/assinar',
  rota(async (req, res) => res.json(await acordos.assinarPelaEmpresa(req.usuario, req.params.id, ipDe(req))))
);

// /api/publico/acordos/:token — página do cliente (sem login)
export const rotasPublicas = Router();
rotasPublicas.get('/acordos/:token', rota(async (req, res) => res.json(await acordos.verAcordoPublico(req.params.token))));
rotasPublicas.post(
  '/acordos/:token/concordar',
  rota(async (req, res) =>
    res.json(await acordos.concordarPublico(req.params.token, { ip: ipDe(req), navegador: req.headers['user-agent'] }))
  )
);

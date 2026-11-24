import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import { assistenteConfigurado, limparConversa, mensagensDaConversa, responder } from '../chat/assistente.js';

const router = Router();
router.use(autenticar);

// Histórico da conversa atual
router.get(
  '/',
  rota(async (req, res) => {
    res.json({ configurado: assistenteConfigurado(), mensagens: await mensagensDaConversa(req.usuario) });
  })
);

// Enviar mensagem ao assistente
router.post(
  '/',
  rota(async (req, res) => {
    res.json(await responder(req.usuario, req.body?.mensagem));
  })
);

// Começar uma nova conversa
router.delete(
  '/',
  rota(async (req, res) => {
    await limparConversa(req.usuario);
    res.status(204).end();
  })
);

export default router;

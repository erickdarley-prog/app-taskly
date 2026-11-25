import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import { asistenteConfigurado, limpiarConversacion, mensajesDeConversacion, responder } from '../chat/asistente.js';

const router = Router();
router.use(autenticar);

// Historial de la conversación actual
router.get(
  '/',
  ruta(async (req, res) => {
    res.json({ configurado: asistenteConfigurado(), mensajes: await mensajesDeConversacion(req.usuario) });
  })
);

// Enviar mensaje al asistente
router.post(
  '/',
  ruta(async (req, res) => {
    res.json(await responder(req.usuario, req.body?.mensaje));
  })
);

// Empezar una conversación nueva
router.delete(
  '/',
  ruta(async (req, res) => {
    await limpiarConversacion(req.usuario);
    res.status(204).end();
  })
);

export default router;

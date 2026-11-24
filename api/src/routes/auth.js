import { Router } from 'express';
import { Usuario } from '../models/Usuario.js';
import { autenticar, gerarToken } from '../middlewares/auth.js';
import { ErroHttp, rota } from '../utils/http.js';
import { enviarEmailDeTeste, obterConfigEmail, salvarConfigEmail } from '../servicos/email.js';

const router = Router();

router.post(
  '/login',
  rota(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (!email || !senha) throw new ErroHttp(400, 'Informe e-mail e senha');

    const usuario = await Usuario.findOne({ email }).select('+senha');
    if (!usuario || !usuario.ativo || !(await usuario.conferirSenha(senha))) {
      throw new ErroHttp(401, 'E-mail ou senha incorretos');
    }

    res.json({ token: gerarToken(usuario), usuario: usuario.toJSON() });
  })
);

router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

router.patch(
  '/me/senha',
  autenticar,
  rota(async (req, res) => {
    const { senhaAtual, novaSenha } = req.body || {};
    if (!senhaAtual || !novaSenha) throw new ErroHttp(400, 'Informe a senha atual e a nova senha');
    if (String(novaSenha).length < 6) throw new ErroHttp(400, 'A nova senha precisa ter ao menos 6 caracteres');

    const usuario = await Usuario.findById(req.usuario._id).select('+senha');
    if (!(await usuario.conferirSenha(String(senhaAtual)))) {
      throw new ErroHttp(400, 'Senha atual incorreta');
    }
    usuario.senha = String(novaSenha);
    await usuario.save();
    res.json({ ok: true });
  })
);

// E-mail de envio do próprio usuário (usado para mandar o acordo ao cliente)
router.get('/me/email', autenticar, rota(async (req, res) => res.json(await obterConfigEmail(req.usuario))));
router.put('/me/email', autenticar, rota(async (req, res) => res.json(await salvarConfigEmail(req.usuario, req.body))));
router.post('/me/email/teste', autenticar, rota(async (req, res) => res.json(await enviarEmailDeTeste(req.usuario))));

export default router;

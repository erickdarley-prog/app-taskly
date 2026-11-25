import { Router } from 'express';
import { Usuario } from '../models/Usuario.js';
import { autenticar, generarToken } from '../middlewares/auth.js';
import { ErrorHttp, ruta } from '../utils/http.js';
import { enviarEmailDePrueba, obtenerConfigEmail, guardarConfigEmail } from '../servicios/email.js';

const router = Router();

router.post(
  '/login',
  ruta(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const contrasena = String(req.body?.contrasena || '');
    if (!email || !contrasena) throw new ErrorHttp(400, 'Indica e-mail y contraseña');

    const usuario = await Usuario.findOne({ email }).select('+contrasena');
    if (!usuario || !usuario.activo || !(await usuario.comprobarContrasena(contrasena))) {
      throw new ErrorHttp(401, 'E-mail o contraseña incorrectos');
    }

    res.json({ token: generarToken(usuario), usuario: usuario.toJSON() });
  })
);

router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

router.patch(
  '/me/contrasena',
  autenticar,
  ruta(async (req, res) => {
    const { contrasenaActual, nuevaContrasena } = req.body || {};
    if (!contrasenaActual || !nuevaContrasena) throw new ErrorHttp(400, 'Indica la contraseña actual y la nueva');
    if (String(nuevaContrasena).length < 6) throw new ErrorHttp(400, 'La nueva contraseña debe tener al menos 6 caracteres');

    const usuario = await Usuario.findById(req.usuario._id).select('+contrasena');
    if (!(await usuario.comprobarContrasena(String(contrasenaActual)))) {
      throw new ErrorHttp(400, 'Contraseña actual incorrecta');
    }
    usuario.contrasena = String(nuevaContrasena);
    await usuario.save();
    res.json({ ok: true });
  })
);

// E-mail de envío del propio usuario (se usa para mandar el acuerdo al cliente)
router.get('/me/email', autenticar, ruta(async (req, res) => res.json(await obtenerConfigEmail(req.usuario))));
router.put('/me/email', autenticar, ruta(async (req, res) => res.json(await guardarConfigEmail(req.usuario, req.body))));
router.post('/me/email/prueba', autenticar, ruta(async (req, res) => res.json(await enviarEmailDePrueba(req.usuario))));

export default router;

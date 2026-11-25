import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Usuario } from '../models/Usuario.js';
import { ErrorHttp, ruta } from '../utils/http.js';

export function generarToken(usuario) {
  return jwt.sign({ sub: String(usuario._id), rol: usuario.rol }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

// Exige login: lee el token "Bearer" y carga el usuario en req.usuario.
export const autenticar = ruta(async (req, _res, next) => {
  const cabecera = req.headers.authorization || '';
  const [tipo, token] = cabecera.split(' ');
  if (tipo !== 'Bearer' || !token) throw new ErrorHttp(401, 'Inicia sesión para continuar');

  let datos;
  try {
    datos = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ErrorHttp(401, 'Sesión caducada o no válida. Vuelve a iniciar sesión');
  }

  const usuario = await Usuario.findById(datos.sub);
  if (!usuario || !usuario.activo) throw new ErrorHttp(401, 'Usuario no encontrado o desactivado');

  req.usuario = usuario;
  next();
});

export function soloAdmin(req, _res, next) {
  if (req.usuario?.rol !== 'admin') {
    return next(new ErrorHttp(403, 'Solo los administradores pueden hacer esto'));
  }
  next();
}

export const esAdmin = (usuario) => usuario?.rol === 'admin';

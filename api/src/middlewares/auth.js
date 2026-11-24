import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Usuario } from '../models/Usuario.js';
import { ErroHttp, rota } from '../utils/http.js';

export function gerarToken(usuario) {
  return jwt.sign({ sub: String(usuario._id), papel: usuario.papel }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

// Exige login: lê o token "Bearer" e carrega o usuário em req.usuario.
export const autenticar = rota(async (req, _res, next) => {
  const cabecalho = req.headers.authorization || '';
  const [tipo, token] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !token) throw new ErroHttp(401, 'Faça login para continuar');

  let dados;
  try {
    dados = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ErroHttp(401, 'Sessão expirada ou inválida. Faça login novamente');
  }

  const usuario = await Usuario.findById(dados.sub);
  if (!usuario || !usuario.ativo) throw new ErroHttp(401, 'Usuário não encontrado ou desativado');

  req.usuario = usuario;
  next();
});

export function somenteAdmin(req, _res, next) {
  if (req.usuario?.papel !== 'admin') {
    return next(new ErroHttp(403, 'Apenas administradores podem fazer isso'));
  }
  next();
}

export const ehAdmin = (usuario) => usuario?.papel === 'admin';

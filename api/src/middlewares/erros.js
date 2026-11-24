import mongoose from 'mongoose';
import { ErroHttp } from '../utils/http.js';

export function rotaNaoEncontrada(req, _res, next) {
  next(new ErroHttp(404, `Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function tratarErros(err, _req, res, _next) {
  if (err instanceof ErroHttp) {
    return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const detalhes = Object.fromEntries(
      Object.entries(err.errors).map(([campo, e]) => [campo, e.message])
    );
    return res.status(400).json({ erro: 'Dados inválidos', detalhes });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ erro: `Valor inválido para ${err.path}` });
  }
  if (err?.code === 11000) {
    const campo = Object.keys(err.keyValue || {})[0] || 'campo';
    return res.status(409).json({ erro: `Já existe um registro com este ${campo}` });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição' });
  }
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}

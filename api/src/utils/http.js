import mongoose from 'mongoose';

export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

// Repassa erros de funções async para o middleware de erro.
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function paginacao(query, limitePadrao = 20, limiteMax = 100) {
  const pagina = Math.max(1, parseInt(query.pagina, 10) || 1);
  const limite = Math.min(limiteMax, Math.max(1, parseInt(query.limite, 10) || limitePadrao));
  return { pagina, limite, pular: (pagina - 1) * limite };
}

export function respostaPaginada(itens, total, { pagina, limite }) {
  return { itens, total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)) };
}

export function idValido(id) {
  return mongoose.isValidObjectId(id);
}

export function exigirId(id, nome = 'id') {
  if (!idValido(id)) throw new ErroHttp(400, `${nome} inválido`);
  return new mongoose.Types.ObjectId(String(id));
}

// Copia só os campos permitidos do corpo da requisição.
export function escolher(obj, campos) {
  const saida = {};
  for (const campo of campos) {
    if (obj[campo] !== undefined) saida[campo] = obj[campo];
  }
  return saida;
}

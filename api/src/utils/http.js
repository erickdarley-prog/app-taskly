import mongoose from 'mongoose';

export class ErrorHttp extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

// Pasa los errores de funciones async al middleware de errores.
export const ruta = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function paginacion(query, limitePredeterminado = 20, limiteMax = 100) {
  const pagina = Math.max(1, parseInt(query.pagina, 10) || 1);
  const limite = Math.min(limiteMax, Math.max(1, parseInt(query.limite, 10) || limitePredeterminado));
  return { pagina, limite, saltar: (pagina - 1) * limite };
}

export function respuestaPaginada(items, total, { pagina, limite }) {
  return { items, total, pagina, limite, paginas: Math.max(1, Math.ceil(total / limite)) };
}

export function idValido(id) {
  return mongoose.isValidObjectId(id);
}

export function exigirId(id, nombre = 'id') {
  if (!idValido(id)) throw new ErrorHttp(400, `${nombre} no válido`);
  return new mongoose.Types.ObjectId(String(id));
}

// Copia solo los campos permitidos del cuerpo de la solicitud.
export function elegir(obj, campos) {
  const salida = {};
  for (const campo of campos) {
    if (obj[campo] !== undefined) salida[campo] = obj[campo];
  }
  return salida;
}

import mongoose from 'mongoose';
import { ErrorHttp } from '../utils/http.js';

export function rutaNoEncontrada(req, _res, next) {
  next(new ErrorHttp(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function tratarErrores(err, _req, res, _next) {
  if (err instanceof ErrorHttp) {
    return res.status(err.status).json({ error: err.message, detalles: err.detalles });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const detalles = Object.fromEntries(
      Object.entries(err.errors).map(([campo, e]) => [campo, e.message])
    );
    return res.status(400).json({ error: 'Datos no válidos', detalles });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Valor no válido para ${err.path}` });
  }
  if (err?.code === 11000) {
    const campo = Object.keys(err.keyValue || {})[0] || 'campo';
    return res.status(409).json({ error: `Ya existe un registro con este ${campo}` });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON no válido en el cuerpo de la solicitud' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

import { Historial } from '../models/Historial.js';

export function registrarHistorial(tarea, usuario, accion, detalles = {}) {
  return Historial.create({
    tarea: tarea._id,
    proyecto: tarea.proyecto,
    usuario: usuario._id,
    accion,
    detalles,
  });
}

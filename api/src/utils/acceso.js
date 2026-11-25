import { Proyecto } from '../models/Proyecto.js';
import { Tarea } from '../models/Tarea.js';
import { esAdmin } from '../middlewares/auth.js';
import { ErrorHttp, exigirId } from './http.js';

export function participaDelProyecto(proyecto, usuario) {
  const id = String(usuario._id);
  const responsable = String(proyecto.responsable?._id || proyecto.responsable);
  if (responsable === id) return true;
  return proyecto.integrantes.some((i) => String(i.usuario?._id || i.usuario) === id);
}

// Filtro de proyectos visibles: admin ve todos; equipo ve aquellos en los que participa.
export function filtroProyectosVisibles(usuario) {
  if (esAdmin(usuario)) return {};
  return { $or: [{ responsable: usuario._id }, { 'integrantes.usuario': usuario._id }] };
}

export async function cargarProyecto(idProyecto, usuario, { poblar = false } = {}) {
  const id = exigirId(idProyecto, 'id del proyecto');
  let consulta = Proyecto.findById(id);
  if (poblar) {
    consulta = consulta
      .populate('responsable', 'nombre email funcion')
      .populate('integrantes.usuario', 'nombre email funcion activo');
  }
  const proyecto = await consulta;
  if (!proyecto) throw new ErrorHttp(404, 'Proyecto no encontrado');
  if (!esAdmin(usuario) && !participaDelProyecto(proyecto, usuario)) {
    throw new ErrorHttp(403, 'No participas en este proyecto');
  }
  return proyecto;
}

export async function cargarTarea(idTarea, usuario) {
  const id = exigirId(idTarea, 'id de la tarea');
  const tarea = await Tarea.findById(id);
  if (!tarea) throw new ErrorHttp(404, 'Tarea no encontrada');
  const proyecto = await cargarProyecto(tarea.proyecto, usuario);
  return { tarea, proyecto };
}

// Un integrante solo puede actualizar estado/horas de sus PROPIAS tareas.
export function puedeActualizarTarea(tarea, usuario) {
  if (esAdmin(usuario)) return true;
  return tarea.responsable && String(tarea.responsable) === String(usuario._id);
}

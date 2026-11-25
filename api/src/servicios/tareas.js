// Reglas de negocio de tareas (las usan las rutas y el asistente de chat).
import { Tarea, STATUS_TAREA } from '../models/Tarea.js';
import { Historial } from '../models/Historial.js';
import { ErrorHttp, elegir, paginacion, respuestaPaginada } from '../utils/http.js';
import { cargarTarea, puedeActualizarTarea } from '../utils/acceso.js';
import { registrarHistorial } from '../utils/historial.js';
import { exigirAdmin, normalizarCamposTarea } from './proyectos.js';

function aplicarStatus(tarea, status) {
  if (!STATUS_TAREA.includes(status)) throw new ErrorHttp(400, 'Estado no válido');
  tarea.status = status;
  tarea.completadaEn = status === 'completada' ? tarea.completadaEn || new Date() : undefined;
}

export async function misTareas(usuario, query = {}) {
  const pag = paginacion(query, 50, 200);
  const filtro = { responsable: usuario._id };
  if (STATUS_TAREA.includes(query.status)) filtro.status = query.status;
  else if (query.status === 'abiertas') filtro.status = { $ne: 'completada' };
  if (query.atrasadas === 'true' || query.atrasadas === true) {
    filtro.status = { $ne: 'completada' };
    filtro.plazo = { $lt: new Date() };
  }

  const [items, total] = await Promise.all([
    Tarea.find(filtro).sort({ plazo: 1, createdAt: -1 }).skip(pag.saltar).limit(pag.limite).populate('proyecto', 'nombre status')
      .populate('hito', 'titulo'),
    Tarea.countDocuments(filtro),
  ]);
  return respuestaPaginada(items, total, pag);
}

export async function obtenerTarea(usuario, id) {
  const { tarea } = await cargarTarea(id, usuario);
  await tarea.populate([
    { path: 'responsable', select: 'nome email' },
    { path: 'proyecto', select: 'nombre' },
    { path: 'hito', select: 'titulo fechaInicio fechaFin' },
  ]);
  return tarea;
}

const CAMPOS_EDITABLES = [
  'titulo',
  'descripcion',
  'responsable',
  'responsableExterno',
  'lado',
  'hito',
  'prioridad',
  'plazo',
  'horasEstimadas',
  'status',
];

export async function actualizarTarea(usuario, id, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden editar tareas');
  const { tarea, proyecto } = await cargarTarea(id, usuario);
  const datos = elegir(cuerpo || {}, CAMPOS_EDITABLES);
  const campos = Object.keys(datos);

  await normalizarCamposTarea(proyecto, datos, tarea);

  // Los campos que pueden "vaciarse" (null/vacío) se quitan del documento.
  for (const campo of ['responsable', 'hito', 'plazo']) {
    if (datos[campo] === '' || datos[campo] === null) {
      delete datos[campo];
      tarea[campo] = undefined;
    }
  }

  if (datos.status) {
    aplicarStatus(tarea, datos.status);
    delete datos.status;
  }
  Object.assign(tarea, datos);
  await tarea.save();
  await registrarHistorial(tarea, usuario, 'edito', { campos });

  await tarea.populate([
    { path: 'responsable', select: 'nome email' },
    { path: 'hito', select: 'titulo' },
  ]);
  return tarea;
}

export async function cambiarStatus(usuario, id, status) {
  const { tarea } = await cargarTarea(id, usuario);
  if (!puedeActualizarTarea(tarea, usuario)) {
    throw new ErrorHttp(403, 'Solo puedes actualizar tus propias tareas');
  }
  const de = tarea.status;
  aplicarStatus(tarea, status);
  if (de === tarea.status) return tarea;

  await tarea.save();
  await registrarHistorial(tarea, usuario, 'status', { de, para: tarea.status });
  return tarea;
}

export async function registrarHoras(usuario, id, horasInformadas, notaInformada) {
  const { tarea } = await cargarTarea(id, usuario);
  if (!puedeActualizarTarea(tarea, usuario)) {
    throw new ErrorHttp(403, 'Solo puedes registrar horas en tus propias tareas');
  }
  const horas = Number(horasInformadas);
  if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
    throw new ErrorHttp(400, 'Indica las horas entre 0,1 y 24');
  }
  const nota = String(notaInformada || '').trim().slice(0, 500);

  const actualizada = await Tarea.findByIdAndUpdate(
    tarea._id,
    { $inc: { horasGastadas: Math.round(horas * 10) / 10 } },
    { new: true }
  );
  await registrarHistorial(actualizada, usuario, 'horas', { horas, nota });
  return actualizada;
}

export async function eliminarTarea(usuario, id) {
  exigirAdmin(usuario, 'Solo los administradores pueden eliminar tareas');
  const { tarea } = await cargarTarea(id, usuario);
  await Historial.deleteMany({ tarea: tarea._id });
  await tarea.deleteOne();
  return { eliminada: true, titulo: tarea.titulo };
}

export async function historialDeTarea(usuario, id, query = {}) {
  const { tarea } = await cargarTarea(id, usuario);
  const pag = paginacion(query, 30, 100);
  const filtro = { tarea: tarea._id };
  const [items, total] = await Promise.all([
    Historial.find(filtro).sort({ createdAt: -1 }).skip(pag.saltar).limit(pag.limite).populate('usuario', 'nombre'),
    Historial.countDocuments(filtro),
  ]);
  return respuestaPaginada(items, total, pag);
}

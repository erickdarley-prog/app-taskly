// Hitos del proyecto y la vista lineal: hito a hito, con las tareas y el estado.
import { Hito } from '../models/Hito.js';
import { Tarea } from '../models/Tarea.js';
import { ErrorHttp, elegir, exigirId } from '../utils/http.js';
import { cargarProyecto } from '../utils/acceso.js';
import { exigirAdmin } from './proyectos.js';

const CAMPOS_HITO = ['titulo', 'descripcion', 'fechaInicio', 'fechaFin', 'orden'];

function inicioDeHoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Estado del hito calculado a partir de las tareas: pendiente, en_curso o completado (+ atrasado).
export function calcularStatusHito(hito, conteo) {
  const total = conteo?.total || 0;
  const completadas = conteo?.completadas || 0;
  const iniciadas = (conteo?.enCurso || 0) + completadas;
  let status = 'pendiente';
  if (total > 0 && completadas === total) status = 'completado';
  else if (iniciadas > 0) status = 'en_curso';
  const atrasado = status !== 'completado' && Boolean(hito.fechaFin) && new Date(hito.fechaFin) < inicioDeHoy();
  return {
    status,
    atrasado,
    total,
    completadas,
    enCurso: conteo?.enCurso || 0,
    porHacer: conteo?.porHacer || 0,
    delCliente: conteo?.delCliente || 0,
    deAwakelab: conteo?.deAwakelab || 0,
    porcentaje: total ? Math.round((completadas / total) * 100) : 0,
  };
}

function validarFechas(datos, actual = {}) {
  const inicio = datos.fechaInicio !== undefined ? datos.fechaInicio : actual.fechaInicio;
  const fin = datos.fechaFin !== undefined ? datos.fechaFin : actual.fechaFin;
  if (inicio && fin && new Date(fin) < new Date(inicio)) {
    throw new ErrorHttp(400, 'La fecha de entrega del hito no puede ser anterior a la fecha de inicio');
  }
}

async function conteosPorHito(proyectoId) {
  const lineas = await Tarea.aggregate([
    { $match: { proyecto: proyectoId } },
    {
      $group: {
        _id: '$hito',
        total: { $sum: 1 },
        completadas: { $sum: { $cond: [{ $eq: ['$status', 'completada'] }, 1, 0] } },
        enCurso: { $sum: { $cond: [{ $eq: ['$status', 'en_curso'] }, 1, 0] } },
        porHacer: { $sum: { $cond: [{ $eq: ['$status', 'por_hacer'] }, 1, 0] } },
        delCliente: { $sum: { $cond: [{ $eq: ['$lado', 'cliente'] }, 1, 0] } },
        deAwakelab: { $sum: { $cond: [{ $ne: ['$lado', 'cliente'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(lineas.map((l) => [l._id ? String(l._id) : 'sin', l]));
}

// Lista los hitos en orden; con "conTareas" trae también las tareas de cada uno (vista lineal).
export async function listarHitos(usuario, idProyecto, { conTareas = false } = {}) {
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const [hitos, conteos] = await Promise.all([
    Hito.find({ proyecto: proyecto._id }).sort({ orden: 1, fechaInicio: 1, createdAt: 1 }).lean(),
    conteosPorHito(proyecto._id),
  ]);

  let tareasPorHito = new Map();
  if (conTareas) {
    const tareas = await Tarea.find({ proyecto: proyecto._id })
      .sort({ plazo: 1, createdAt: 1 })
      .limit(2000)
      .populate('responsable', 'nombre email');
    tareasPorHito = tareas.reduce((mapa, t) => {
      const clave = t.hito ? String(t.hito) : 'sin';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(t.toJSON());
      return mapa;
    }, new Map());
  }

  const items = hitos.map((m) => ({
    ...m,
    ...calcularStatusHito(m, conteos.get(String(m._id))),
    ...(conTareas ? { tareas: tareasPorHito.get(String(m._id)) || [] } : {}),
  }));

  const sinHito = conteos.get('sin');
  return {
    hitos: items,
    sinHito: sinHito
      ? { total: sinHito.total, completadas: sinHito.completadas, ...(conTareas ? { tareas: tareasPorHito.get('sin') || [] } : {}) }
      : null,
  };
}

export async function crearHito(usuario, idProyecto, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden crear hitos');
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const datos = elegir(cuerpo || {}, CAMPOS_HITO);
  validarFechas(datos);
  if (datos.orden === undefined) {
    const ultimo = await Hito.findOne({ proyecto: proyecto._id }).sort({ orden: -1 }).select('orden').lean();
    datos.orden = (ultimo?.orden ?? 0) + 1;
  }
  const hito = await Hito.create({ ...datos, proyecto: proyecto._id });
  await proyecto.updateOne({ $currentDate: { updatedAt: true } });
  return hito;
}

export async function cargarHito(usuario, id) {
  const hito = await Hito.findById(exigirId(id, 'id del hito'));
  if (!hito) throw new ErrorHttp(404, 'Hito no encontrado');
  const proyecto = await cargarProyecto(hito.proyecto, usuario);
  return { hito, proyecto };
}

export async function actualizarHito(usuario, id, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden editar hitos');
  const { hito } = await cargarHito(usuario, id);
  const datos = elegir(cuerpo || {}, CAMPOS_HITO);
  for (const campo of ['fechaInicio', 'fechaFin']) {
    if (datos[campo] === '' || datos[campo] === null) {
      delete datos[campo];
      hito[campo] = undefined;
    }
  }
  validarFechas(datos, hito);
  Object.assign(hito, datos);
  await hito.save();
  return hito;
}

// Eliminar un hito NO borra las tareas: quedan "sin hito".
export async function eliminarHito(usuario, id) {
  exigirAdmin(usuario, 'Solo los administradores pueden eliminar hitos');
  const { hito } = await cargarHito(usuario, id);
  const { modifiedCount } = await Tarea.updateMany({ hito: hito._id }, { $unset: { hito: 1 } });
  await hito.deleteOne();
  return { eliminado: true, titulo: hito.titulo, tareasSinHito: modifiedCount };
}

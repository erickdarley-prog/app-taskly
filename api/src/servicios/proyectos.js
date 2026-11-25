// Reglas de negocio de proyectos y tareas del proyecto.
// Las usan tanto las rutas (botones) como el asistente de chat,
// para que los permisos sean exactamente los mismos por los dos caminos.
import { Proyecto, STATUS_PROYECTO } from '../models/Proyecto.js';
import { Tarea, STATUS_TAREA, PRIORIDADES, LADOS } from '../models/Tarea.js';
import { Usuario } from '../models/Usuario.js';
import { Historial } from '../models/Historial.js';
import { Hito } from '../models/Hito.js';
import { esAdmin } from '../middlewares/auth.js';
import { ErrorHttp, elegir, exigirId, paginacion, respuestaPaginada } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { cargarProyecto, filtroProyectosVisibles, participaDelProyecto } from '../utils/acceso.js';
import { avanceDelProyecto, resumenDeProyectos } from '../utils/avance.js';
import { registrarHistorial } from '../utils/historial.js';

export const CAMPOS_PROYECTO = [
  'nombre',
  'descripcion',
  'cliente',
  'responsable',
  'responsableCliente',
  'integrantes',
  'status',
  'fechaInicio',
  'plazo',
];
export const CAMPOS_TAREA = [
  'titulo',
  'descripcion',
  'responsable',
  'responsableExterno',
  'lado',
  'hito',
  'status',
  'prioridad',
  'plazo',
  'horasEstimadas',
];

// Otros módulos (acuerdos, diario) registran aquí lo que hay que borrar junto con el proyecto.
export const ganchosEliminacionProyecto = [];

export function exigirAdmin(usuario, mensaje = 'Solo los administradores pueden hacer esto') {
  if (!esAdmin(usuario)) throw new ErrorHttp(403, mensaje);
}

// Comprueba que el responsable y los integrantes existen y quita duplicados.
async function validarPersonas(datos) {
  if (datos.responsableCliente !== undefined) {
    const rc = datos.responsableCliente || {};
    datos.responsableCliente = {
      nombre: String(rc.nombre || '').trim(),
      email: String(rc.email || '').trim().toLowerCase(),
      cargo: String(rc.cargo || '').trim(),
    };
  }
  const ids = new Set();
  if (datos.responsable) ids.add(String(exigirId(datos.responsable, 'responsable')));

  if (datos.integrantes !== undefined) {
    if (!Array.isArray(datos.integrantes)) throw new ErrorHttp(400, 'integrantes debe ser una lista');
    const vistos = new Set();
    datos.integrantes = datos.integrantes
      .map((i) => ({ usuario: String(exigirId(i?.usuario, 'integrante')), funcion: String(i?.funcion || '').trim() }))
      .filter((i) => (vistos.has(i.usuario) ? false : vistos.add(i.usuario)));
    datos.integrantes.forEach((i) => ids.add(i.usuario));
  }

  if (ids.size) {
    const encontrados = await Usuario.countDocuments({ _id: { $in: [...ids] }, activo: true });
    if (encontrados !== ids.size) throw new ErrorHttp(400, 'Algún usuario indicado no existe o está desactivado');
  }
  return datos;
}

export async function listarProyectos(usuario, query = {}) {
  const pag = paginacion(query, 12);
  const filtro = { ...filtroProyectosVisibles(usuario) };
  if (query.status && STATUS_PROYECTO.includes(query.status)) filtro.status = query.status;
  if (query.busqueda) {
    const termino = new RegExp(escaparRegex(String(query.busqueda)), 'i');
    const busqueda = { $or: [{ nombre: termino }, { cliente: termino }] };
    if (filtro.$or) {
      filtro.$and = [{ $or: filtro.$or }, busqueda];
      delete filtro.$or;
    } else Object.assign(filtro, busqueda);
  }

  const [proyectos, total] = await Promise.all([
    Proyecto.find(filtro).sort({ updatedAt: -1 }).skip(pag.saltar).limit(pag.limite).populate('responsable', 'nombre email').lean(),
    Proyecto.countDocuments(filtro),
  ]);

  const resumenes = await resumenDeProyectos(proyectos.map((p) => p._id));
  const items = proyectos.map((p) => ({
    ...p,
    totalIntegrantes: p.integrantes.length,
    integrantes: undefined,
    resumen: resumenes.get(String(p._id)),
  }));
  return respuestaPaginada(items, total, pag);
}

export async function obtenerProyecto(usuario, id) {
  const proyecto = await cargarProyecto(id, usuario, { poblar: true });
  const resumenes = await resumenDeProyectos([proyecto._id]);
  return { ...proyecto.toJSON(), resumen: resumenes.get(String(proyecto._id)) };
}

export async function crearProyecto(usuario, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden crear proyectos');
  const datos = elegir(cuerpo || {}, CAMPOS_PROYECTO);
  datos.responsable = datos.responsable || usuario._id;
  await validarPersonas(datos);
  return Proyecto.create(datos);
}

export async function actualizarProyecto(usuario, id, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden editar proyectos');
  const proyecto = await cargarProyecto(id, usuario);
  const datos = await validarPersonas(elegir(cuerpo || {}, CAMPOS_PROYECTO));
  Object.assign(proyecto, datos);
  await proyecto.save();
  return proyecto;
}

export async function eliminarProyecto(usuario, id) {
  exigirAdmin(usuario, 'Solo los administradores pueden eliminar proyectos');
  const proyecto = await cargarProyecto(id, usuario);
  await Promise.all([
    Tarea.deleteMany({ proyecto: proyecto._id }),
    Historial.deleteMany({ proyecto: proyecto._id }),
    Hito.deleteMany({ proyecto: proyecto._id }),
    ...ganchosEliminacionProyecto.map((fn) => fn(proyecto._id)),
  ]);
  await proyecto.deleteOne();
  return { eliminado: true, nombre: proyecto.nombre };
}

export async function obtenerAvance(usuario, id) {
  const proyecto = await cargarProyecto(id, usuario, { poblar: true });
  return avanceDelProyecto(proyecto);
}

export async function listarTareasDelProyecto(usuario, id, query = {}) {
  const proyecto = await cargarProyecto(id, usuario);
  const pag = paginacion(query, 50, 200);
  const filtro = { proyecto: proyecto._id };

  if (STATUS_TAREA.includes(query.status)) filtro.status = query.status;
  if (PRIORIDADES.includes(query.prioridad)) filtro.prioridad = query.prioridad;
  if (query.responsable === 'sin') filtro.responsable = null;
  else if (query.responsable) filtro.responsable = exigirId(query.responsable, 'responsable');
  if (query.atrasadas === 'true' || query.atrasadas === true) {
    filtro.status = { $ne: 'completada' };
    filtro.plazo = { $lt: new Date() };
  }
  if (query.busqueda) filtro.titulo = new RegExp(escaparRegex(String(query.busqueda)), 'i');
  if (LADOS.includes(query.lado)) filtro.lado = query.lado;
  if (query.hito === 'sin') filtro.hito = null;
  else if (query.hito) filtro.hito = exigirId(query.hito, 'hito');

  const [items, total] = await Promise.all([
    Tarea.find(filtro)
      .sort({ plazo: 1, createdAt: -1 })
      .skip(pag.saltar)
      .limit(pag.limite)
      .populate('responsable', 'nombre email')
      .populate('hito', 'titulo'),
    Tarea.countDocuments(filtro),
  ]);
  return respuestaPaginada(items, total, pag);
}

// Comprueba hito/lado/responsables de una tarea (creación y edición).
// "actual" = valores actuales de la tarea (en la edición), para combinarlos con lo que cambió.
export async function normalizarCamposTarea(proyecto, datos, actual = {}) {
  if (datos.hito !== undefined) {
    if (datos.hito === '' || datos.hito === null) datos.hito = null;
    else {
      const hito = await Hito.findOne({ _id: exigirId(datos.hito, 'hito'), proyecto: proyecto._id });
      if (!hito) throw new ErrorHttp(400, 'El hito indicado no pertenece a este proyecto');
      datos.hito = hito._id;
    }
  }
  if (datos.lado !== undefined && !LADOS.includes(datos.lado)) throw new ErrorHttp(400, 'Lado no válido (usa awakelab o cliente)');

  const lado = datos.lado ?? actual.lado ?? 'awakelab';
  if (lado === 'cliente') {
    // Tarea del cliente: el responsable es alguien del cliente (texto), no un usuario del sistema.
    if (datos.responsable) throw new ErrorHttp(400, 'Las tareas del cliente no tienen responsable de Awakelab; usa el nombre del responsable del cliente');
    if (actual.responsable || datos.lado === 'cliente') datos.responsable = null;
  } else {
    if (datos.responsable) await validarResponsableDeTarea(proyecto, datos.responsable);
    if (datos.lado === 'awakelab') datos.responsableExterno = '';
  }
  return datos;
}

export async function validarResponsableDeTarea(proyecto, idResponsable) {
  const resp = await Usuario.findById(exigirId(idResponsable, 'responsable'));
  if (!resp || !participaDelProyecto(proyecto, resp)) {
    throw new ErrorHttp(400, 'El responsable debe ser integrante del proyecto');
  }
  return resp;
}

export async function crearTarea(usuario, idProyecto, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden crear tareas');
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const datos = elegir(cuerpo || {}, CAMPOS_TAREA);

  await normalizarCamposTarea(proyecto, datos);
  if (!datos.responsable) datos.responsable = undefined;
  if (!datos.hito) datos.hito = undefined;
  if (datos.plazo === '' || datos.plazo === null) datos.plazo = undefined;
  if (datos.status === 'completada') datos.completadaEn = new Date();

  const tarea = await Tarea.create({ ...datos, proyecto: proyecto._id });
  await registrarHistorial(tarea, usuario, 'creo', { titulo: tarea.titulo });
  await proyecto.updateOne({ $currentDate: { updatedAt: true } });

  await tarea.populate([
    { path: 'responsable', select: 'nome email' },
    { path: 'hito', select: 'titulo' },
  ]);
  return tarea;
}

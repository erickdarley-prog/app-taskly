// El asistente habla con NOMBRES ("Portal del Alumno", "Ana"); aquí convertimos
// esos nombres en registros de la base de datos, respetando siempre lo que el usuario puede ver.
import { Proyecto } from '../models/Proyecto.js';
import { Tarea } from '../models/Tarea.js';
import { Usuario } from '../models/Usuario.js';
import { ErrorHttp, idValido } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { cargarProyecto, cargarTarea, filtroProyectosVisibles } from '../utils/acceso.js';

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Elige un único elemento: primero por nombre exacto, después por "contiene".
function elegirUnico(candidatos, termino, campo, tipo) {
  const objetivo = normalizar(termino);
  const exactos = candidatos.filter((c) => normalizar(c[campo]) === objetivo);
  if (exactos.length === 1) return exactos[0];
  const lista = exactos.length > 1 ? exactos : candidatos;
  if (lista.length === 1) return lista[0];
  if (lista.length === 0) throw new ErrorHttp(404, `No se encontró ningún(a) ${tipo} para "${termino}".`);
  const nombres = lista.slice(0, 8).map((c) => c[campo]);
  throw new ErrorHttp(409, `Más de un(a) ${tipo} coincide con "${termino}": ${nombres.join('; ')}. Pregunta al usuario cuál de ellos.`);
}

// Búsqueda que ignora mayúsculas y acentos ("modulo" encuentra "módulo").
const VARIACIONES = {
  a: 'aáàâãä',
  e: 'eéèêë',
  i: 'iíìîï',
  o: 'oóòôõö',
  u: 'uúùûü',
  c: 'cç',
  n: 'nñ',
};
function regexFlexible(termino) {
  const base = normalizar(termino);
  const predeterminado = escaparRegex(base).replace(/[aeioucn]/g, (l) => `[${VARIACIONES[l]}${VARIACIONES[l].toUpperCase()}]`);
  return new RegExp(predeterminado, 'i');
}

export async function resolverProyecto(usuario, referencia, opciones = {}) {
  if (!referencia) throw new ErrorHttp(400, 'Indica el proyecto.');
  if (idValido(referencia)) return cargarProyecto(referencia, usuario, opciones);

  const candidatos = await Proyecto.find({ ...filtroProyectosVisibles(usuario), nombre: regexFlexible(referencia) })
    .select('nombre')
    .limit(20)
    .lean();
  const elegido = elegirUnico(candidatos, referencia, 'nombre', 'proyecto');
  return cargarProyecto(elegido._id, usuario, opciones);
}

// Persona por id, e-mail o nombre. Si se indica "proyecto", busca solo entre quienes participan en él.
export async function resolverPersona(referencia, { proyecto, soloActivos = true } = {}) {
  if (!referencia) throw new ErrorHttp(400, 'Indica la persona.');
  const filtro = soloActivos ? { activo: true } : {};

  if (proyecto) {
    const ids = [proyecto.responsable?._id || proyecto.responsable, ...proyecto.integrantes.map((i) => i.usuario?._id || i.usuario)];
    filtro._id = { $in: ids };
  }

  if (idValido(referencia)) {
    const u = await Usuario.findOne({ ...filtro, _id: referencia });
    if (!u) throw new ErrorHttp(404, 'Persona no encontrada' + (proyecto ? ' en este proyecto.' : '.'));
    return u;
  }

  const texto = String(referencia).trim();
  if (texto.includes('@')) {
    const u = await Usuario.findOne({ ...filtro, email: texto.toLowerCase() });
    if (!u) throw new ErrorHttp(404, `Ninguna persona con el e-mail ${texto}` + (proyecto ? ' en este proyecto.' : '.'));
    return u;
  }

  const candidatos = await Usuario.find({ ...filtro, nombre: regexFlexible(texto) }).limit(20);
  return elegirUnico(candidatos, texto, 'nombre', proyecto ? 'integrante del proyecto' : 'persona');
}

export async function resolverTarea(usuario, referencia, referenciaProyecto) {
  if (!referencia) throw new ErrorHttp(400, 'Indica la tarea.');
  if (idValido(referencia)) return cargarTarea(referencia, usuario);

  let idsProyectos;
  if (referenciaProyecto) {
    const proyecto = await resolverProyecto(usuario, referenciaProyecto);
    idsProyectos = [proyecto._id];
  } else {
    const visibles = await Proyecto.find(filtroProyectosVisibles(usuario)).select('_id').lean();
    idsProyectos = visibles.map((p) => p._id);
  }

  const candidatos = await Tarea.find({ proyecto: { $in: idsProyectos }, titulo: regexFlexible(referencia) })
    .select('titulo proyecto')
    .populate('proyecto', 'nombre')
    .limit(20)
    .lean();
  const conRotulo = candidatos.map((c) => ({ ...c, rotulo: `${c.titulo} (proyecto ${c.proyecto?.nombre})` }));
  const objetivo = normalizar(referencia);
  const exactos = conRotulo.filter((c) => normalizar(c.titulo) === objetivo);
  const lista = exactos.length ? exactos : conRotulo;
  if (lista.length === 0) throw new ErrorHttp(404, `Ninguna tarea encontrada para "${referencia}".`);
  if (lista.length > 1) {
    throw new ErrorHttp(
      409,
      `Más de una tarea coincide con "${referencia}": ${lista.slice(0, 8).map((c) => c.rotulo).join('; ')}. Pregunta al usuario cuál de ellas (o indica el proyecto).`
    );
  }
  return cargarTarea(lista[0]._id, usuario);
}

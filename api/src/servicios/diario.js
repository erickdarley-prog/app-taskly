// Diario del proyecto: registros por día (manuales y automáticos) + cambios en las tareas.
import { RegistroDiario, CATEGORIAS_DIARIO } from '../models/RegistroDiario.js';
import { Historial } from '../models/Historial.js';
import { Hito } from '../models/Hito.js';
import { env } from '../config/env.js';
import { esAdmin } from '../middlewares/auth.js';
import { ErrorHttp, elegir, exigirId } from '../utils/http.js';
import { cargarProyecto } from '../utils/acceso.js';
import { ganchosEliminacionProyecto } from './proyectos.js';

ganchosEliminacionProyecto.push((idProyecto) => RegistroDiario.deleteMany({ proyecto: idProyecto }));

const ROTULO_STATUS = { por_hacer: 'Por hacer', en_curso: 'En curso', completada: 'Completada' };

// "AAAA-MM-DD" del día, en la zona horaria configurada.
export function diaDe(fecha) {
  return new Date(fecha).toLocaleDateString('en-CA', { timeZone: env.huso });
}

// Convierte "AAAA-MM-DD" al mediodía de ese día (evita cambiar de día por la zona horaria).
function leerDia(valor, campo = 'fecha') {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const texto = String(valor).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(texto);
  if (Number.isNaN(d.getTime())) throw new ErrorHttp(400, `Fecha no válida en ${campo}`);
  return d;
}

function sumarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return diaDe(d);
}

export function registrarEventoSistema(idProyecto, texto, { autor, categoria = 'observacion' } = {}) {
  return RegistroDiario.create({ proyecto: idProyecto, fecha: new Date(), texto, categoria, autor, tipo: 'sistema' });
}

function describirHistorial(h) {
  const titulo = h.tarea?.titulo ? `"${h.tarea.titulo}"` : 'una tarea';
  const d = h.detalles || {};
  switch (h.accion) {
    case 'creo':
      return `creó la tarea ${titulo}`;
    case 'status':
      return `cambió ${titulo} de ${ROTULO_STATUS[d.de] || d.de} a ${ROTULO_STATUS[d.para] || d.para}`;
    case 'horas':
      return `registró ${d.horas} h en ${titulo}${d.nota ? ` — ${d.nota}` : ''}`;
    case 'edito':
      return `editó ${titulo}`;
    default:
      return `${h.accion} ${titulo}`;
  }
}

// Diario agrupado por día, del más reciente al más antiguo, en un intervalo de días.
export async function obtenerDiario(usuario, idProyecto, query = {}) {
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const hasta = query.hasta && /^\d{4}-\d{2}-\d{2}$/.test(query.hasta) ? query.hasta : diaDe(new Date());
  const dias = Math.min(90, Math.max(1, parseInt(query.dias, 10) || 30));
  const de = sumarDias(hasta, -(dias - 1));
  const inicio = new Date(`${de}T00:00:00`);
  inicio.setHours(inicio.getHours() - 14); // margen para diferencias de zona horaria
  const fin = new Date(`${hasta}T23:59:59`);
  fin.setHours(fin.getHours() + 14);

  const incluirAutomaticos = query.automaticos !== 'false';
  const [registros, historiales] = await Promise.all([
    RegistroDiario.find({ proyecto: proyecto._id, fecha: { $gte: inicio, $lte: fin }, ...(incluirAutomaticos ? {} : { tipo: 'manual' }) })
      .sort({ fecha: -1, createdAt: -1 })
      .limit(2000)
      .populate('autor', 'nombre')
      .populate('hito', 'titulo')
      .lean(),
    incluirAutomaticos
      ? Historial.find({ proyecto: proyecto._id, accion: { $in: ['status', 'creo', 'horas'] }, createdAt: { $gte: inicio, $lte: fin } })
          .sort({ createdAt: -1 })
          .limit(2000)
          .populate('usuario', 'nombre')
          .populate('tarea', 'titulo')
          .lean()
      : [],
  ]);

  const items = [
    ...registros.map((r) => ({
      id: String(r._id),
      dia: diaDe(r.fecha),
      cuando: r.createdAt,
      tipo: r.tipo,
      categoria: r.categoria,
      texto: r.texto,
      autor: r.autor?.nombre || null,
      autorId: r.autor?._id ? String(r.autor._id) : null,
      hito: r.hito?.titulo || null,
      hitoId: r.hito?._id ? String(r.hito._id) : null,
    })),
    ...historiales.map((h) => ({
      id: `h${h._id}`,
      dia: diaDe(h.createdAt),
      cuando: h.createdAt,
      tipo: 'tarea',
      categoria: 'avance',
      texto: describirHistorial(h),
      autor: h.usuario?.nombre || null,
    })),
  ].filter((i) => i.dia >= de && i.dia <= hasta);

  const porDia = new Map();
  for (const item of items.sort((a, b) => (a.dia === b.dia ? new Date(b.cuando) - new Date(a.cuando) : a.dia < b.dia ? 1 : -1))) {
    if (!porDia.has(item.dia)) porDia.set(item.dia, []);
    porDia.get(item.dia).push(item);
  }

  return {
    de,
    hasta,
    anterior: sumarDias(de, -1), // úsalo como "hasta" para cargar los días anteriores
    dias: [...porDia.entries()].map(([dia, lista]) => ({ dia, items: lista })),
  };
}

const CAMPOS = ['fecha', 'texto', 'categoria', 'hito'];

async function validar(proyecto, datos) {
  if (datos.fecha !== undefined) datos.fecha = leerDia(datos.fecha) || new Date();
  if (datos.categoria !== undefined && !CATEGORIAS_DIARIO.includes(datos.categoria)) {
    throw new ErrorHttp(400, 'Categoría no válida');
  }
  if (datos.hito === '' || datos.hito === null) datos.hito = null;
  else if (datos.hito !== undefined) {
    const existe = await Hito.exists({ _id: exigirId(datos.hito, 'hito'), proyecto: proyecto._id });
    if (!existe) throw new ErrorHttp(400, 'El hito indicado no pertenece a este proyecto');
  }
}

// Cualquier participante del proyecto puede escribir en el diario.
export async function crearRegistro(usuario, idProyecto, cuerpo) {
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const datos = elegir(cuerpo || {}, CAMPOS);
  if (!String(datos.texto || '').trim()) throw new ErrorHttp(400, 'Escribe lo que pasó (observaciones)');
  await validar(proyecto, datos);
  if (!datos.fecha) datos.fecha = new Date();
  if (!datos.hito) delete datos.hito;
  return RegistroDiario.create({ ...datos, proyecto: proyecto._id, autor: usuario._id, tipo: 'manual' });
}

async function cargarRegistro(usuario, id) {
  const registro = await RegistroDiario.findById(exigirId(id, 'id del registro'));
  if (!registro) throw new ErrorHttp(404, 'Registro no encontrado');
  const proyecto = await cargarProyecto(registro.proyecto, usuario);
  if (registro.tipo === 'sistema') throw new ErrorHttp(400, 'Los registros automáticos no se pueden modificar');
  if (!esAdmin(usuario) && String(registro.autor) !== String(usuario._id)) {
    throw new ErrorHttp(403, 'Solo puedes modificar los registros que has escrito');
  }
  return { registro, proyecto };
}

export async function actualizarRegistro(usuario, id, cuerpo) {
  const { registro, proyecto } = await cargarRegistro(usuario, id);
  const datos = elegir(cuerpo || {}, CAMPOS);
  await validar(proyecto, datos);
  if (datos.hito === null) {
    delete datos.hito;
    registro.hito = undefined;
  }
  Object.assign(registro, datos);
  await registro.save();
  return registro;
}

export async function eliminarRegistro(usuario, id) {
  const { registro } = await cargarRegistro(usuario, id);
  await registro.deleteOne();
  return { eliminado: true };
}

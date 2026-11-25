// Funciones que puede usar el asistente. Cada una llama a los MISMOS servicios que los botones,
// así que los permisos (admin x equipo) valen igual aquí.
import crypto from 'node:crypto';
import { esAdmin } from '../middlewares/auth.js';
import { ErrorHttp } from '../utils/http.js';
import * as proyectos from '../servicios/proyectos.js';
import * as tareas from '../servicios/tareas.js';
import * as usuarios from '../servicios/usuarios.js';
import * as hitos from '../servicios/hitos.js';
import * as acuerdos from '../servicios/acuerdos.js';
import * as diario from '../servicios/diario.js';
import { listarAdjuntos } from '../servicios/adjuntos.js';
import { Hito } from '../models/Hito.js';
import { resolverPersona, resolverProyecto, resolverTarea } from './referencias.js';

// ---------- Formato compacto para la IA ----------

function fechaCorta(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  const huso = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - huso).toISOString().slice(0, 10);
}

// Acepta "AAAA-MM-DD" (o fecha ISO) y la guarda a mediodía, para no "retroceder un día" por la zona horaria.
function leerFecha(valor, campo) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const texto = String(valor).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(texto);
  if (Number.isNaN(d.getTime())) throw new ErrorHttp(400, `Fecha no válida en ${campo}. Usa el formato AAAA-MM-DD.`);
  return d;
}

const resumenProyecto = (p) => ({
  id: String(p._id),
  nombre: p.nombre,
  cliente: p.cliente || null,
  status: p.status,
  plazo: fechaCorta(p.plazo),
  responsable: p.responsable?.nombre || null,
  avance: p.resumen
    ? {
        porcentaje: p.resumen.porcentaje,
        completadas: p.resumen.completadas,
        total: p.resumen.total,
        atrasadas: p.resumen.atrasadas,
        horasGastadas: p.resumen.horasGastadas,
        horasEstimadas: p.resumen.horasEstimadas,
      }
    : undefined,
});

const resumenTarea = (t) => ({
  id: String(t._id),
  titulo: t.titulo,
  proyecto: t.proyecto?.nombre || undefined,
  hito: t.hito?.titulo || undefined,
  lado: t.lado || 'awakelab',
  responsable:
    t.lado === 'cliente'
      ? t.responsableExterno || 'cliente'
      : t.responsable?.nombre || (t.responsable ? String(t.responsable) : null),
  status: t.status,
  prioridad: t.prioridad,
  plazo: fechaCorta(t.plazo),
  atrasada: Boolean(t.atrasada),
  horasGastadas: t.horasGastadas,
  horasEstimadas: t.horasEstimadas,
});

const resumenUsuario = (u) => ({
  id: String(u._id),
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  funcion: u.funcion || null,
  activo: u.activo,
});

// ---------- Confirmación de eliminaciones ----------
// Además de que se le indica a la IA que pregunte, la API solo elimina si:
//  1) la respuesta anterior del asistente pidió confirmación ("¿Confirmas ...?"), y
//  2) el mensaje actual del usuario es un "sí" claro.
const CONFIRMACION = /(^|[^\p{L}])(s[ií]|confirmo|confirmado|puedes|adelante|vale|ok|okay|claro|correcto|dale|yes)([^\p{L}]|$)/iu;
const NEGACION = /(^|[^\p{L}])(no|cancela\w*|espera|alto|detente)([^\p{L}]|$)/iu;

function confirmacionValida(ctx, confirmado) {
  const ultima = ctx.ultimoMensaje || '';
  const pidio = /confirma/i.test(ctx.respuestaAnterior || '');
  return confirmado === true && pidio && CONFIRMACION.test(ultima) && !NEGACION.test(ultima);
}

function pedirConfirmacion(descripcion) {
  return {
    necesitaConfirmacion: true,
    instruccion: `No ejecutado. Pregunta al usuario, de forma explícita: "¿Confirmas ${descripcion}? Esta acción no se puede deshacer." Vuelve a llamar a la función con confirmado=true solo después de que responda que sí.`,
  };
}

async function resolverHito(proyecto, referencia) {
  if (!referencia) return undefined;
  if (referencia === 'sin') return null;
  const lista = await Hito.find({ proyecto: proyecto._id }).select('titulo').lean();
  const objetivo = String(referencia).trim().toLowerCase();
  const exactos = lista.filter((m) => m.titulo.toLowerCase() === objetivo || String(m._id) === referencia);
  const parecidos = exactos.length ? exactos : lista.filter((m) => m.titulo.toLowerCase().includes(objetivo));
  if (parecidos.length === 1) return String(parecidos[0]._id);
  if (!parecidos.length) {
    throw new ErrorHttp(404, `Ningún hito "${referencia}" en ${proyecto.nombre}. Hitos existentes: ${lista.map((m) => m.titulo).join('; ') || 'ninguno'}.`);
  }
  throw new ErrorHttp(409, `Más de un hito coincide con "${referencia}": ${parecidos.map((m) => m.titulo).join('; ')}. Pregunta cuál.`);
}

const resumenHito = (m) => ({
  id: String(m._id),
  titulo: m.titulo,
  inicio: fechaCorta(m.fechaInicio),
  entrega: fechaCorta(m.fechaFin),
  status: m.status,
  atrasado: m.atrasado,
  completadas: m.completadas,
  total: m.total,
  porcentaje: m.porcentaje,
});

function contrasenaTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

// ---------- Esquemas reutilizados ----------
const STATUS_PROYECTO = ['planificacion', 'en_curso', 'pausado', 'completado'];
const STATUS_TAREA = ['por_hacer', 'en_curso', 'completada'];
const PRIORIDADES = ['baja', 'media', 'alta'];
const texto = (description) => ({ type: 'string', description });
const fecha = (description) => ({ type: 'string', description: `${description} Formato AAAA-MM-DD.` });

// ---------- Definición de las funciones ----------
// "admin: true" = solo aparece para administradores.
// "modifica: true" = cambia datos (la pantalla se actualiza después).

const HERRAMIENTAS = [
  // ===== Consultas (todos) =====
  {
    nombre: 'listar_proyectos',
    descripcion: 'Lista los proyectos que el usuario puede ver, con el avance resumido. Úsala para encontrar proyectos o responder "qué proyectos hay".',
    parametros: {
      busqueda: texto('Parte del nombre o del cliente (opcional).'),
      status: { type: 'string', enum: STATUS_PROYECTO, description: 'Filtrar por estado (opcional).' },
    },
    ejecutar: async (ctx, a) => {
      const r = await proyectos.listarProyectos(ctx.usuario, { busqueda: a.busqueda, status: a.status, limite: 30 });
      return { total: r.total, proyectos: r.items.map(resumenProyecto) };
    },
  },
  {
    nombre: 'ver_proyecto',
    descripcion: 'Muestra los detalles y el avance completo de un proyecto: integrantes, totales, atrasadas, horas y avance por persona y por prioridad.',
    parametros: { proyecto: texto('Nombre (o id) del proyecto.') },
    obligatorios: ['proyecto'],
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const [detalle, avance] = await Promise.all([
        proyectos.obtenerProyecto(ctx.usuario, p._id),
        proyectos.obtenerAvance(ctx.usuario, p._id),
      ]);
      const { hitos: listaHitos } = await hitos.listarHitos(ctx.usuario, p._id);
      return {
        ...resumenProyecto(detalle),
        responsableCliente: detalle.responsableCliente?.nombre ? detalle.responsableCliente : null,
        hitos: listaHitos.map(resumenHito),
        descripcion: detalle.descripcion || null,
        fechaInicio: fechaCorta(detalle.fechaInicio),
        integrantes: detalle.integrantes.map((i) => ({ nombre: i.usuario?.nombre, funcion: i.funcion || null })),
        avanceGeneral: avance.general,
        porIntegrante: avance.porIntegrante.map((i) => ({
          nombre: i.usuario.nombre,
          funcion: i.funcion,
          total: i.total,
          completadas: i.completadas,
          enCurso: i.enCurso,
          porHacer: i.porHacer,
          atrasadas: i.atrasadas,
          horasGastadas: i.horasGastadas,
          horasEstimadas: i.horasEstimadas,
        })),
        porPrioridad: avance.porPrioridad,
        sinResponsable: avance.sinResponsable,
      };
    },
  },
  {
    nombre: 'listar_tareas',
    descripcion: 'Lista las tareas de un proyecto, con filtros opcionales.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      status: { type: 'string', enum: STATUS_TAREA, description: 'Filtrar por estado (opcional).' },
      responsable: texto('Nombre o e-mail de la persona responsable (opcional). Usa "sin" para tareas sin responsable.'),
      prioridad: { type: 'string', enum: PRIORIDADES, description: 'Filtrar por prioridad (opcional).' },
      atrasadas: { type: 'boolean', description: 'true para solo las atrasadas (opcional).' },
      busqueda: texto('Parte del título (opcional).'),
    },
    obligatorios: ['proyecto'],
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      let responsable;
      if (a.responsable === 'sin') responsable = 'sin';
      else if (a.responsable) responsable = String((await resolverPersona(a.responsable, { proyecto: p, soloActivos: false }))._id);
      const r = await proyectos.listarTareasDelProyecto(ctx.usuario, p._id, {
        status: a.status,
        prioridad: a.prioridad,
        responsable,
        atrasadas: a.atrasadas,
        busqueda: a.busqueda,
        limite: 100,
      });
      return { proyecto: p.nombre, total: r.total, mostrando: r.items.length, tareas: r.items.map(resumenTarea) };
    },
  },
  {
    nombre: 'mis_tareas',
    descripcion: 'Lista las tareas del usuario conectado en todos los proyectos.',
    parametros: {
      status: { type: 'string', enum: ['abiertas', ...STATUS_TAREA], description: 'Filtro (predeterminado: abiertas = no completadas).' },
      atrasadas: { type: 'boolean', description: 'true para solo las atrasadas (opcional).' },
    },
    ejecutar: async (ctx, a) => {
      const r = await tareas.misTareas(ctx.usuario, { status: a.status || 'abiertas', atrasadas: a.atrasadas, limite: 100 });
      return { total: r.total, tareas: r.items.map(resumenTarea) };
    },
  },
  {
    nombre: 'ver_tarea',
    descripcion: 'Muestra los detalles de una tarea y el historial de cambios.',
    parametros: {
      tarea: texto('Título (o id) de la tarea.'),
      proyecto: texto('Nombre del proyecto, para desambiguar (opcional).'),
    },
    obligatorios: ['tarea'],
    ejecutar: async (ctx, a) => {
      const { tarea } = await resolverTarea(ctx.usuario, a.tarea, a.proyecto);
      const [t, hist] = await Promise.all([
        tareas.obtenerTarea(ctx.usuario, tarea._id),
        tareas.historialDeTarea(ctx.usuario, tarea._id, { limite: 15 }),
      ]);
      return {
        ...resumenTarea(t),
        descripcion: t.descripcion || null,
        completadaEn: fechaCorta(t.completadaEn),
        historial: hist.items.map((h) => ({ quien: h.usuario?.nombre, accion: h.accion, detalles: h.detalles, cuando: h.createdAt })),
      };
    },
  },

  // ===== Cambios en la propia tarea (todos) =====
  {
    nombre: 'cambiar_status_tarea',
    descripcion: 'Cambia el estado de una tarea. Los integrantes del equipo solo pueden cambiar sus propias tareas.',
    parametros: {
      tarea: texto('Título (o id) de la tarea.'),
      proyecto: texto('Nombre del proyecto, para desambiguar (opcional).'),
      status: { type: 'string', enum: STATUS_TAREA, description: 'Nuevo estado.' },
    },
    obligatorios: ['tarea', 'status'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      const { tarea } = await resolverTarea(ctx.usuario, a.tarea, a.proyecto);
      const t = await tareas.cambiarStatus(ctx.usuario, tarea._id, a.status);
      return { ok: true, tarea: t.titulo, status: t.status };
    },
  },
  {
    nombre: 'registrar_horas',
    descripcion: 'Registra horas trabajadas en una tarea (se suman al total). Los integrantes del equipo solo pueden registrarlas en sus propias tareas.',
    parametros: {
      tarea: texto('Título (o id) de la tarea.'),
      proyecto: texto('Nombre del proyecto, para desambiguar (opcional).'),
      horas: { type: 'number', description: 'Horas trabajadas, entre 0.1 y 24 (p. ej.: 1.5).' },
      nota: texto('Lo que se hizo (opcional).'),
    },
    obligatorios: ['tarea', 'horas'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      const { tarea } = await resolverTarea(ctx.usuario, a.tarea, a.proyecto);
      const t = await tareas.registrarHoras(ctx.usuario, tarea._id, a.horas, a.nota);
      return { ok: true, tarea: t.titulo, horasRegistradas: a.horas, horasGastadasTotal: t.horasGastadas, horasEstimadas: t.horasEstimadas };
    },
  },

  // ===== Proyectos (admin) =====
  {
    nombre: 'crear_proyecto',
    admin: true,
    descripcion:
      'Crea un proyecto. Solo el nombre es obligatorio; antes de crearlo, pregunta (si aún no lo ha dicho) el cliente, el responsable del lado del cliente (nombre y e-mail), los integrantes con su función y el plazo. Después sugiere crear los hitos.',
    parametros: {
      nombre: texto('Nombre del proyecto.'),
      cliente: texto('Cliente o empresa (opcional).'),
      descripcion: texto('Descripción (opcional).'),
      status: { type: 'string', enum: STATUS_PROYECTO, description: 'Estado inicial (predeterminado: planificacion).' },
      fechaInicio: fecha('Fecha de inicio (opcional).'),
      plazo: fecha('Plazo de entrega (opcional).'),
      responsable: texto('Nombre o e-mail del responsable de Awakelab (predeterminado: el propio usuario).'),
      contactoClienteNombre: texto('Nombre del responsable del lado del cliente (quien firma el acuerdo).'),
      contactoClienteEmail: texto('E-mail del responsable del cliente (recibe el acuerdo para aceptarlo).'),
      contactoClienteCargo: texto('Cargo del responsable del cliente (opcional).'),
      integrantes: {
        type: 'array',
        description: 'Integrantes del proyecto (opcional).',
        items: {
          type: 'object',
          properties: { persona: texto('Nombre o e-mail de la persona.'), funcion: texto('Función en el proyecto (opcional).') },
          required: ['persona'],
        },
      },
    },
    obligatorios: ['nombre'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden crear proyectos');
      const integrantes = [];
      for (const i of a.integrantes || []) {
        const u = await resolverPersona(i.persona);
        integrantes.push({ usuario: String(u._id), funcion: i.funcion || u.funcion || '' });
      }
      const responsable = a.responsable ? String((await resolverPersona(a.responsable))._id) : undefined;
      const p = await proyectos.crearProyecto(ctx.usuario, {
        nombre: a.nombre,
        cliente: a.cliente,
        descripcion: a.descripcion,
        status: a.status,
        fechaInicio: leerFecha(a.fechaInicio, 'fechaInicio'),
        plazo: leerFecha(a.plazo, 'plazo'),
        responsable,
        integrantes,
        responsableCliente: a.contactoClienteNombre || a.contactoClienteEmail
          ? { nombre: a.contactoClienteNombre, email: a.contactoClienteEmail, cargo: a.contactoClienteCargo }
          : undefined,
      });
      return { ok: true, proyecto: { id: String(p._id), nombre: p.nombre, plazo: fechaCorta(p.plazo), integrantes: integrantes.length } };
    },
  },
  {
    nombre: 'editar_proyecto',
    admin: true,
    descripcion: 'Modifica los datos de un proyecto (nombre, cliente, descripción, estado, fechas, responsable). Envía solo los campos que cambian.',
    parametros: {
      proyecto: texto('Nombre (o id) actual del proyecto.'),
      nuevoNombre: texto('Nuevo nombre (opcional).'),
      cliente: texto('Cliente (opcional).'),
      descripcion: texto('Descripción (opcional).'),
      status: { type: 'string', enum: STATUS_PROYECTO, description: 'Nuevo estado (opcional).' },
      fechaInicio: fecha('Nueva fecha de inicio (opcional). Usa "" para quitarla.'),
      plazo: fecha('Nuevo plazo (opcional). Usa "" para quitarlo.'),
      responsable: texto('Nombre o e-mail del nuevo responsable de Awakelab (opcional).'),
      contactoClienteNombre: texto('Nuevo nombre del responsable del cliente (opcional).'),
      contactoClienteEmail: texto('Nuevo e-mail del responsable del cliente (opcional).'),
      contactoClienteCargo: texto('Nuevo cargo del responsable del cliente (opcional).'),
    },
    obligatorios: ['proyecto'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden editar proyectos');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const datos = {};
      if (a.nuevoNombre) datos.nombre = a.nuevoNombre;
      if (a.cliente !== undefined) datos.cliente = a.cliente;
      if (a.descripcion !== undefined) datos.descripcion = a.descripcion;
      if (a.status) datos.status = a.status;
      if (a.fechaInicio !== undefined) datos.fechaInicio = leerFecha(a.fechaInicio, 'fechaInicio');
      if (a.plazo !== undefined) datos.plazo = leerFecha(a.plazo, 'plazo');
      if (a.responsable) datos.responsable = String((await resolverPersona(a.responsable))._id);
      if (a.contactoClienteNombre !== undefined || a.contactoClienteEmail !== undefined || a.contactoClienteCargo !== undefined) {
        const actual = p.responsableCliente || {};
        datos.responsableCliente = {
          nombre: a.contactoClienteNombre ?? actual.nombre,
          email: a.contactoClienteEmail ?? actual.email,
          cargo: a.contactoClienteCargo ?? actual.cargo,
        };
      }
      const actualizado = await proyectos.actualizarProyecto(ctx.usuario, p._id, datos);
      return { ok: true, proyecto: actualizado.nombre, modificados: Object.keys(datos) };
    },
  },
  {
    nombre: 'anadir_integrante',
    admin: true,
    descripcion: 'Añade una persona a un proyecto (o actualiza su función, si ya participa).',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      persona: texto('Nombre o e-mail de la persona.'),
      funcion: texto('Función en el proyecto (opcional).'),
    },
    obligatorios: ['proyecto', 'persona'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden modificar los integrantes');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const u = await resolverPersona(a.persona);
      const integrantes = p.integrantes.map((i) => ({ usuario: String(i.usuario), funcion: i.funcion }));
      const existente = integrantes.find((i) => i.usuario === String(u._id));
      if (existente) existente.funcion = a.funcion ?? existente.funcion;
      else integrantes.push({ usuario: String(u._id), funcion: a.funcion || u.funcion || '' });
      await proyectos.actualizarProyecto(ctx.usuario, p._id, { integrantes });
      return { ok: true, proyecto: p.nombre, persona: u.nombre, jaParticipava: Boolean(existente) };
    },
  },
  {
    nombre: 'quitar_integrante',
    admin: true,
    descripcion: 'Quita a una persona de la lista de integrantes de un proyecto. Sus tareas siguen en el proyecto.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      persona: texto('Nombre o e-mail de la persona.'),
    },
    obligatorios: ['proyecto', 'persona'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden modificar los integrantes');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const u = await resolverPersona(a.persona, { proyecto: p, soloActivos: false });
      const integrantes = p.integrantes
        .filter((i) => String(i.usuario) !== String(u._id))
        .map((i) => ({ usuario: String(i.usuario), funcion: i.funcion }));
      if (integrantes.length === p.integrantes.length) return { ok: false, aviso: `${u.nombre} no es integrante de ${p.nombre}.` };
      await proyectos.actualizarProyecto(ctx.usuario, p._id, { integrantes });
      return { ok: true, proyecto: p.nombre, quitado: u.nombre };
    },
  },
  {
    nombre: 'eliminar_proyecto',
    admin: true,
    descripcion: 'Elimina un proyecto y TODAS sus tareas. Antes, pregunta al usuario si lo confirma; envía confirmado=true solo después de que responda que sí.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      confirmado: { type: 'boolean', description: 'true solo si el usuario acaba de confirmar la eliminación.' },
    },
    obligatorios: ['proyecto'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden eliminar proyectos');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      if (!confirmacionValida(ctx, a.confirmado)) return pedirConfirmacion(`la eliminación del proyecto "${p.nombre}" y de todas sus tareas`);
      return { ok: true, ...(await proyectos.eliminarProyecto(ctx.usuario, p._id)) };
    },
  },

  // ===== Tareas (admin) =====
  {
    nombre: 'crear_tarea',
    admin: true,
    descripcion:
      'Crea una tarea en un proyecto, dentro de un hito. Si el usuario no ha dicho el hito, de quién es la tarea (Awakelab o cliente), el responsable o el plazo, pregunta antes (puede crearla sin ellos si lo prefiere).',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      titulo: texto('Título de la tarea.'),
      hito: texto('Título del hito donde va la tarea (opcional).'),
      lado: { type: 'string', enum: ['awakelab', 'cliente'], description: 'De quién es la tarea (predeterminado: awakelab).' },
      descripcion: texto('Descripción (opcional).'),
      responsable: texto('Para tareas de Awakelab: nombre o e-mail del integrante responsable (opcional).'),
      responsableCliente: texto('Para tareas del cliente: nombre de la persona del cliente (opcional).'),
      prioridad: { type: 'string', enum: PRIORIDADES, description: 'Prioridad (predeterminado: media).' },
      status: { type: 'string', enum: STATUS_TAREA, description: 'Estado inicial (predeterminado: por_hacer).' },
      plazo: fecha('Plazo (opcional).'),
      horasEstimadas: { type: 'number', description: 'Horas estimadas (opcional).' },
    },
    obligatorios: ['proyecto', 'titulo'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden crear tareas');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const lado = a.lado || 'awakelab';
      const responsable =
        lado === 'awakelab' && a.responsable ? String((await resolverPersona(a.responsable, { proyecto: p }))._id) : undefined;
      const t = await proyectos.crearTarea(ctx.usuario, p._id, {
        titulo: a.titulo,
        hito: await resolverHito(p, a.hito),
        lado,
        responsableExterno: lado === 'cliente' ? a.responsableCliente || a.responsable || '' : '',
        descripcion: a.descripcion,
        responsable,
        prioridad: a.prioridad,
        status: a.status,
        plazo: leerFecha(a.plazo, 'plazo'),
        horasEstimadas: a.horasEstimadas,
      });
      return { ok: true, proyecto: p.nombre, tarea: resumenTarea(t) };
    },
  },
  {
    nombre: 'editar_tarea',
    admin: true,
    descripcion: 'Modifica una tarea (título, descripción, responsable, prioridad, plazo, horas estimadas, estado). Envía solo lo que cambia.',
    parametros: {
      tarea: texto('Título (o id) actual de la tarea.'),
      proyecto: texto('Nombre del proyecto, para desambiguar (opcional).'),
      nuevoTitulo: texto('Nuevo título (opcional).'),
      hito: texto('Mover a este hito (título), o "sin" para sacarla del hito (opcional).'),
      lado: { type: 'string', enum: ['awakelab', 'cliente'], description: 'Cambiar de quién es la tarea (opcional).' },
      descripcion: texto('Nueva descripción (opcional).'),
      responsable: texto('Nombre o e-mail del nuevo responsable de Awakelab, o "sin" para quitarlo (opcional).'),
      responsableCliente: texto('Para tareas del cliente: nombre de la persona del cliente (opcional).'),
      prioridad: { type: 'string', enum: PRIORIDADES, description: 'Nueva prioridad (opcional).' },
      status: { type: 'string', enum: STATUS_TAREA, description: 'Nuevo estado (opcional).' },
      plazo: fecha('Nuevo plazo (opcional). Usa "" para quitarlo.'),
      horasEstimadas: { type: 'number', description: 'Nuevas horas estimadas (opcional).' },
    },
    obligatorios: ['tarea'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden editar tareas');
      const { tarea, proyecto } = await resolverTarea(ctx.usuario, a.tarea, a.proyecto);
      const datos = {};
      if (a.nuevoTitulo) datos.titulo = a.nuevoTitulo;
      if (a.hito !== undefined) datos.hito = await resolverHito(proyecto, a.hito);
      if (a.lado) datos.lado = a.lado;
      if (a.responsableCliente !== undefined) datos.responsableExterno = a.responsableCliente;
      if (a.descripcion !== undefined) datos.descripcion = a.descripcion;
      if (a.responsable === 'sin') datos.responsable = null;
      else if (a.responsable) datos.responsable = String((await resolverPersona(a.responsable, { proyecto }))._id);
      if (a.prioridad) datos.prioridad = a.prioridad;
      if (a.status) datos.status = a.status;
      if (a.plazo !== undefined) datos.plazo = leerFecha(a.plazo, 'plazo');
      if (a.horasEstimadas !== undefined) datos.horasEstimadas = a.horasEstimadas;
      const t = await tareas.actualizarTarea(ctx.usuario, tarea._id, datos);
      return { ok: true, tarea: resumenTarea(t), modificados: Object.keys(datos) };
    },
  },
  {
    nombre: 'eliminar_tarea',
    admin: true,
    descripcion: 'Elimina una tarea. Antes, pregunta al usuario si lo confirma; envía confirmado=true solo después de que responda que sí.',
    parametros: {
      tarea: texto('Título (o id) de la tarea.'),
      proyecto: texto('Nombre del proyecto, para desambiguar (opcional).'),
      confirmado: { type: 'boolean', description: 'true solo si el usuario acaba de confirmar la eliminación.' },
    },
    obligatorios: ['tarea'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden eliminar tareas');
      const { tarea } = await resolverTarea(ctx.usuario, a.tarea, a.proyecto);
      if (!confirmacionValida(ctx, a.confirmado)) return pedirConfirmacion(`la eliminación de la tarea "${tarea.titulo}"`);
      return { ok: true, ...(await tareas.eliminarTarea(ctx.usuario, tarea._id)) };
    },
  },

  // ===== Hitos (todos consultan; admin modifica) =====
  {
    nombre: 'ver_hitos',
    descripcion:
      'Vista lineal del proyecto: hito a hito, con fechas, estado y las tareas de cada uno (de quién es, responsable y estado). Úsala para "cómo va cada etapa", "qué falta en el hito X", "qué depende del cliente".',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      hito: texto('Mostrar solo este hito (opcional).'),
    },
    obligatorios: ['proyecto'],
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const r = await hitos.listarHitos(ctx.usuario, p._id, { conTareas: true });
      let lista = r.hitos;
      if (a.hito) {
        const id = await resolverHito(p, a.hito);
        lista = lista.filter((m) => String(m._id) === id);
      }
      return {
        proyecto: p.nombre,
        hitos: lista.map((m) => ({ ...resumenHito(m), tareas: m.tareas.map(resumenTarea) })),
        tareasSinHito: a.hito ? undefined : r.sinHito?.tareas?.map(resumenTarea),
      };
    },
  },
  {
    nombre: 'crear_hito',
    admin: true,
    descripcion: 'Crea un hito (etapa) en el proyecto, con fechas aproximadas de inicio y entrega. Pregunta las fechas si el usuario no las ha dicho.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      titulo: texto('Nombre del hito, p. ej.: "Crear dominios".'),
      descripcion: texto('Descripción (opcional).'),
      inicio: fecha('Fecha aproximada de inicio (opcional).'),
      entrega: fecha('Fecha aproximada de entrega (opcional).'),
    },
    obligatorios: ['proyecto', 'titulo'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden crear hitos');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const m = await hitos.crearHito(ctx.usuario, p._id, {
        titulo: a.titulo,
        descripcion: a.descripcion,
        fechaInicio: leerFecha(a.inicio, 'inicio'),
        fechaFin: leerFecha(a.entrega, 'entrega'),
      });
      return { ok: true, proyecto: p.nombre, hito: { titulo: m.titulo, inicio: fechaCorta(m.fechaInicio), entrega: fechaCorta(m.fechaFin), orden: m.orden } };
    },
  },
  {
    nombre: 'editar_hito',
    admin: true,
    descripcion: 'Modifica un hito (nombre, descripción, fechas o posición en el orden). Envía solo lo que cambia.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      hito: texto('Título actual del hito.'),
      nuevoTitulo: texto('Nuevo título (opcional).'),
      descripcion: texto('Nueva descripción (opcional).'),
      inicio: fecha('Nueva fecha de inicio (opcional). Usa "" para quitarla.'),
      entrega: fecha('Nueva fecha de entrega (opcional). Usa "" para quitarla.'),
      orden: { type: 'number', description: 'Nueva posición en la lista (1 = primero) (opcional).' },
    },
    obligatorios: ['proyecto', 'hito'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden editar hitos');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const id = await resolverHito(p, a.hito);
      const datos = {};
      if (a.nuevoTitulo) datos.titulo = a.nuevoTitulo;
      if (a.descripcion !== undefined) datos.descripcion = a.descripcion;
      if (a.inicio !== undefined) datos.fechaInicio = leerFecha(a.inicio, 'inicio');
      if (a.entrega !== undefined) datos.fechaFin = leerFecha(a.entrega, 'entrega');
      if (a.orden !== undefined) datos.orden = a.orden;
      const m = await hitos.actualizarHito(ctx.usuario, id, datos);
      return { ok: true, hito: m.titulo, modificados: Object.keys(datos) };
    },
  },
  {
    nombre: 'eliminar_hito',
    admin: true,
    descripcion: 'Elimina un hito. Sus tareas NO se borran (quedan sin hito). Pregunta si lo confirma antes; envía confirmado=true solo después del "sí".',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      hito: texto('Título del hito.'),
      confirmado: { type: 'boolean', description: 'true solo si el usuario acaba de confirmar.' },
    },
    obligatorios: ['proyecto', 'hito'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden eliminar hitos');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const id = await resolverHito(p, a.hito);
      if (!confirmacionValida(ctx, a.confirmado)) return pedirConfirmacion(`la eliminación del hito "${a.hito}" (las tareas quedan sin hito)`);
      return { ok: true, ...(await hitos.eliminarHito(ctx.usuario, id)) };
    },
  },

  // ===== Alcance / acuerdo =====
  {
    nombre: 'ver_alcance',
    descripcion:
      'Muestra el alcance del proyecto: lo que está incluido y lo que NO está incluido, la versión vigente (firmada), la versión en curso y la situación de las firmas.',
    parametros: { proyecto: texto('Nombre (o id) del proyecto.') },
    obligatorios: ['proyecto'],
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const r = await acuerdos.listarAcuerdos(ctx.usuario, p._id);
      const resumir = (v) =>
        v && {
          version: v.version,
          status: v.status,
          incluidos: v.incluidos.map((i) => i.texto),
          noIncluidos: v.noIncluidos.map((i) => i.texto),
          firmaAwakelab: v.firmaEmpresa?.fecha ? { nombre: v.firmaEmpresa.nombre, fecha: v.firmaEmpresa.fecha } : null,
          aceptacionCliente: v.firmaCliente?.fecha ? { nombre: v.firmaCliente.nombre, fecha: v.firmaCliente.fecha } : null,
        };
      return {
        proyecto: p.nombre,
        responsableCliente: r.responsableCliente,
        responsableAwakelab: r.responsableEmpresa?.nombre,
        vigente: resumir(r.vigente),
        enCurso: resumir(r.enCurso),
        aviso: 'El envío al cliente y la firma de Awakelab se hacen con los botones de la pestaña "Alcance y acuerdo".',
      };
    },
  },
  {
    nombre: 'modificar_alcance',
    admin: true,
    descripcion:
      'Añade o quita elementos del alcance (incluido / no incluido). Los cambios van a una NUEVA VERSIÓN en borrador; después el usuario la envía al cliente con el botón "Enviar a firma" de la pestaña "Alcance y acuerdo".',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      anadirIncluidos: { type: 'array', items: { type: 'string' }, description: 'Elementos que SÍ entran en el proyecto (opcional).' },
      anadirNoIncluidos: { type: 'array', items: { type: 'string' }, description: 'Elementos que NO entran en el proyecto (opcional).' },
      quitar: { type: 'array', items: { type: 'string' }, description: 'Textos exactos de elementos que se quitarán de cualquier lista (opcional).' },
    },
    obligatorios: ['proyecto'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden modificar el alcance');
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const r = await acuerdos.modificarItemsDelAlcance(ctx.usuario, p._id, {
        anadirIncluidos: a.anadirIncluidos || [],
        anadirNoIncluidos: a.anadirNoIncluidos || [],
        quitar: a.quitar || [],
      });
      return {
        ok: true,
        version: r.version,
        status: 'borrador',
        incluidos: r.incluidos.map((i) => i.texto),
        noIncluidos: r.noIncluidos.map((i) => i.texto),
        siguientePaso: 'Revisar y hacer clic en "Enviar a firma" en la pestaña "Alcance y acuerdo" del proyecto.',
      };
    },
  },

  // ===== Diario (todos los participantes) =====
  {
    nombre: 'registrar_diario',
    descripcion:
      'Escribe en el diario del proyecto lo que pasó en un día, con observaciones. Úsala cuando el usuario cuente un avance, un problema, una reunión o algo del cliente.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      texto: texto('Lo que pasó, con las observaciones.'),
      fecha: fecha('Día del registro (predeterminado: hoy).'),
      hito: texto('Hito relacionado (opcional).'),
      categoria: { type: 'string', enum: ['avance', 'observacion', 'problema', 'reunion', 'cliente'], description: 'Tipo de registro (predeterminado: avance).' },
    },
    obligatorios: ['proyecto', 'texto'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const r = await diario.crearRegistro(ctx.usuario, p._id, {
        texto: a.texto,
        fecha: a.fecha,
        categoria: a.categoria,
        hito: await resolverHito(p, a.hito),
      });
      return { ok: true, proyecto: p.nombre, dia: fechaCorta(r.fecha), categoria: r.categoria };
    },
  },
  {
    nombre: 'ver_diario',
    descripcion: 'Muestra el diario del proyecto (registros por día con observaciones y cambios en las tareas).',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      hasta: fecha('Último día que se muestra (predeterminado: hoy).'),
      dias: { type: 'number', description: 'Cuántos días hacia atrás (predeterminado 7, máximo 90).' },
    },
    obligatorios: ['proyecto'],
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const r = await diario.obtenerDiario(ctx.usuario, p._id, { hasta: a.hasta, dias: a.dias || 7 });
      return {
        proyecto: p.nombre,
        de: r.de,
        hasta: r.hasta,
        dias: r.dias.map((d) => ({
          dia: d.dia,
          registros: d.items.slice(0, 30).map((i) => ({ tipo: i.tipo, categoria: i.categoria, autor: i.autor, hito: i.hito, texto: i.texto })),
        })),
      };
    },
  },

  {
    nombre: 'listar_adjuntos',
    descripcion: 'Lista los adjuntos del proyecto (vídeos, imágenes, documentos y archivos) con quién los subió y cuándo. El usuario los abre y descarga en la pestaña "Adjuntos" del proyecto.',
    parametros: {
      proyecto: texto('Nombre (o id) del proyecto.'),
      tipo: { type: 'string', enum: ['video', 'imagen', 'documento', 'archivo'], description: 'Filtrar por tipo (opcional).' },
      busqueda: texto('Parte del nombre del archivo (opcional).'),
    },
    obligatorios: ['proyecto'],
    ejecutar: async (ctx, a) => {
      const p = await resolverProyecto(ctx.usuario, a.proyecto);
      const r = await listarAdjuntos(ctx.usuario, p._id, { tipo: a.tipo, busqueda: a.busqueda });
      return {
        proyecto: p.nombre,
        total: r.total,
        porTipo: r.porTipo,
        adjuntos: r.items.slice(0, 50).map((x) => ({
          nombre: x.nombre,
          tipo: x.tipo,
          tamanoKb: Math.round(x.tamano / 1024),
          enviadoPor: x.enviadoPor?.nombre,
          fecha: fechaCorta(x.createdAt),
          puedeVisualizar: Boolean(x.visualizador),
        })),
        aviso: 'Para verlos o descargarlos, usa la pestaña "Adjuntos" del proyecto. Desde el chat no se pueden enviar archivos.',
      };
    },
  },

  // ===== Usuarios (admin) =====
  {
    nombre: 'listar_usuarios',
    admin: true,
    descripcion: 'Lista los usuarios del sistema.',
    parametros: { busqueda: texto('Parte del nombre o e-mail (opcional).') },
    ejecutar: async (ctx, a) => {
      const r = await usuarios.listarUsuarios(ctx.usuario, { busqueda: a.busqueda, limite: 50 });
      return { total: r.total, usuarios: r.items.map(resumenUsuario) };
    },
  },
  {
    nombre: 'crear_usuario',
    admin: true,
    descripcion: 'Crea un usuario. La contraseña se genera automáticamente y solo se muestra en la pantalla del administrador (no pidas contraseña al usuario).',
    parametros: {
      nombre: texto('Nombre completo.'),
      email: texto('E-mail de acceso.'),
      rol: { type: 'string', enum: ['equipo', 'admin'], description: 'Perfil (predeterminado: equipo).' },
      funcion: texto('Función, p. ej.: Front-end (opcional).'),
    },
    obligatorios: ['nombre', 'email'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      const contrasena = contrasenaTemporal();
      const u = await usuarios.crearUsuario(ctx.usuario, { nombre: a.nombre, email: a.email, rol: a.rol, funcion: a.funcion, contrasena });
      // La contraseña va solo a la pantalla; la IA recibe únicamente el aviso.
      ctx.extras.push({ tipo: 'contrasena', nombre: u.nombre, email: u.email, contrasena });
      return { ok: true, usuario: resumenUsuario(u), contrasena: 'Generada y mostrada solo en la pantalla del administrador.' };
    },
  },
  {
    nombre: 'editar_usuario',
    admin: true,
    descripcion: 'Modifica un usuario (nombre, e-mail, perfil, función, activo). Para desactivar el acceso usa activo=false. Para una contraseña nueva usa restablecerContrasena=true.',
    parametros: {
      usuario: texto('Nombre o e-mail actual del usuario.'),
      nombre: texto('Nuevo nombre (opcional).'),
      email: texto('Nuevo e-mail (opcional).'),
      rol: { type: 'string', enum: ['equipo', 'admin'], description: 'Nuevo perfil (opcional).' },
      funcion: texto('Nueva función (opcional).'),
      activo: { type: 'boolean', description: 'false desactiva el acceso; true lo reactiva (opcional).' },
      restablecerContrasena: { type: 'boolean', description: 'true genera una nueva contraseña temporal (opcional).' },
    },
    obligatorios: ['usuario'],
    modifica: true,
    ejecutar: async (ctx, a) => {
      proyectos.exigirAdmin(ctx.usuario, 'Solo los administradores pueden editar usuarios');
      const objetivo = await resolverPersona(a.usuario, { soloActivos: false });
      const datos = {};
      for (const c of ['nombre', 'email', 'rol', 'funcion', 'activo']) if (a[c] !== undefined) datos[c] = a[c];
      let contrasena;
      if (a.restablecerContrasena) datos.contrasena = contrasena = contrasenaTemporal();
      const u = await usuarios.actualizarUsuario(ctx.usuario, objetivo._id, datos);
      if (contrasena) ctx.extras.push({ tipo: 'contrasena', nombre: u.nombre, email: u.email, contrasena });
      const modificados = Object.keys(datos).map((c) => (c === 'contrasena' ? 'contraseña (mostrada en pantalla)' : c));
      return { ok: true, usuario: resumenUsuario(u), modificados };
    },
  },
];

// Monta la lista en el formato de OpenAI (Responses API), según el perfil.
export function definicionesPara(usuario) {
  return HERRAMIENTAS.filter((f) => !f.admin || esAdmin(usuario)).map((f) => ({
    type: 'function',
    name: f.nombre,
    description: f.descripcion,
    parameters: {
      type: 'object',
      properties: f.parametros || {},
      required: f.obligatorios || [],
      additionalProperties: false,
    },
    strict: false,
  }));
}

// Ejecuta una llamada a función pedida por la IA y devuelve un resultado en JSON.
export async function ejecutarHerramienta(ctx, nombre, argumentosJson) {
  const herramienta = HERRAMIENTAS.find((f) => f.nombre === nombre);
  if (!herramienta) return { error: `Función desconocida: ${nombre}` };
  if (herramienta.admin && !esAdmin(ctx.usuario)) {
    return { error: 'Solo los administradores pueden hacer esto. Explica al usuario lo que puede hacer desde el chat.' };
  }

  let args;
  try {
    args = argumentosJson ? JSON.parse(argumentosJson) : {};
  } catch {
    return { error: 'Argumentos no válidos (JSON mal formado).' };
  }

  try {
    const resultado = await herramienta.ejecutar(ctx, args);
    const ejecuto = herramienta.modifica && resultado?.ok;
    if (ejecuto) ctx.modifico = true;
    ctx.acciones.push({ herramienta: nombre, ok: Boolean(resultado?.ok ?? !resultado?.error), modifica: Boolean(herramienta.modifica) });
    return resultado;
  } catch (error) {
    if (error instanceof ErrorHttp) {
      ctx.acciones.push({ herramienta: nombre, ok: false, modifica: Boolean(herramienta.modifica) });
      return { error: error.message };
    }
    if (error?.name === 'ValidationError') {
      const msgs = Object.values(error.errors || {}).map((e) => e.message);
      return { error: `Datos no válidos: ${msgs.join(', ')}` };
    }
    if (error?.code === 11000) return { error: 'Ya existe un registro con ese e-mail/valor.' };
    console.error('[chat] error en la función', nombre, error);
    return { error: 'Error interno al ejecutar la acción.' };
  }
}

export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS.map((f) => ({ nombre: f.nombre, admin: Boolean(f.admin), modifica: Boolean(f.modifica) }));

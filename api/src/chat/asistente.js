// Conversación con OpenAI: envía el mensaje + las funciones disponibles, ejecuta las
// funciones que pida la IA (con los permisos del usuario) y devuelve la respuesta final.
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { Conversacion } from '../models/Conversacion.js';
import { esAdmin } from '../middlewares/auth.js';
import { ErrorHttp } from '../utils/http.js';
import { definicionesPara, ejecutarHerramienta } from './herramientas.js';

const MAX_PASOS = 8; // límite de rondas IA -> función -> IA por mensaje
const MAX_ITEMS_GUARDADOS = 60; // tamaño máximo del historial guardado por usuario

let clienteActual = null;

// Permite cambiar el cliente (se usa en las pruebas, sin llamar a OpenAI de verdad).
export function definirClienteOpenAI(cliente) {
  clienteActual = cliente;
}

function cliente() {
  if (clienteActual) return clienteActual;
  if (!env.openaiApiKey) {
    throw new ErrorHttp(503, 'El asistente aún no está configurado: pon tu OPENAI_API_KEY en el archivo api/.env y reinicia la API.');
  }
  clienteActual = new OpenAI({ apiKey: env.openaiApiKey });
  return clienteActual;
}

export function asistenteConfigurado() {
  return Boolean(clienteActual || env.openaiApiKey);
}

function hoyEnZonaHoraria() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('en-CA', { timeZone: env.huso }); // AAAA-MM-DD
  const diaSemana = ahora.toLocaleDateString('es-ES', { timeZone: env.huso, weekday: 'long' });
  return `${fecha} (${diaSemana})`;
}

function instrucciones(usuario) {
  const admin = esAdmin(usuario);
  return [
    'Eres el asistente de Taskly, el sistema de Awakelab para seguir los proyectos de clientes.',
    'Cómo funcionan los proyectos: cada proyecto se divide en HITOS (etapas) con fechas aproximadas de inicio y entrega; cada hito tiene TAREAS, que son de Awakelab o del Cliente, con responsable opcional. El proyecto tiene un responsable de Awakelab y uno del cliente, un ALCANCE (lo que está incluido y lo que no) firmado por las dos partes (cada cambio genera una nueva versión y una nueva firma), y un DIARIO con lo que ocurrió cada día, con observaciones.',
    `Usuario conectado: ${usuario.nombre} (${usuario.email}), perfil ${admin ? 'ADMINISTRADOR' : 'EQUIPO'}${usuario.funcion ? `, función ${usuario.funcion}` : ''}.`,
    `Hoy es ${hoyEnZonaHoraria()}, zona horaria ${env.huso}. Convierte las fechas que diga el usuario ("el día 20", "el viernes que viene") a AAAA-MM-DD.`,
    '',
    'Cómo actuar:',
    '- Responde siempre en español de España, de forma breve, amable y directa.',
    '- Usa las funciones para consultar y modificar datos. Nunca inventes proyectos, personas, números ni resultados.',
    '- Para crear algo, reúne lo que falte conversando: haz como máximo 2 preguntas cada vez. Si el usuario ya dio la información, ejecuta directamente.',
    '- Cuando el usuario diga "yo" o "mi", se refiere a sí mismo.',
    '- Después de ejecutar una acción, confirma lo que se hizo en una o dos frases y sugiere el siguiente paso útil cuando tenga sentido.',
    '- Eliminaciones: pregunta SIEMPRE "¿Confirmas ...?" y llama a la función con confirmado=true solo después de un "sí" claro.',
    '- Si una función devuelve "error", explica el problema al usuario con lenguaje sencillo. Si hay más de una opción parecida, pregunta cuál quiere.',
    '- No muestres ids internos al usuario. Muestra las fechas como DD/MM/AAAA y los estados en español (por hacer, en curso, completada; planificación, en curso, pausado, completado).',
    '- Taskly muestra el AVANCE, no evalúa a las personas: no hagas rankings ni juzgues el rendimiento individual.',
    '- Nunca pidas ni muestres contraseñas; al crear un usuario la contraseña temporal aparece solo en la pantalla del administrador.',
    '- Tú NO envías el acuerdo al cliente ni firmas por nadie: eso se hace con los botones de la pestaña "Alcance y acuerdo". Después de modificar el alcance, recuerda al usuario que debe enviarlo a firma.',
    '- Cuando el usuario cuente algo que pasó en el proyecto (avance, problema, reunión, respuesta del cliente), ofrece registrarlo en el diario.',
    admin
      ? '- El usuario es administrador y puede usar todas las funciones disponibles.'
      : '- El usuario es del EQUIPO: puede consultar los proyectos en los que participa (hitos, alcance, diario), escribir en el diario y, en sus PROPIAS tareas, cambiar el estado y registrar horas. Si pide algo de administrador (crear/editar/eliminar proyectos, hitos, tareas, alcance o usuarios, tocar tareas de otra persona o del cliente), explica amablemente que solo los administradores pueden hacerlo y ofrece lo que sí puede hacer.',
  ].join('\n');
}

function textoDeMensaje(item) {
  if (typeof item.content === 'string') return item.content;
  return (item.content || [])
    .map((c) => c.text || '')
    .join('')
    .trim();
}

// Convierte la salida de OpenAI en elementos simples para reenviar/guardar.
// mantenerRazonamiento: incluye elementos de razonamiento cifrados (solo durante la misma respuesta).
function limpiarItems(salida, { mantenerRazonamiento }) {
  const items = [];
  for (const item of salida) {
    if (item.type === 'reasoning') {
      if (mantenerRazonamiento && item.encrypted_content) items.push(item);
    } else if (item.type === 'function_call') {
      items.push({ type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments });
    } else if (item.type === 'message' && item.role === 'assistant') {
      const texto = textoDeMensaje(item);
      if (texto) items.push({ role: 'assistant', content: texto });
    }
  }
  return items;
}

// Mantiene solo los elementos más recientes, empezando siempre por un mensaje del usuario.
function recortarHistorial(items) {
  const sinRazonamiento = items.filter((i) => i.type !== 'reasoning');
  if (sinRazonamiento.length <= MAX_ITEMS_GUARDADOS) return sinRazonamiento;
  let inicio = sinRazonamiento.length - MAX_ITEMS_GUARDADOS;
  while (inicio < sinRazonamiento.length && sinRazonamiento[inicio].role !== 'user') inicio += 1;
  return sinRazonamiento.slice(inicio);
}

function traducirErrorOpenAI(error) {
  const status = error?.status;
  if (status === 401) return new ErrorHttp(502, 'La clave de OpenAI (OPENAI_API_KEY) fue rechazada. Comprueba que sea correcta en el archivo api/.env.');
  if (status === 429) return new ErrorHttp(502, 'OpenAI lo rechazó por límite de uso o falta de créditos. Revisa el saldo de tu cuenta de OpenAI.');
  if (status === 404) return new ErrorHttp(502, `El modelo "${env.openaiModel}" no se encontró en tu cuenta de OpenAI. Ajusta OPENAI_MODEL en el archivo api/.env.`);
  if (status === 400) {
    const detalle = error?.error?.message || error?.message || '';
    return new ErrorHttp(502, `OpenAI rechazó la solicitud: ${detalle}. Si menciona "reasoning", deja OPENAI_REASONING_EFFORT vacío en el .env.`);
  }
  if (error?.code === 'ENOTFOUND' || error?.name === 'APIConnectionError') {
    return new ErrorHttp(502, 'No se pudo conectar con OpenAI. Comprueba la conexión a internet.');
  }
  return new ErrorHttp(502, 'El asistente no ha podido responder ahora. Inténtalo de nuevo en unos instantes.');
}

export async function responder(usuario, mensaje) {
  const texto = String(mensaje || '').trim();
  if (!texto) throw new ErrorHttp(400, 'Escribe un mensaje.');
  if (texto.length > 4000) throw new ErrorHttp(400, 'Mensaje demasiado largo (máximo 4000 caracteres).');

  const openai = cliente();
  const conversacion = (await Conversacion.findOne({ usuario: usuario._id })) || new Conversacion({ usuario: usuario._id, items: [] });
  const entrada = [...conversacion.items, { role: 'user', content: texto }];
  const herramientas = definicionesPara(usuario);
  const respuestaAnterior = [...conversacion.items].reverse().find((i) => i.role === 'assistant')?.content || '';
  const ctx = { usuario, ultimoMensaje: texto, respuestaAnterior, modifico: false, acciones: [], extras: [] };
  const conRazonamiento = Boolean(env.openaiReasoningEffort);

  let respuesta = '';
  for (let paso = 0; paso < MAX_PASOS; paso += 1) {
    let r;
    try {
      r = await openai.responses.create({
        model: env.openaiModel,
        instructions: instrucciones(usuario),
        input: entrada,
        tools: herramientas,
        store: false,
        ...(conRazonamiento ? { reasoning: { effort: env.openaiReasoningEffort }, include: ['reasoning.encrypted_content'] } : {}),
      });
    } catch (error) {
      console.error('[chat] error de OpenAI:', error?.status, error?.message);
      throw traducirErrorOpenAI(error);
    }

    const salida = r.output || [];
    entrada.push(...limpiarItems(salida, { mantenerRazonamiento: true }));
    const llamadas = salida.filter((i) => i.type === 'function_call');

    if (llamadas.length === 0) {
      respuesta = (r.output_text || salida.filter((i) => i.type === 'message').map(textoDeMensaje).join('\n')).trim();
      break;
    }

    for (const llamada of llamadas) {
      const resultado = await ejecutarHerramienta(ctx, llamada.name, llamada.arguments);
      entrada.push({ type: 'function_call_output', call_id: llamada.call_id, output: JSON.stringify(resultado) });
    }
  }

  if (!respuesta) {
    respuesta = ctx.modifico
      ? 'He hecho los cambios, pero no he podido terminar la respuesta. Revísalo en pantalla y dime si necesitas algo más.'
      : 'No he podido completar esta petición. ¿Puedes plantearla de otra forma?';
    entrada.push({ role: 'assistant', content: respuesta });
  }

  conversacion.items = recortarHistorial(entrada);
  conversacion.markModified('items');
  await conversacion.save();

  return { respuesta, acciones: ctx.acciones, extras: ctx.extras, modifico: ctx.modifico };
}

// Mensajes para mostrar en pantalla (solo lo que escribieron el usuario y el asistente).
export async function mensajesDeConversacion(usuario) {
  const conversacion = await Conversacion.findOne({ usuario: usuario._id }).lean();
  return (conversacion?.items || [])
    .filter((i) => (i.role === 'user' || i.role === 'assistant') && typeof i.content === 'string')
    .map((i) => ({ rol: i.role === 'user' ? 'usuario' : 'asistente', texto: i.content }));
}

export async function limpiarConversacion(usuario) {
  await Conversacion.deleteOne({ usuario: usuario._id });
}

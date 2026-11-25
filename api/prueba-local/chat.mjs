// Pruebas del asistente con una OpenAI SIMULADA (no gasta créditos).
import { conectarBd, desconectarBd } from '../src/config/db.js';
import { Usuario } from '../src/models/Usuario.js';
import { Proyecto } from '../src/models/Proyecto.js';
import { Tarea } from '../src/models/Tarea.js';
import { Conversacion } from '../src/models/Conversacion.js';
import { definirClienteOpenAI, responder, mensajesDeConversacion } from '../src/chat/asistente.js';
import { definicionesPara, ejecutarHerramienta } from '../src/chat/herramientas.js';

let ok = 0, fallos = 0;
const chk = (n, c, x = '') => { if (c) ok++; else { fallos++; console.log('FALLO:', n, x); } };

// Cola de respuestas simuladas de "OpenAI"
const cola = []; const llamadas = [];
const msg = (t) => ({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] }], output_text: t });
const fn = (name, args, conRazonamiento = false) => ({ output: [
  ...(conRazonamiento ? [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'xyz', summary: [] }] : []),
  { type: 'function_call', id: 'fc_' + name, call_id: 'call_' + Math.random().toString(36).slice(2), name, arguments: JSON.stringify(args) }] });
definirClienteOpenAI({ responses: { create: async (p) => { llamadas.push(structuredClone(p)); if (!cola.length) throw new Error('cola vacía'); return cola.shift(); } } });
const ultimaSalida = (i = -1) => { const p = llamadas.at(i); return p.input.filter(x => x.type === 'function_call_output').map(x => JSON.parse(x.output)).at(-1); };

await conectarBd();
const admin = await Usuario.findOne({ email: 'admin@taskly.local' });
const ana = await Usuario.findOne({ email: 'ana@taskly.local' });
await Conversacion.deleteMany({});

// 1) Definiciones por perfil
const defAdm = definicionesPara(admin).map(d => d.name), defAna = definicionesPara(ana).map(d => d.name);
chk('admin tiene 27 funciones', defAdm.length === 27, defAdm.length);
chk('equipo sin funciones de admin', !defAna.some(n => /crear|editar|eliminar|integrante|usuarios|modificar/.test(n)), defAna);
chk('equipo tiene 12', defAna.length === 12, defAna);

// 2) Conversación de creación de proyecto en dos mensajes
cola.push(msg('¡Claro! ¿Cuál es el nombre del proyecto y para qué cliente?'));
let r = await responder(admin, 'quiero crear un proyecto nuevo');
chk('pregunta', r.respuesta.startsWith('¡Claro') && !r.modifico);
chk('las instrucciones contienen fecha y perfil', llamadas[0].instructions.includes('ADMINISTRADOR') && /\d{4}-\d{2}-\d{2}/.test(llamadas[0].instructions));
chk('envía tools y store false', llamadas[0].tools.length === 27 && llamadas[0].store === false);

cola.push(fn('crear_proyecto', { nombre: 'Web corporativa', cliente: 'Panadería Sol', plazo: '2026-12-20', integrantes: [{ persona: 'Ana', funcion: 'Front-end' }, { persona: 'joao@taskly.local', funcion: 'Back-end' }] }, true));
cola.push(msg('✅ Proyecto Web corporativa creado.'));
r = await responder(admin, 'Web corporativa, cliente Panadería Sol, Ana en el front y João en el back, plazo 20/12');
const nuevo = await Proyecto.findOne({ nombre: 'Web corporativa' }).populate('integrantes.usuario', 'nombre');
chk('proyecto creado', nuevo && nuevo.cliente === 'Panadería Sol' && nuevo.integrantes.length === 2, JSON.stringify(nuevo));
chk('plazo correcto', nuevo && nuevo.plazo.toISOString().startsWith('2026-12-20'), nuevo?.plazo);
chk('modificó true', r.modifico === true && r.acciones[0].herramienta === 'crear_proyecto');
chk('historial enviado en la 2.ª ronda', llamadas.at(-2).input.filter(i => i.role === 'user').length === 2);
chk('razonamiento mantenido dentro de la misma respuesta', llamadas.at(-1).input.some(i => i.type === 'reasoning'));
chk('function_call sin id', llamadas.at(-1).input.filter(i => i.type === 'function_call').every(i => !i.id));
const guardada = await Conversacion.findOne({ usuario: admin._id }).lean();
chk('razonamiento NO guardado', !guardada.items.some(i => i.type === 'reasoning'));
const msgs = await mensajesDeConversacion(admin);
chk('mensajes para la pantalla', msgs.length === 4 && msgs[0].rol === 'usuario' && msgs[3].rol === 'asistente', JSON.stringify(msgs));

// 3) Crear tarea para alguien fuera del proyecto -> error tratado
cola.push(fn('crear_tarea', { proyecto: 'Web corporativa', titulo: 'Home', responsable: 'Carla Mendes' }));
cola.push(msg('Carla no participa en ese proyecto.'));
r = await responder(admin, 'crea la tarea Home para Carla en la web');
chk('error responsable fuera', ultimaSalida().error?.includes('integrante del proyecto'), JSON.stringify(ultimaSalida()));
chk('no modificó', r.modifico === false);

cola.push(fn('crear_tarea', { proyecto: 'web corporativa', titulo: 'Home', responsable: 'Ana', prioridad: 'alta', plazo: '2026-12-01', horasEstimadas: 6 }));
cola.push(msg('Tarea creada.'));
r = await responder(admin, 'entonces para Ana, alta, el día 1/12, 6 horas');
const home = await Tarea.findOne({ titulo: 'Home' });
chk('tarea creada', home && String(home.responsable) === String(ana._id) && home.prioridad === 'alta' && home.horasEstimadas === 6);

// 4) Equipo: estado y horas en la propia tarea; rechazo en la ajena y en funciones de admin
await Conversacion.deleteMany({});
cola.push(fn('cambiar_status_tarea', { tarea: 'Home', status: 'en_curso' }));
cola.push(fn('registrar_horas', { tarea: 'Home', horas: 2.5, nota: 'layout' }));
cola.push(msg('¡Hecho!'));
r = await responder(ana, 'empecé la Home y trabajé 2,5h');
const home2 = await Tarea.findById(home._id);
chk('ana estado', home2.status === 'en_curso');
chk('ana horas', home2.horasGastadas === 2.5);
chk('equipo recibió 7 tools', llamadas.at(-1).tools.length === 12 && llamadas.at(-1).instructions.includes('EQUIPO'));

const portal = await Proyecto.findOne({ nombre: 'Portal del Alumno' });
const ajena = await Tarea.findOne({ proyecto: portal._id, responsable: { $ne: ana._id }, status: { $ne: 'completada' } });
const ctxAna = { usuario: ana, ultimoMensaje: 'x', modifico: false, acciones: [], extras: [] };
let s = await ejecutarHerramienta(ctxAna, 'cambiar_status_tarea', JSON.stringify({ tarea: String(ajena._id), status: 'completada' }));
chk('ana tarea ajena rechazada', s.error?.includes('propias'), JSON.stringify(s));
s = await ejecutarHerramienta(ctxAna, 'crear_proyecto', JSON.stringify({ nombre: 'X' }));
chk('ana crear_proyecto rechazado', s.error?.includes('administradores'));
s = await ejecutarHerramienta(ctxAna, 'ver_proyecto', JSON.stringify({ proyecto: 'App de Inventario' }));
chk('ana no ve proyecto ajeno', Boolean(s.error), JSON.stringify(s));
s = await ejecutarHerramienta(ctxAna, 'ver_proyecto', JSON.stringify({ proyecto: 'portal' }));
chk('ana ve portal (búsqueda parcial)', s.nombre === 'Portal del Alumno' && s.porIntegrante.length === 4, JSON.stringify(s).slice(0,200));
s = await ejecutarHerramienta(ctxAna, 'mis_tareas', '{}');
chk('mis tareas', s.total >= 1 && s.tareas.every(t => t.status !== 'completada'));

// 5) Ambigüedad
const ctxAdm = () => ({ usuario: admin, ultimoMensaje: 'x', modifico: false, acciones: [], extras: [] });
s = await ejecutarHerramienta(ctxAdm(), 'ver_tarea', JSON.stringify({ tarea: 'Guion del módulo' }));
chk('la ambigüedad pide elegir', s.error?.includes('Más de una tarea'), JSON.stringify(s));
s = await ejecutarHerramienta(ctxAdm(), 'ver_tarea', JSON.stringify({ tarea: 'guion del modulo 3' }));
chk('acentos ignorados', s.titulo === 'Guion del módulo 3', JSON.stringify(s));
s = await ejecutarHerramienta(ctxAdm(), 'listar_tareas', JSON.stringify({ proyecto: 'Portal del Alumno', responsable: 'João', atrasadas: false }));
chk('listar por responsable', s.tareas.length > 0 && s.tareas.every(t => t.responsable === 'João Lima'), JSON.stringify(s).slice(0,300));

// 6) La eliminación exige confirmación
let c = ctxAdm(); c.ultimoMensaje = 'sí'; c.respuestaAnterior = '¡Todo correcto!';
s = await ejecutarHerramienta(c, 'eliminar_proyecto', JSON.stringify({ proyecto: 'Web corporativa', confirmado: true }));
chk('sin pregunta de confirmación antes no elimina', s.necesitaConfirmacion === true);
c = ctxAdm(); c.ultimoMensaje = 'elimina la web corporativa'; c.respuestaAnterior = '¿Confirmas la eliminación?';
s = await ejecutarHerramienta(c, 'eliminar_proyecto', JSON.stringify({ proyecto: 'Web corporativa', confirmado: true }));
chk('sin confirmación del usuario no elimina', s.necesitaConfirmacion === true && await Proyecto.exists({ nombre: 'Web corporativa' }));
c = ctxAdm(); c.ultimoMensaje = 'no, espera'; c.respuestaAnterior = '¿Confirmas la eliminación?';
s = await ejecutarHerramienta(c, 'eliminar_proyecto', JSON.stringify({ proyecto: 'Web corporativa', confirmado: true }));
chk('la negación no elimina', s.necesitaConfirmacion === true);
c = ctxAdm(); c.ultimoMensaje = 'sí, puedes eliminarlo'; c.respuestaAnterior = '¿Confirmas la eliminación del proyecto?';
s = await ejecutarHerramienta(c, 'eliminar_proyecto', JSON.stringify({ proyecto: 'Web corporativa', confirmado: false }));
chk('confirmado=false no elimina', s.necesitaConfirmacion === true);
s = await ejecutarHerramienta(c, 'eliminar_proyecto', JSON.stringify({ proyecto: 'Web corporativa', confirmado: true }));
chk('confirmado elimina', s.ok && !(await Proyecto.exists({ nombre: 'Web corporativa' })) && !(await Tarea.exists({ titulo: 'Home' })));

// 6b) Flujo completo de eliminación por el chat
await Conversacion.deleteMany({});
await ejecutarHerramienta(ctxAdm(), 'crear_proyecto', JSON.stringify({ nombre: 'Temp' }));
cola.push(fn('eliminar_proyecto', { proyecto: 'Temp', confirmado: true })); // IA "con prisa"
cola.push(msg('¿Confirmas la eliminación del proyecto "Temp"? Esta acción no se puede deshacer.'));
r = await responder(admin, 'borra el proyecto Temp');
chk('IA con prisa bloqueada', await Proyecto.exists({ nombre: 'Temp' }) && ultimaSalida().necesitaConfirmacion);
cola.push(fn('eliminar_proyecto', { proyecto: 'Temp', confirmado: true }));
cola.push(msg('Proyecto Temp eliminado.'));
r = await responder(admin, 'Sí');
chk('eliminación tras el sí', !(await Proyecto.exists({ nombre: 'Temp' })) && r.modifico);

// 7) Crear usuario: contraseña solo en pantalla
c = ctxAdm();
s = await ejecutarHerramienta(c, 'crear_usuario', JSON.stringify({ nombre: 'Bruno Reis', email: 'bruno@taskly.local', funcion: 'Datos' }));
chk('usuario creado', s.ok && c.extras[0]?.contrasena?.length === 10 && !JSON.stringify(s).includes(c.extras[0].contrasena));
const bruno = await Usuario.findOne({ email: 'bruno@taskly.local' }).select('+contrasena');
chk('la contraseña funciona', await bruno.comprobarContrasena(c.extras[0].contrasena));
s = await ejecutarHerramienta(ctxAdm(), 'crear_usuario', JSON.stringify({ nombre: 'Dup', email: 'bruno@taskly.local' }));
chk('email duplicado', /Ya existe/.test(s.error), JSON.stringify(s));
c = ctxAdm();
s = await ejecutarHerramienta(c, 'editar_usuario', JSON.stringify({ usuario: 'Bruno', activo: false, restablecerContrasena: true }));
chk('desactiva y restablece', s.ok && s.usuario.activo === false && c.extras.length === 1, JSON.stringify(s));
s = await ejecutarHerramienta(ctxAdm(), 'editar_usuario', JSON.stringify({ usuario: 'admin@taskly.local', rol: 'equipo' }));
chk('admin no se degrada', /propio acceso/.test(s.error));

// 8) Integrantes y edición
s = await ejecutarHerramienta(ctxAdm(), 'anadir_integrante', JSON.stringify({ proyecto: 'App de Inventario', persona: 'Carla', funcion: 'Docs' }));
chk('añadir integrante', s.ok && (await Proyecto.findOne({ nombre: 'App de Inventario' })).integrantes.length === 3);
s = await ejecutarHerramienta(ctxAdm(), 'quitar_integrante', JSON.stringify({ proyecto: 'App de Inventario', persona: 'Carla' }));
chk('quitar integrante', s.ok && (await Proyecto.findOne({ nombre: 'App de Inventario' })).integrantes.length === 2);
s = await ejecutarHerramienta(ctxAdm(), 'editar_proyecto', JSON.stringify({ proyecto: 'App de Inventario', status: 'en_curso', plazo: '2027-02-10' }));
chk('edita proyecto', s.ok && (await Proyecto.findOne({ nombre: 'App de Inventario' })).status === 'en_curso');
s = await ejecutarHerramienta(ctxAdm(), 'editar_tarea', JSON.stringify({ tarea: 'Plan de pruebas', prioridad: 'alta', responsable: 'sin', plazo: '' }));
chk('edita tarea', s.ok && s.tarea.prioridad === 'alta' && s.tarea.responsable === null && s.tarea.plazo === null, JSON.stringify(s));
s = await ejecutarHerramienta(ctxAdm(), 'editar_proyecto', JSON.stringify({ proyecto: 'App de Inventario', plazo: '31/12/2026' }));
chk('fecha no válida', /Fecha no válida/.test(s.error || ''), JSON.stringify(s));
s = await ejecutarHerramienta(ctxAdm(), 'funcion_x', '{}');
chk('función desconocida', /desconocida/.test(s.error));
s = await ejecutarHerramienta(ctxAdm(), 'listar_proyectos', '{bad json');
chk('json no válido', /JSON/.test(s.error));

// 9) Límite de pasos y errores de OpenAI
for (let i = 0; i < 8; i++) cola.push(fn('listar_proyectos', {}));
r = await responder(admin, 'loop');
chk('límite de pasos', /No he podido completar/.test(r.respuesta), r.respuesta);
cola.length = 0;
definirClienteOpenAI({ responses: { create: async () => { const e = new Error('bad key'); e.status = 401; throw e; } } });
try { await responder(admin, 'oi'); chk('error 401', false); } catch (e) { chk('error 401 traducido', e.status === 502 && /OPENAI_API_KEY/.test(e.message), e.message); }


// 10) Hitos, alcance y diario por el chat
definirClienteOpenAI({ responses: { create: async () => { throw new Error('no usado'); } } });
const ctxA = () => ({ usuario: admin, ultimoMensaje: 'x', respuestaAnterior: '', modifico: false, acciones: [], extras: [] });
s = await ejecutarHerramienta(ctxA(), 'crear_proyecto', JSON.stringify({ nombre: 'Plataforma Prueba', cliente: 'Cliente T', contactoClienteNombre: 'Ana Cliente', contactoClienteEmail: 'ana.cliente@example.com' }));
chk('crea proyecto con contacto del cliente', s.ok, s);
s = await ejecutarHerramienta(ctxA(), 'crear_hito', JSON.stringify({ proyecto: 'Plataforma Prueba', titulo: 'Recopilar información', inicio: '2026-11-01', entrega: '2026-11-04' }));
chk('crea hito', s.ok && s.hito.orden === 1 && s.hito.entrega === '2026-11-04', s);
s = await ejecutarHerramienta(ctxA(), 'crear_hito', JSON.stringify({ proyecto: 'Plataforma Prueba', titulo: 'Crear dominios', inicio: '2026-11-04', entrega: '2026-11-03' }));
chk('hito con fechas invertidas', /anterior a la fecha de inicio/.test(s.error || ''), s);
await ejecutarHerramienta(ctxA(), 'crear_hito', JSON.stringify({ proyecto: 'Plataforma Prueba', titulo: 'Crear dominios', inicio: '2026-11-03', entrega: '2026-11-04' }));
s = await ejecutarHerramienta(ctxA(), 'crear_tarea', JSON.stringify({ proyecto: 'Plataforma Prueba', titulo: 'Facilitar información', hito: 'recopilar', lado: 'cliente', responsableCliente: 'Ana Cliente' }));
chk('tarea del cliente en el hito', s.ok && s.tarea.lado === 'cliente' && s.tarea.hito === 'Recopilar información' && s.tarea.responsable === 'Ana Cliente', s);
s = await ejecutarHerramienta(ctxA(), 'crear_tarea', JSON.stringify({ proyecto: 'Plataforma Prueba', titulo: 'X', hito: 'inexistente' }));
chk('hito inexistente lista opciones', /Hitos existentes/.test(s.error || ''), s);
s = await ejecutarHerramienta(ctxA(), 'editar_tarea', JSON.stringify({ tarea: 'Facilitar información', hito: 'Crear dominios' }));
chk('mueve tarea de hito', s.ok && s.tarea.hito === 'Crear dominios', s);
s = await ejecutarHerramienta(ctxA(), 'ver_hitos', JSON.stringify({ proyecto: 'Plataforma Prueba' }));
chk('vista lineal', s.hitos.length === 2 && s.hitos[1].tareas[0].titulo === 'Facilitar información', s);
s = await ejecutarHerramienta(ctxA(), 'modificar_alcance', JSON.stringify({ proyecto: 'Plataforma Prueba', anadirIncluidos: ['Informes de alumnos', 'Dashboard SEPE'], anadirNoIncluidos: ['Compra del dominio'] }));
chk('alcance en borrador', s.ok && s.version === 1 && s.incluidos.length === 2 && s.noIncluidos.length === 1, s);
s = await ejecutarHerramienta(ctxA(), 'modificar_alcance', JSON.stringify({ proyecto: 'Plataforma Prueba', quitar: ['dashboard sepe'] }));
chk('quita elemento del alcance', s.incluidos.length === 1 && s.version === 1, s);
s = await ejecutarHerramienta(ctxA(), 'ver_alcance', JSON.stringify({ proyecto: 'Plataforma Prueba' }));
chk('ver alcance', s.enCurso.status === 'borrador' && !s.vigente && s.responsableCliente.email === 'ana.cliente@example.com', s);
const ctxE = { usuario: ana, ultimoMensaje: 'x', modifico: false, acciones: [], extras: [] };
s = await ejecutarHerramienta(ctxE, 'modificar_alcance', JSON.stringify({ proyecto: 'Portal del Alumno', anadirIncluidos: ['x'] }));
chk('equipo no modifica alcance', /administradores/.test(s.error), s);
s = await ejecutarHerramienta(ctxE, 'registrar_diario', JSON.stringify({ proyecto: 'Portal del Alumno', texto: 'He terminado el diseño de la home. Obs.: falta el icono del menú.', hito: 'Ejecución' }));
chk('equipo registra en el diario', s.ok, s);
s = await ejecutarHerramienta(ctxE, 'ver_diario', JSON.stringify({ proyecto: 'Portal del Alumno', dias: 3 }));
chk('ver diario', s.dias[0].registros.some((r) => r.texto.startsWith('He terminado el diseño')), s);
s = await ejecutarHerramienta(ctxA(), 'eliminar_hito', JSON.stringify({ proyecto: 'Plataforma Prueba', hito: 'Crear dominios', confirmado: true }));
chk('eliminar hito pide confirmación', s.necesitaConfirmacion === true);
let cm = ctxA(); cm.ultimoMensaje = 'sí'; cm.respuestaAnterior = '¿Confirmas la eliminación del hito?';
s = await ejecutarHerramienta(cm, 'eliminar_hito', JSON.stringify({ proyecto: 'Plataforma Prueba', hito: 'Crear dominios', confirmado: true }));
chk('elimina hito', s.ok && s.tareasSinHito === 1, s);
s = await ejecutarHerramienta(ctxA(), 'ver_proyecto', JSON.stringify({ proyecto: 'Plataforma Prueba' }));
chk('ver_proyecto trae hitos y contacto', s.hitos.length === 1 && s.responsableCliente?.nombre === 'Ana Cliente', s);

console.log(`\n${ok} verificaciones OK, ${fallos} fallos`);
await desconectarBd();

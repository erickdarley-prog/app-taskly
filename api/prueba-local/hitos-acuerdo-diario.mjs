// Pruebas de hitos, alcance/acuerdo (firmas) y diario. Ejecútalas con la API en marcha y después de "npm run seed".
const B = 'http://localhost:4000/api';
let ok = 0, fallos = 0;
const chk = (n, c, x = '') => { if (c) ok++; else { fallos++; console.log('FALLO:', n, typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)); } };
async function req(m, u, t, b) {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const login = async (e, s) => (await req('POST', '/auth/login', null, { email: e, contrasena: s })).j.token;
const adm = await login('admin@taskly.local', 'admin123');
const ana = await login('ana@taskly.local', '123456');
const joao = await login('joao@taskly.local', '123456');
const pedro = await login('pedro@taskly.local', '123456');

const ahk = (await req('GET', '/proyectos?busqueda=AHK', adm)).j.items[0];
chk('AHK existe', ahk?.nombre === 'Plataforma AHK');
const det = (await req('GET', '/proyectos/' + ahk._id, adm)).j;
chk('responsable del cliente', det.responsableCliente?.email === 'laura.mendez@example.com');

// ---------- Hitos / vista lineal ----------
let r = await req('GET', `/proyectos/${ahk._id}/hitos?conTareas=true`, ana);
chk('equipo ve hitos', r.s === 200 && r.j.hitos.length === 7, r.j);
const [m1, , , m4, m5] = r.j.hitos;
chk('orden de los hitos', m1.titulo === 'Recopilar información' && m5.titulo === 'Informes y dashboard SEPE');
chk('hito 1 completado', m1.status === 'completado' && m1.porcentaje === 100 && !m1.atrasado, m1);
chk('hito 4 atrasado en curso', m4.status === 'en_curso' && m4.atrasado === true, m4);
chk('tareas por lado', m1.delCliente === 2 && m1.deAwakelab === 2 && m1.tareas.length === 4);
chk('la tarea del cliente tiene nombre externo', m1.tareas.find((t) => t.lado === 'cliente')?.responsableExterno === 'Laura Méndez');
r = await req('POST', `/proyectos/${ahk._id}/hitos`, ana, { titulo: 'X' });
chk('equipo no crea hito', r.s === 403);
r = await req('POST', `/proyectos/${ahk._id}/hitos`, adm, { titulo: 'Soporte posventa', fechaInicio: '2026-12-10', fechaFin: '2026-12-01' });
chk('fechas invertidas rechazadas', r.s === 400);
r = await req('POST', `/proyectos/${ahk._id}/hitos`, adm, { titulo: 'Soporte posventa', fechaInicio: '2026-12-10', fechaFin: '2026-12-20' });
chk('crea hito', r.s === 201 && r.j.orden === 8, r.j);
const nuevoHito = r.j._id;
r = await req('PATCH', '/hitos/' + nuevoHito, adm, { titulo: 'Soporte (30 días)', fechaFin: null });
chk('edita hito', r.s === 200 && r.j.titulo === 'Soporte (30 días)' && !r.j.fechaFin, r.j);

// tarea del cliente en el hito
r = await req('POST', `/proyectos/${ahk._id}/tareas`, adm, { titulo: 'Aprobar plan de soporte', hito: nuevoHito, lado: 'cliente', responsableExterno: 'Laura Méndez' });
chk('crea tarea del cliente', r.s === 201 && r.j.lado === 'cliente' && !r.j.responsable && r.j.hito?.titulo === 'Soporte (30 días)', r.j);
const tCli = r.j._id;
const anaId = (await req('GET', '/auth/me', ana)).j.usuario._id;
r = await req('POST', `/proyectos/${ahk._id}/tareas`, adm, { titulo: 'Y', lado: 'cliente', responsable: anaId });
chk('la tarea del cliente no acepta usuario', r.s === 400);
r = await req('PATCH', `/tareas/${tCli}/status`, ana, { status: 'completada' });
chk('equipo no cambia tarea del cliente', r.s === 403);
r = await req('PATCH', `/tareas/${tCli}/status`, adm, { status: 'en_curso' });
chk('admin cambia tarea del cliente', r.s === 200);
r = await req('PATCH', `/tareas/${tCli}`, adm, { lado: 'awakelab', responsable: anaId });
chk('cambia a awakelab', r.s === 200 && r.j.lado === 'awakelab' && r.j.responsable?._id === anaId && r.j.responsableExterno === '', r.j);
r = await req('PATCH', `/tareas/${tCli}`, adm, { lado: 'cliente' });
chk('volver a cliente limpia el usuario', r.s === 200 && !r.j.responsable, r.j);
const otro = (await req('GET', '/proyectos?busqueda=Portal', adm)).j.items[0];
const hitoOtro = (await req('GET', `/proyectos/${otro._id}/hitos`, adm)).j.hitos[0]._id;
r = await req('PATCH', `/tareas/${tCli}`, adm, { hito: hitoOtro });
chk('hito de otro proyecto rechazado', r.s === 400);
r = await req('GET', `/proyectos/${ahk._id}/tareas?lado=cliente&hito=${nuevoHito}`, adm);
chk('filtro lado+hito', r.j.total === 1);
r = await req('DELETE', '/hitos/' + nuevoHito, adm);
chk('elimina hito manteniendo la tarea', r.s === 200 && r.j.tareasSinHito === 1);
r = await req('GET', `/proyectos/${ahk._id}/hitos?conTareas=true`, adm);
chk('la tarea quedó sin hito', r.j.sinHito?.total === 1 && r.j.sinHito.tareas[0].titulo === 'Aprobar plan de soporte');

// ---------- Alcance / acuerdo ----------
r = await req('GET', `/proyectos/${ahk._id}/acuerdos`, ana);
chk('equipo ve acuerdo', r.s === 200 && r.j.vigente?.version === 1 && r.j.vigente.status === 'firmado', r.j);
chk('v1 firmado por las dos partes', r.j.vigente.firmaCliente?.fecha && r.j.vigente.firmaEmpresa?.fecha);
chk('la lista no trae html', r.j.versiones[0].emails.every((e) => !e.html) && r.j.versiones[0].emails.length === 2);
r = await req('GET', `/acuerdos/${r.j.vigente._id}/comprobante`, ana);
chk('comprobante con e-mails', r.s === 200 && r.j.emails[0].html.includes('Acepto') && !r.j.emails[0].html.includes('/acuerdo/'), r.j.emails?.[0]?.html?.slice(0, 80));
chk('confirmación enviada al cliente y al remitente', r.j.emails[1].tipo === 'confirmacion' && r.j.emails[1].para.length === 2);

r = await req('POST', `/proyectos/${ahk._id}/acuerdos/borrador`, ana);
chk('equipo no edita alcance', r.s === 403);
r = await req('POST', `/proyectos/${ahk._id}/acuerdos/borrador`, adm);
chk('abre borrador v2 copiando v1', r.s === 200 && r.j.version === 2 && r.j.status === 'borrador' && r.j.incluidos.length === 6, r.j);
const v2 = r.j._id;
r = await req('POST', `/proyectos/${ahk._id}/acuerdos/borrador`, adm);
chk('reabre el mismo borrador', r.j._id === v2);
r = await req('PATCH', '/acuerdos/' + v2, adm, { incluidos: [...r.j.incluidos.map((i) => i.texto), 'Integración con videoconferencia'], noIncluidos: ['Compra del dominio', '  ', 'Gestión del certificado SEPE'] });
chk('edita listas', r.s === 200 && r.j.incluidos.length === 7 && r.j.noIncluidos.length === 2, r.j);
r = await req('POST', `/acuerdos/${v2}/firmar`, adm);
chk('no firma borrador', r.s === 409);
r = await req('POST', `/acuerdos/${v2}/enviar`, adm);
chk('envía (modo prueba)', r.s === 200 && r.j.modoEmail === 'prueba' && r.j.linkPrueba?.includes('/acuerdo/') && r.j.acuerdo.status === 'esperando', r.j);
const token = r.j.linkPrueba.split('/').pop();
r = await req('PATCH', '/acuerdos/' + v2, adm, { incluidos: ['x'] });
chk('no edita tras el envío', r.s === 409);
r = await req('POST', `/proyectos/${ahk._id}/acuerdos/borrador`, adm);
chk('no abre otro borrador con envío pendiente', r.s === 409);
r = await req('POST', `/acuerdos/${v2}/firmar`, joao);
chk('solo el responsable firma por la empresa', r.s === 403);

// Página pública del cliente
r = await req('GET', '/publico/acuerdos/' + token);
chk('el cliente ve el acuerdo sin login', r.s === 200 && r.j.version === 2 && r.j.incluidos.includes('Integración con videoconferencia') && r.j.destinatario === 'Laura Méndez', r.j);
r = await req('GET', '/publico/acuerdos/tokeninvalido1234567890');
chk('token no válido', r.s === 404);
r = await req('POST', `/publico/acuerdos/${token}/aceptar`);
chk('el cliente acepta', r.s === 200 && r.j.firmadoPorCliente && !r.j.firmadoPorEmpresa && r.j.status === 'esperando', r.j);
r = await req('POST', `/publico/acuerdos/${token}/aceptar`);
chk('clic repetido no duplica', r.s === 200);
r = await req('POST', `/acuerdos/${v2}/firmar`, adm);
chk('la empresa firma y completa', r.s === 200 && r.j.status === 'firmado', r.j);
r = await req('POST', `/acuerdos/${v2}/firmar`, adm);
chk('no firma dos veces', r.s === 409);
r = await req('GET', `/proyectos/${ahk._id}/acuerdos`, adm);
chk('v2 vigente y v1 sustituida', r.j.vigente.version === 2 && r.j.versiones.find((v) => v.version === 1).status === 'sustituido', r.j.versiones.map((v) => [v.version, v.status]));
r = await req('GET', '/publico/acuerdos/' + token);
chk('el enlace muestra firmado', r.j.status === 'firmado');

// v3 cancelada y reutilizada
let v3 = (await req('POST', `/proyectos/${ahk._id}/acuerdos/borrador`, adm)).j;
await req('PATCH', '/acuerdos/' + v3._id, adm, { noIncluidos: [...v3.noIncluidos.map((i) => i.texto), 'Aplicación móvil'] });
const env3 = (await req('POST', `/acuerdos/${v3._id}/enviar`, adm)).j;
r = await req('POST', `/acuerdos/${v3._id}/cancelar`, adm);
chk('cancela envío', r.j.status === 'cancelado');
r = await req('POST', `/publico/acuerdos/${env3.linkPrueba.split('/').pop()}/aceptar`);
chk('enlace cancelado no acepta', r.s === 409);
const v4 = (await req('POST', `/proyectos/${ahk._id}/acuerdos/borrador`, adm)).j;
chk('v4 parte de la v3 cancelada', v4.version === 4 && v4.noIncluidos.some((i) => i.texto === 'Aplicación móvil'));

// sin e-mail del cliente
const sinContacto = (await req('POST', '/proyectos', adm, { nombre: 'Sin contacto' })).j;
const rs = (await req('POST', `/proyectos/${sinContacto._id}/acuerdos/borrador`, adm)).j;
await req('PATCH', '/acuerdos/' + rs._id, adm, { incluidos: ['Algo'] });
r = await req('POST', `/acuerdos/${rs._id}/enviar`, adm);
chk('exige e-mail del cliente', r.s === 400 && /e-mail del responsable del cliente/.test(r.j.error), r.j);
r = await req('PATCH', '/proyectos/' + sinContacto._id, adm, { responsableCliente: { nombre: 'Z', email: 'invalido' } });
chk('e-mail del cliente no válido', r.s === 400);

// ---------- Configuración de e-mail ----------
r = await req('GET', '/auth/me/email', adm);
chk('config vacía', r.s === 200 && r.j.configurado === false);
r = await req('PUT', '/auth/me/email', adm, { host: 'smtp.exemplo.com', usuario: 'admin@exemplo.com' });
chk('exige contraseña', r.s === 400);
r = await req('PUT', '/auth/me/email', adm, { host: 'smtp.exemplo.com', puerto: 587, usuario: 'admin@exemplo.com', contrasena: 'segredo-app', nombreRemitente: 'Admin' });
chk('guarda config sin devolver la contraseña', r.s === 200 && r.j.configurado && !JSON.stringify(r.j).includes('segredo'), r.j);
r = await req('GET', '/auth/me', adm);
chk('/me no filtra la contraseña cifrada', !JSON.stringify(r.j).includes('contrasenaCifrada') && r.j.usuario.emailEnvio.configurado === true, r.j);
r = await req('POST', '/auth/me/email/prueba', adm);
chk('un fallo de SMTP se convierte en mensaje claro', r.s === 502 && /Mi cuenta/.test(r.j.error), r.j);
r = await req('PUT', '/auth/me/email', adm, { quitar: true });
chk('quita config', r.j.configurado === false);

// ---------- Diario ----------
r = await req('GET', `/proyectos/${ahk._id}/diario?dias=30`, ana);
chk('diario por día', r.s === 200 && r.j.dias.length >= 8, r.j.dias?.length);
const todos = r.j.dias.flatMap((d) => d.items);
chk('tiene manual, sistema y tarea', ['manual', 'sistema', 'tarea'].every((t) => todos.some((i) => i.tipo === t)), [...new Set(todos.map((i) => i.tipo))]);
chk('días en orden decreciente', r.j.dias.every((d, i, a) => i === 0 || a[i - 1].dia > d.dia));
const kickoff = todos.find((i) => i.texto.startsWith('Reunión de kickoff'));
chk('kickoff con hito y autor', kickoff?.hito === 'Recopilar información' && kickoff.autor === 'Admin Taskly' && kickoff.categoria === 'reunion', kickoff);
r = await req('POST', `/proyectos/${ahk._id}/diario`, ana, { texto: 'Diseño del dashboard iniciado. Obs.: faltan los campos exigidos por el SEPE.', hito: m5._id, categoria: 'avance' });
chk('equipo registra en el diario', r.s === 201);
const mi = r.j._id;
r = await req('POST', `/proyectos/${ahk._id}/diario`, ana, { texto: '   ' });
chk('texto obligatorio', r.s === 400);
r = await req('POST', `/proyectos/${ahk._id}/diario`, ana, { texto: 'x', categoria: 'festa' });
chk('categoría no válida', r.s === 400);
r = await req('POST', `/proyectos/${ahk._id}/diario`, ana, { texto: 'Registro retroactivo', fecha: '2026-11-10' });
chk('fecha retroactiva', r.s === 201);
r = await req('PATCH', '/diario/' + mi, joao, { texto: 'hack' });
chk('no edita registro de otro', r.s === 403);
r = await req('PATCH', '/diario/' + mi, ana, { texto: 'Diseño del dashboard iniciado (editado).' });
chk('edita el propio', r.s === 200);
r = await req('PATCH', '/diario/' + mi, adm, { categoria: 'problema' });
chk('admin edita cualquiera', r.s === 200 && r.j.categoria === 'problema');
const sistema = todos.find((i) => i.tipo === 'sistema');
r = await req('DELETE', '/diario/' + sistema.id, adm);
chk('el registro automático está protegido', r.s === 400);
r = await req('GET', `/proyectos/${ahk._id}/diario?dias=7&automaticos=false`, ana);
chk('filtro sin automáticos', r.j.dias.flatMap((d) => d.items).every((i) => i.tipo === 'manual'));
r = await req('GET', `/proyectos/${ahk._id}/diario`, pedro);
chk('pedro (integrante) ve diario', r.s === 200);
const carla = await login('carla@taskly.local', '123456');
const inventario = (await req('GET', '/proyectos?busqueda=Invent', adm)).j.items[0];
r = await req('GET', `/proyectos/${inventario._id}/diario`, carla);
chk('un no participante no ve el diario', r.s === 403);
r = await req('DELETE', '/diario/' + mi, ana);
chk('elimina el propio', r.s === 200);

// ---------- Eliminar el proyecto lo borra todo ----------
r = await req('DELETE', '/proyectos/' + sinContacto._id, adm);
chk('elimina proyecto', r.s === 204);
r = await req('GET', `/acuerdos/${rs._id}/comprobante`, adm);
chk('acuerdos borrados junto', r.s === 404);

console.log(`\n${ok} verificaciones OK, ${fallos} fallos`);

// Pruebas del área de Adjuntos. Ejecútalas con la API en marcha y después de "npm run seed".
const BASE = process.env.API || 'http://localhost:4000';
const B = BASE + '/api';
let ok = 0, fallos = 0;
const chk = (n, c, x = '') => { if (c) ok++; else { fallos++; console.log('FALLO:', n, typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)); } };
async function req(m, u, t, b) {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
async function enviar(t, idProyecto, archivos, descripcion) {
  const fd = new FormData();
  for (const [nombre, contenido, tipo] of archivos) fd.append('archivos', new Blob([contenido], { type: tipo || 'application/octet-stream' }), nombre);
  if (descripcion) fd.append('descripcion', descripcion);
  const r = await fetch(`${B}/proyectos/${idProyecto}/adjuntos`, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const login = async (e, s) => (await req('POST', '/auth/login', null, { email: e, contrasena: s })).j.token;
const adm = await login('admin@taskly.local', 'admin123');
const ana = await login('ana@taskly.local', '123456');
const joao = await login('joao@taskly.local', '123456');
const ahk = (await req('GET', '/proyectos?busqueda=AHK', adm)).j.items[0];
const inventario = (await req('GET', '/proyectos?busqueda=Invent', adm)).j.items[0];

let r = await req('GET', `/proyectos/${ahk._id}/adjuntos`, ana);
chk('lista del seed', r.s === 200 && r.j.total === 6 && r.j.porTipo.documento === 4 && r.j.porTipo.imagen === 1 && r.j.porTipo.archivo === 1, r.j?.porTipo);
const porNombre = Object.fromEntries(r.j.items.map((a) => [a.nombre, a]));
chk('visualizadores', porNombre['acta-kickoff-AHK.pdf'].visualizador === 'pdf' && porNombre['especificacion-dashboard-SEPE.docx'].visualizador === 'docx'
  && porNombre['checklist-implantacion.md'].visualizador === 'markdown' && porNombre['notas-reunion-laura.txt'].visualizador === 'texto'
  && porNombre['propuesta-grafica-v1.png'].visualizador === 'imagen' && porNombre['plantilla-alumnos.csv'].visualizador === null);
chk('no expone el nombre en disco', r.j.items.every((a) => !('archivo' in a)));
r = await req('GET', `/proyectos/${ahk._id}/adjuntos?tipo=documento&busqueda=reunion`, ana);
chk('filtro tipo + búsqueda', r.j.items.length === 1 && r.j.items[0].nombre === 'notas-reunion-laura.txt');

// Subida
const video = Buffer.alloc(300 * 1024, 7);
r = await enviar(ana, ahk._id, [['Presentación del tema.mp4', video, 'video/mp4'], ['diagrama.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml'], ['backup.zip', 'PK', 'application/zip']], 'Material de la reunión');
chk('el equipo sube 3 archivos', r.s === 201 && r.j.length === 3, r.j);
const [mp4, svg, zip] = r.j;
chk('nombre con tilde conservado', mp4.nombre === 'Presentación del tema.mp4', mp4.nombre);
chk('tipos clasificados', mp4.tipo === 'video' && svg.tipo === 'imagen' && zip.tipo === 'archivo' && zip.visualizador === null);
chk('descripción', mp4.descripcion === 'Material de la reunión');
r = await enviar(await login('carla@taskly.local', '123456'), inventario._id, [['x.txt', 'x']]);
chk('un no participante no sube', r.s === 403);
r = await enviar(ana, ahk._id, []);
chk('subida vacía', r.s === 400);
r = await fetch(`${B}/proyectos/${ahk._id}/adjuntos`, { method: 'POST', body: new FormData() });
chk('sin login', r.status === 401);
const muchos = Array.from({ length: 11 }, (_, i) => [`a${i}.txt`, 'x']);
r = await enviar(ana, ahk._id, muchos);
chk('límite de 10 por vez', r.s === 400 && /10 archivos/.test(r.j.error), r.j);

// Ver / descargar
r = await req('GET', `/adjuntos/${mp4._id}/link`, joao);
chk('enlace para participante', r.s === 200 && r.j.ver.startsWith('/archivos/') && r.j.visualizador === 'video');
const link = r.j;
let f = await fetch(B + link.ver);
chk('vídeo inline', f.status === 200 && f.headers.get('content-type') === 'video/mp4' && f.headers.get('content-disposition').startsWith('inline'), [f.status, f.headers.get('content-type')]);
chk('filename utf-8', f.headers.get('content-disposition').includes("filename*=UTF-8''Presentaci%C3%B3n"));
f = await fetch(B + link.ver, { headers: { Range: 'bytes=1000-1999' } });
chk('vídeo con Range (206)', f.status === 206 && (await f.arrayBuffer()).byteLength === 1000);
f = await fetch(B + link.descargar);
chk('descargar = attachment', f.headers.get('content-disposition').startsWith('attachment') && f.headers.get('content-type') === 'application/octet-stream');
f = await fetch(B + link.ver.replace(/t=[^&]+/, 't=invalido'));
chk('token no válido', f.status === 401);
const otro = (await req('GET', `/adjuntos/${zip._id}/link`, ana)).j;
f = await fetch(B + `/archivos/${mp4._id}?` + otro.ver.split('?')[1]);
chk('el token de otro adjunto no sirve', f.status === 401);
f = await fetch(B + otro.ver);
chk('archivo sin visualizador siempre se descarga', f.headers.get('content-disposition').startsWith('attachment'));
const svgLink = (await req('GET', `/adjuntos/${svg._id}/link`, ana)).j;
f = await fetch(B + svgLink.ver);
chk('svg aislado (CSP sandbox)', /sandbox/.test(f.headers.get('content-security-policy') || '') && f.headers.get('x-content-type-options') === 'nosniff');
const md = (await req('GET', `/adjuntos/${porNombre['checklist-implantacion.md']._id}/link`, ana)).j;
f = await fetch(B + md.ver);
chk('markdown servido como texto', f.headers.get('content-type').startsWith('text/plain') && (await f.text()).startsWith('# Checklist'));
const carla = await login('carla@taskly.local', '123456');
r = await req('GET', `/adjuntos/${mp4._id}/link`, carla);
chk('carla participa en AHK y puede ver', r.s === 200);
const pedro = await login('pedro@taskly.local', '123456');
const invAdjunto = await enviar(adm, inventario._id, [['interno.pdf', '%PDF-1.4', 'application/pdf']]);
r = await req('GET', `/adjuntos/${invAdjunto.j[0]._id}/link`, ana);
chk('un no participante no ve el enlace', r.s === 403);

// Eliminar
r = await req('DELETE', `/adjuntos/${mp4._id}`, joao);
chk('no elimina el adjunto de otro', r.s === 403);
r = await req('DELETE', `/adjuntos/${mp4._id}`, ana);
chk('elimina el propio', r.s === 200);
f = await fetch(B + link.ver);
chk('el archivo desaparece después de eliminarlo', f.status === 404);
r = await req('DELETE', `/adjuntos/${zip._id}`, adm);
chk('admin elimina cualquiera', r.s === 200);

// El diario registra la subida
r = await req('GET', `/proyectos/${ahk._id}/diario?dias=1`, ana);
chk('el diario registra la subida', r.j.dias[0].items.some((i) => /subió 3 adjuntos/.test(i.texto)));

// Eliminar el proyecto borra los adjuntos
r = await req('DELETE', `/proyectos/${inventario._id}`, adm);
r = await req('GET', `/adjuntos/${invAdjunto.j[0]._id}/link`, adm);
chk('adjuntos borrados con el proyecto', r.s === 404);

console.log(`\n${ok} verificaciones OK, ${fallos} fallos`);

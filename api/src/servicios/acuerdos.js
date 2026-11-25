// Alcance del proyecto (lo que entra / lo que no entra) y el acuerdo firmado por las dos partes.
import crypto from 'node:crypto';
import { Acuerdo } from '../models/Acuerdo.js';
import { Proyecto } from '../models/Proyecto.js';
import { Usuario } from '../models/Usuario.js';
import { env } from '../config/env.js';
import { ErrorHttp, exigirId } from '../utils/http.js';
import { cargarProyecto } from '../utils/acceso.js';
import { exigirAdmin, ganchosEliminacionProyecto } from './proyectos.js';
import { enviarEmail, escaparHtml } from './email.js';
import { registrarEventoSistema } from './diario.js';

ganchosEliminacionProyecto.push((idProyecto) => Acuerdo.deleteMany({ proyecto: idProyecto }));

const VALIDEZ_LINK_DIAS = 30;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function formatearFechaHora(d) {
  return new Date(d).toLocaleString('es-ES', { timeZone: env.huso, dateStyle: 'short', timeStyle: 'short' });
}

function normalizarItems(lista, nombre) {
  if (lista === undefined) return undefined;
  if (!Array.isArray(lista)) throw new ErrorHttp(400, `${nombre} debe ser una lista`);
  const items = lista
    .map((i) => String(typeof i === 'string' ? i : i?.texto || '').trim())
    .filter(Boolean)
    .map((texto) => ({ texto: texto.slice(0, 500) }));
  if (items.length > 200) throw new ErrorHttp(400, `Máximo de 200 elementos en ${nombre}`);
  return items;
}

// ---------- Consulta ----------

export async function listarAcuerdos(usuario, idProyecto) {
  const proyecto = await cargarProyecto(idProyecto, usuario, { poblar: true });
  const versiones = await Acuerdo.find({ proyecto: proyecto._id })
    .sort({ version: -1 })
    .populate('creadoPor', 'nombre')
    .populate('enviadoPor', 'nombre')
    .lean();
  const vigente = versiones.find((v) => v.status === 'firmado') || null;
  const enCurso = versiones.find((v) => v.status === 'borrador' || v.status === 'esperando') || null;
  return {
    responsableEmpresa: proyecto.responsable ? { _id: proyecto.responsable._id, nombre: proyecto.responsable.nombre } : null,
    responsableCliente: proyecto.responsableCliente || null,
    vigente,
    enCurso,
    versiones: versiones.map((v) => ({ ...v, emails: (v.emails || []).map(({ html, ...resto }) => resto) })),
  };
}

export async function cargarAcuerdo(usuario, id) {
  const acuerdo = await Acuerdo.findById(exigirId(id, 'id del acuerdo'));
  if (!acuerdo) throw new ErrorHttp(404, 'Acuerdo no encontrado');
  const proyecto = await cargarProyecto(acuerdo.proyecto, usuario);
  return { acuerdo, proyecto };
}

// Comprobante completo: contenido, firmas y los e-mails enviados (con el HTML).
export async function comprobante(usuario, id) {
  const { acuerdo } = await cargarAcuerdo(usuario, id);
  await acuerdo.populate([
    { path: 'proyecto', select: 'nome cliente' },
    { path: 'enviadoPor', select: 'nome email' },
  ]);
  return acuerdo;
}

// ---------- Edición (borrador) ----------

// Devuelve la versión en edición; si no hay, crea una nueva a partir de la versión más reciente.
export async function abrirBorrador(usuario, idProyecto) {
  exigirAdmin(usuario, 'Solo los administradores pueden modificar el alcance');
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const abierta = await Acuerdo.findOne({ proyecto: proyecto._id, status: { $in: ['borrador', 'esperando'] } });
  if (abierta?.status === 'borrador') return abierta;
  if (abierta?.status === 'esperando') {
    throw new ErrorHttp(409, `La versión ${abierta.version} está pendiente de firma. Cancela el envío para poder modificar el alcance.`);
  }
  // Parte del contenido de la versión más reciente (firmada o cancelada), para no perder nada.
  const ultima = await Acuerdo.findOne({ proyecto: proyecto._id }).sort({ version: -1 });
  const base = ultima;
  return Acuerdo.create({
    proyecto: proyecto._id,
    version: (ultima?.version || 0) + 1,
    status: 'borrador',
    incluidos: base?.incluidos?.map((i) => ({ texto: i.texto })) || [],
    noIncluidos: base?.noIncluidos?.map((i) => ({ texto: i.texto })) || [],
    observaciones: base?.observaciones || '',
    creadoPor: usuario._id,
  });
}

export async function actualizarBorrador(usuario, id, cuerpo = {}) {
  exigirAdmin(usuario, 'Solo los administradores pueden modificar el alcance');
  const { acuerdo } = await cargarAcuerdo(usuario, id);
  if (acuerdo.status !== 'borrador') throw new ErrorHttp(409, 'Solo se puede modificar una versión en borrador');
  const incluidos = normalizarItems(cuerpo.incluidos, 'incluidos');
  const noIncluidos = normalizarItems(cuerpo.noIncluidos, 'no incluidos');
  if (incluidos) acuerdo.incluidos = incluidos;
  if (noIncluidos) acuerdo.noIncluidos = noIncluidos;
  if (cuerpo.observaciones !== undefined) acuerdo.observaciones = String(cuerpo.observaciones || '').trim();
  await acuerdo.save();
  return acuerdo;
}

// Atajo para el chat: añade/quita elementos en el borrador (crea el borrador si hace falta).
export async function modificarItemsDelAlcance(usuario, idProyecto, { anadirIncluidos = [], anadirNoIncluidos = [], quitar = [] }) {
  const borrador = await abrirBorrador(usuario, idProyecto);
  const sacar = new Set(quitar.map((r) => String(r).trim().toLowerCase()));
  const filtrar = (lista) => lista.filter((i) => !sacar.has(i.texto.toLowerCase()));
  const incluidos = [...filtrar(borrador.incluidos), ...anadirIncluidos.map((texto) => ({ texto }))];
  const noIncluidos = [...filtrar(borrador.noIncluidos), ...anadirNoIncluidos.map((texto) => ({ texto }))];
  return actualizarBorrador(usuario, borrador._id, { incluidos, noIncluidos });
}

// ---------- Envío y firmas ----------

function linkDelCliente(token) {
  return `${env.appUrl}/acuerdo/${token}`;
}

function htmlLista(items, vacio) {
  if (!items.length) return `<p style="color:#5b6b84;margin:4px 0 0">${vacio}</p>`;
  return `<ul style="margin:6px 0 0;padding-left:20px">${items.map((i) => `<li style="margin:3px 0">${escaparHtml(i.texto)}</li>`).join('')}</ul>`;
}

function htmlPedido({ proyecto, acuerdo, remitente, link }) {
  const nombreCliente = escaparHtml(acuerdo.cliente.nombre || 'cliente');
  return `<!doctype html><html><body style="margin:0;background:#f0f3fc;font-family:Arial,Helvetica,sans-serif;color:#14213a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#012142;color:#19f7f1;padding:18px 24px;font-size:18px;font-weight:bold">Acuerdo de especificaciones – versión ${acuerdo.version}</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px">Hola, ${nombreCliente}.</p>
<p style="margin:0 0 16px">Te enviamos el acuerdo de especificaciones del proyecto <strong>${escaparHtml(proyecto.nombre)}</strong>${proyecto.cliente ? ` (${escaparHtml(proyecto.cliente)})` : ''}. Por favor, revisa lo que <strong>está</strong> y lo que <strong>no está</strong> incluido.</p>
<h3 style="margin:18px 0 0;color:#127a52;font-size:15px">✔ Incluido en el proyecto</h3>
${htmlLista(acuerdo.incluidos, 'Ningún elemento.')}
<h3 style="margin:18px 0 0;color:#b42318;font-size:15px">✘ No incluido en el proyecto</h3>
${htmlLista(acuerdo.noIncluidos, 'Ningún elemento.')}
${acuerdo.observaciones ? `<h3 style="margin:18px 0 0;font-size:15px">Observaciones</h3><p style="margin:6px 0 0;white-space:pre-line">${escaparHtml(acuerdo.observaciones)}</p>` : ''}
<p style="margin:24px 0 8px">Si estás de acuerdo, haz clic en el botón de abajo:</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#0fced3;color:#012142;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Acepto el acuerdo</a></p>
<p style="margin:0;color:#5b6b84;font-size:13px">El enlace es válido durante ${VALIDEZ_LINK_DIAS} días. Si no estás de acuerdo con algún punto, responde a este e-mail a ${escaparHtml(remitente.nombre)}.<br>Cualquier cambio futuro en el alcance genera una nueva versión, que necesitará una nueva aceptación.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function textoPedido({ proyecto, acuerdo, link }) {
  const lista = (items) => (items.length ? items.map((i) => `- ${i.texto}`).join('\n') : '(ninguno)');
  return `Acuerdo de especificaciones – versión ${acuerdo.version}\nProyecto: ${proyecto.nombre}\n\nINCLUIDO:\n${lista(acuerdo.incluidos)}\n\nNO INCLUIDO:\n${lista(acuerdo.noIncluidos)}\n\nPara aceptarlo, entra en: ${link}`;
}

function htmlConfirmacion({ proyecto, acuerdo }) {
  const a = acuerdo.firmaCliente;
  const e = acuerdo.firmaEmpresa;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#14213a">
<h2 style="color:#012142">Aceptación registrada</h2>
<p><strong>${escaparHtml(a.nombre || a.email)}</strong> (${escaparHtml(a.email)}) aceptó el acuerdo de especificaciones <strong>versión ${acuerdo.version}</strong> del proyecto <strong>${escaparHtml(proyecto.nombre)}</strong> el ${formatearFechaHora(a.fecha)}.</p>
<p>${e?.fecha ? `Firma de Awakelab: ${escaparHtml(e.nombre)} el ${formatearFechaHora(e.fecha)}. <strong>Acuerdo firmado por las dos partes.</strong>` : 'Pendiente de la firma del responsable de Awakelab.'}</p>
<h3 style="color:#127a52">Incluido</h3>${htmlLista(acuerdo.incluidos, 'Ningún elemento.')}
<h3 style="color:#b42318">No incluido</h3>${htmlLista(acuerdo.noIncluidos, 'Ningún elemento.')}
<p style="color:#5b6b84;font-size:12px">Registro: IP ${escaparHtml(a.ip || '—')}. Este e-mail queda adjunto al proyecto como comprobante.</p>
</body></html>`;
}

async function finalizarSiCompleto(acuerdo, proyecto) {
  if (!acuerdo.firmaEmpresa?.fecha || !acuerdo.firmaCliente?.fecha) return false;
  await Acuerdo.updateMany({ proyecto: proyecto._id, status: 'firmado', _id: { $ne: acuerdo._id } }, { status: 'sustituido' });
  acuerdo.status = 'firmado';
  acuerdo.firmadoEn = new Date();
  await acuerdo.save();
  await registrarEventoSistema(proyecto._id, `Acuerdo de especificaciones versión ${acuerdo.version} firmado por las dos partes.`, { categoria: 'cliente' });
  return true;
}

export async function enviarParaFirma(usuario, id) {
  exigirAdmin(usuario, 'Solo los administradores pueden enviar el acuerdo');
  const { acuerdo, proyecto } = await cargarAcuerdo(usuario, id);
  if (acuerdo.status !== 'borrador') throw new ErrorHttp(409, 'Solo se puede enviar una versión en borrador');
  if (!acuerdo.incluidos.length && !acuerdo.noIncluidos.length) throw new ErrorHttp(400, 'El alcance está vacío. Añade los elementos antes de enviarlo.');
  const rc = proyecto.responsableCliente || {};
  if (!rc.email) throw new ErrorHttp(400, 'Registra el e-mail del responsable del cliente en el proyecto (Editar proyecto) antes de enviarlo.');

  const token = crypto.randomBytes(32).toString('base64url');
  acuerdo.cliente = { nombre: rc.nombre, email: rc.email, cargo: rc.cargo };
  acuerdo.tokenHash = hash(token);
  acuerdo.tokenExpiraEn = new Date(Date.now() + VALIDEZ_LINK_DIAS * 24 * 3600 * 1000);
  acuerdo.enviadoPor = usuario._id;
  acuerdo.enviadoEn = new Date();
  acuerdo.firmaEmpresa = undefined;
  acuerdo.firmaCliente = undefined;

  const link = linkDelCliente(token);
  const email = await enviarEmail(usuario._id, {
    para: rc.email,
    asunto: `Acuerdo de especificaciones – ${proyecto.nombre} (versión ${acuerdo.version})`,
    html: htmlPedido({ proyecto, acuerdo, remitente: usuario, link }),
    texto: textoPedido({ proyecto, acuerdo, link }),
  });
  // La copia guardada no lleva el enlace real (quien ve el comprobante no debe poder "firmar por el cliente").
  acuerdo.emails.push({ tipo: 'pedido', ...email, html: email.html.split(link).join('#link-de-aceptacion') });
  acuerdo.status = 'esperando';
  await acuerdo.save();
  await registrarEventoSistema(proyecto._id, `Acuerdo versión ${acuerdo.version} enviado a ${rc.nombre || rc.email} (${rc.email}) para que lo firme.`, {
    autor: usuario._id,
    categoria: 'cliente',
  });

  // En modo prueba el e-mail no sale del ordenador: devolvemos el enlace para simular el clic del cliente.
  return { acuerdo, modoEmail: email.modo, linkPrueba: email.modo === 'prueba' ? link : undefined };
}

export async function cancelarEnvio(usuario, id) {
  exigirAdmin(usuario, 'Solo los administradores pueden cancelar');
  const { acuerdo, proyecto } = await cargarAcuerdo(usuario, id);
  if (!['esperando', 'borrador'].includes(acuerdo.status)) throw new ErrorHttp(409, 'Esta versión no se puede cancelar');
  const estava = acuerdo.status;
  acuerdo.status = 'cancelado';
  await acuerdo.save();
  if (estava === 'esperando') {
    await registrarEventoSistema(proyecto._id, `Envío del acuerdo versión ${acuerdo.version} cancelado.`, { autor: usuario._id, categoria: 'cliente' });
  }
  return acuerdo;
}

// Firma de Awakelab: solo el responsable del proyecto (lado empresa), con el botón del sistema.
export async function firmarPorEmpresa(usuario, id, ip) {
  const { acuerdo, proyecto } = await cargarAcuerdo(usuario, id);
  if (String(proyecto.responsable) !== String(usuario._id)) {
    throw new ErrorHttp(403, 'Solo el responsable del proyecto por parte de Awakelab puede firmar el acuerdo');
  }
  if (acuerdo.status !== 'esperando') throw new ErrorHttp(409, 'Envía el acuerdo al cliente antes de firmarlo');
  if (acuerdo.firmaEmpresa?.fecha) throw new ErrorHttp(409, 'Ya has firmado esta versión');
  acuerdo.firmaEmpresa = { usuario: usuario._id, nombre: usuario.nombre, email: usuario.email, fecha: new Date(), ip };
  await acuerdo.save();
  await registrarEventoSistema(proyecto._id, `${usuario.nombre} firmó el acuerdo versión ${acuerdo.version} por Awakelab.`, {
    autor: usuario._id,
    categoria: 'cliente',
  });
  await finalizarSiCompleto(acuerdo, proyecto);
  return acuerdo;
}

// ---------- Página pública del cliente (sin login) ----------

async function acuerdoPorToken(token) {
  if (!token || String(token).length < 20) throw new ErrorHttp(404, 'Enlace no válido');
  const acuerdo = await Acuerdo.findOne({ tokenHash: hash(String(token)) }).select('+tokenHash');
  if (!acuerdo) throw new ErrorHttp(404, 'Este enlace no es válido o el acuerdo fue sustituido/cancelado.');
  const proyecto = await Proyecto.findById(acuerdo.proyecto).populate('responsable', 'nombre');
  return { acuerdo, proyecto };
}

function vistaPublica(acuerdo, proyecto) {
  return {
    proyecto: proyecto.nombre,
    cliente: proyecto.cliente || '',
    version: acuerdo.version,
    status: acuerdo.status,
    incluidos: acuerdo.incluidos.map((i) => i.texto),
    noIncluidos: acuerdo.noIncluidos.map((i) => i.texto),
    observaciones: acuerdo.observaciones || '',
    destinatario: acuerdo.cliente?.nombre || acuerdo.cliente?.email || '',
    responsableEmpresa: proyecto.responsable?.nombre || '',
    firmadoPorCliente: acuerdo.firmaCliente?.fecha || null,
    firmadoPorEmpresa: acuerdo.firmaEmpresa?.fecha || null,
    expiraEn: acuerdo.tokenExpiraEn,
  };
}

export async function verAcuerdoPublico(token) {
  const { acuerdo, proyecto } = await acuerdoPorToken(token);
  return vistaPublica(acuerdo, proyecto);
}

export async function aceptarPublico(token, { ip, navegador }) {
  const { acuerdo, proyecto } = await acuerdoPorToken(token);
  if (acuerdo.status !== 'esperando') throw new ErrorHttp(409, 'Este acuerdo ya no está pendiente de firma.');
  if (acuerdo.tokenExpiraEn && acuerdo.tokenExpiraEn < new Date()) {
    throw new ErrorHttp(410, 'Este enlace ha caducado. Pide a Awakelab un nuevo envío.');
  }
  if (acuerdo.firmaCliente?.fecha) return vistaPublica(acuerdo, proyecto); // clic repetido: no cambia nada

  acuerdo.firmaCliente = {
    nombre: acuerdo.cliente?.nombre,
    email: acuerdo.cliente?.email,
    fecha: new Date(),
    ip,
    navegador: String(navegador || '').slice(0, 300),
  };
  await acuerdo.save();
  await registrarEventoSistema(
    proyecto._id,
    `${acuerdo.cliente?.nombre || acuerdo.cliente?.email} (cliente) aceptó el acuerdo versión ${acuerdo.version} por e-mail.`,
    { categoria: 'cliente' }
  );
  await finalizarSiCompleto(acuerdo, proyecto);

  // E-mail de confirmación para el cliente y para quien lo envió: queda adjunto como comprobante.
  try {
    const remitente = await Usuario.findById(acuerdo.enviadoPor).select('email');
    const email = await enviarEmail(acuerdo.enviadoPor, {
      para: [acuerdo.cliente.email, remitente?.email].filter(Boolean),
      asunto: `Confirmación: acuerdo de especificaciones – ${proyecto.nombre} (versión ${acuerdo.version})`,
      html: htmlConfirmacion({ proyecto, acuerdo }),
      texto: `${acuerdo.cliente.nombre || acuerdo.cliente.email} aceptó el acuerdo versión ${acuerdo.version} del proyecto ${proyecto.nombre} el ${formatearFechaHora(acuerdo.firmaCliente.fecha)}.`,
    });
    acuerdo.emails.push({ tipo: 'confirmacion', ...email });
    await acuerdo.save();
  } catch (error) {
    console.error('[acuerdo] aceptación registrada, pero falló el e-mail de confirmación:', error.message);
  }
  return vistaPublica(acuerdo, proyecto);
}

// Envío de e-mails en nombre del usuario conectado.
// Orden: 1) e-mail configurado por el usuario en "Mi cuenta"
//        2) e-mail general del .env (SMTP_*), con las respuestas dirigidas al usuario
//        3) MODO PRUEBA: el e-mail se genera y se guarda, pero no sale del ordenador
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Usuario } from '../models/Usuario.js';
import { ErrorHttp } from '../utils/http.js';

// ---------- Cifrado de las contraseñas de e-mail guardadas en la base de datos ----------
const clave = crypto.createHash('sha256').update(String(env.claveCifra)).digest();

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([cifra.update(String(texto), 'utf8'), cifra.final()]);
  return [iv, cifra.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}

export function descifrar(valor) {
  const [iv, tag, datos] = String(valor).split('.').map((p) => Buffer.from(p, 'base64'));
  const descifra = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  descifra.setAuthTag(tag);
  return Buffer.concat([descifra.update(datos), descifra.final()]).toString('utf8');
}

// ---------- Elección de cómo enviar ----------
let transportePrueba = null; // permite cambiarlo en las pruebas automáticas

export function definirTransportePrueba(t) {
  transportePrueba = t;
}

async function montarEnvio(idUsuario) {
  const usuario = await Usuario.findById(idUsuario).select('+emailEnvio.contrasenaCifrada');
  if (!usuario) throw new ErrorHttp(404, 'Usuario remitente no encontrado');
  const cfg = usuario.emailEnvio || {};

  if (cfg.host && cfg.usuario && cfg.contrasenaCifrada) {
    let contrasena;
    try {
      contrasena = descifrar(cfg.contrasenaCifrada);
    } catch {
      throw new ErrorHttp(400, 'No se pudo leer la contraseña de tu e-mail de envío. Vuelve a configurarlo en "Mi cuenta".');
    }
    return {
      modo: 'personal',
      de: `"${cfg.nombreRemitente || usuario.nombre}" <${cfg.usuario}>`,
      responderPara: undefined,
      transporte:
        transportePrueba ||
        nodemailer.createTransport({ host: cfg.host, port: cfg.puerto, secure: cfg.seguro, auth: { user: cfg.usuario, pass: contrasena } }),
      usuario,
    };
  }

  if (env.smtp.host && env.smtp.usuario) {
    return {
      modo: 'general',
      de: `"${usuario.nombre} (vía Taskly)" <${env.smtp.remitente || env.smtp.usuario}>`,
      responderPara: usuario.email,
      transporte:
        transportePrueba ||
        nodemailer.createTransport({
          host: env.smtp.host,
          port: env.smtp.puerto,
          secure: env.smtp.seguro,
          auth: { user: env.smtp.usuario, pass: env.smtp.contrasena },
        }),
      usuario,
    };
  }

  return {
    modo: 'prueba',
    de: `"${usuario.nombre}" <${usuario.email}>`,
    responderPara: undefined,
    transporte: nodemailer.createTransport({ jsonTransport: true }),
    usuario,
  };
}

// Envía (o simula) y devuelve un registro completo del e-mail, para guardarlo como comprobante.
export async function enviarEmail(idRemitente, { para, asunto, html, texto }) {
  const envio = await montarEnvio(idRemitente);
  const destinatarios = Array.isArray(para) ? para : [para];
  let info;
  try {
    info = await envio.transporte.sendMail({
      from: envio.de,
      to: destinatarios.join(', '),
      replyTo: envio.responderPara,
      subject: asunto,
      html,
      text: texto,
    });
  } catch (error) {
    console.error('[email] error al enviar:', error.message);
    throw new ErrorHttp(
      502,
      `No se pudo enviar el e-mail (${error.code || error.message}). Revisa la configuración del e-mail de envío en "Mi cuenta".`
    );
  }
  return {
    modo: envio.modo,
    de: envio.de,
    para: destinatarios,
    asunto,
    html,
    enviadoEn: new Date(),
    idMensaje: info?.messageId || '',
  };
}

// ---------- Configuración por el propio usuario ----------
export async function obtenerConfigEmail(usuario) {
  const u = await Usuario.findById(usuario._id);
  const cfg = u.emailEnvio || {};
  return {
    host: cfg.host || '',
    puerto: cfg.puerto || 587,
    seguro: Boolean(cfg.seguro),
    usuario: cfg.usuario || '',
    nombreRemitente: cfg.nombreRemitente || '',
    configurado: Boolean(cfg.host && cfg.usuario),
    emailGeneralDisponivel: Boolean(env.smtp.host && env.smtp.usuario),
  };
}

export async function guardarConfigEmail(usuario, cuerpo = {}) {
  const u = await Usuario.findById(usuario._id).select('+emailEnvio.contrasenaCifrada');
  if (cuerpo.quitar) {
    u.emailEnvio = { host: '', puerto: 587, seguro: false, usuario: '', contrasenaCifrada: '', nombreRemitente: '' };
    await u.save();
    return obtenerConfigEmail(usuario);
  }
  const host = String(cuerpo.host || '').trim();
  const usuarioEmail = String(cuerpo.usuario || '').trim();
  const puerto = Number(cuerpo.puerto) || 587;
  if (!host || !usuarioEmail) throw new ErrorHttp(400, 'Indica el servidor (host) y el e-mail/usuario de la cuenta');
  if (puerto < 1 || puerto > 65535) throw new ErrorHttp(400, 'Puerto no válido');
  const contrasenaNueva = cuerpo.contrasena ? String(cuerpo.contrasena) : '';
  if (!contrasenaNueva && !u.emailEnvio?.contrasenaCifrada) throw new ErrorHttp(400, 'Indica la contraseña (o contraseña de aplicación) del e-mail');

  u.emailEnvio = {
    host,
    puerto,
    seguro: Boolean(cuerpo.seguro),
    usuario: usuarioEmail,
    nombreRemitente: String(cuerpo.nombreRemitente || '').trim(),
    contrasenaCifrada: contrasenaNueva ? cifrar(contrasenaNueva) : u.emailEnvio.contrasenaCifrada,
  };
  await u.save();
  return obtenerConfigEmail(usuario);
}

export async function enviarEmailDePrueba(usuario) {
  const r = await enviarEmail(usuario._id, {
    para: usuario.email,
    asunto: 'Taskly – e-mail de prueba',
    html: `<p>Hola, ${escaparHtml(usuario.nombre)}!</p><p>Si has recibido este mensaje, el envío de e-mails de Taskly funciona.</p>`,
    texto: `¡Hola, ${usuario.nombre}! Si has recibido este mensaje, el envío de e-mails de Taskly funciona.`,
  });
  return { modo: r.modo, de: r.de, para: r.para };
}

export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

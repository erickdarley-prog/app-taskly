// Adjuntos de los proyectos: vídeos, imágenes, documentos y otros archivos.
// Los archivos se guardan en el disco (carpeta "uploads", una subcarpeta por proyecto) y los datos en MongoDB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Adjunto } from '../models/Adjunto.js';
import { env } from '../config/env.js';
import { esAdmin } from '../middlewares/auth.js';
import { ErrorHttp, exigirId } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { cargarProyecto } from '../utils/acceso.js';
import { ganchosEliminacionProyecto } from './proyectos.js';
import { registrarEventoSistema } from './diario.js';

const RAIZ_API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CARPETA_UPLOADS = env.carpetaUploads ? path.resolve(env.carpetaUploads) : path.join(RAIZ_API, 'uploads');
const MAX_ARCHIVOS_POR_ENVIO = 10;
const VALIDEZ_LINK = '30m';

// ---------- Tipos de archivo ----------
// extensión -> [tipo, visualizador (o null = solo descargar), content-type]
const EXTENSIONES = {
  mp4: ['video', 'video', 'video/mp4'],
  m4v: ['video', 'video', 'video/mp4'],
  webm: ['video', 'video', 'video/webm'],
  ogv: ['video', 'video', 'video/ogg'],
  mov: ['video', 'video', 'video/quicktime'],
  avi: ['video', null, 'video/x-msvideo'],
  mkv: ['video', null, 'video/x-matroska'],
  png: ['imagen', 'imagen', 'image/png'],
  jpg: ['imagen', 'imagen', 'image/jpeg'],
  jpeg: ['imagen', 'imagen', 'image/jpeg'],
  gif: ['imagen', 'imagen', 'image/gif'],
  webp: ['imagen', 'imagen', 'image/webp'],
  bmp: ['imagen', 'imagen', 'image/bmp'],
  svg: ['imagen', 'imagen', 'image/svg+xml'],
  pdf: ['documento', 'pdf', 'application/pdf'],
  docx: ['documento', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['documento', null, 'application/msword'],
  odt: ['documento', null, 'application/vnd.oasis.opendocument.text'],
  rtf: ['documento', null, 'application/rtf'],
  txt: ['documento', 'texto', 'text/plain; charset=utf-8'],
  md: ['documento', 'markdown', 'text/plain; charset=utf-8'],
  markdown: ['documento', 'markdown', 'text/plain; charset=utf-8'],
};

export function extensionDe(nombre) {
  const ext = path.extname(String(nombre || '')).slice(1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

export function clasificar(nombre) {
  const info = EXTENSIONES[extensionDe(nombre)];
  return info ? info[0] : 'archivo';
}

export function visualizadorDe(adjunto) {
  return EXTENSIONES[adjunto.extension]?.[1] || null;
}

function contentType(adjunto) {
  return EXTENSIONES[adjunto.extension]?.[2] || 'application/octet-stream';
}

function formatear(adjunto) {
  const a = typeof adjunto.toJSON === 'function' ? adjunto.toJSON() : adjunto;
  delete a.archivo;
  return {
    ...a,
    visualizador: visualizadorDe(a),
    enviadoPor: a.enviadoPor?.nombre ? { _id: a.enviadoPor._id, nombre: a.enviadoPor.nombre } : a.enviadoPor,
  };
}

ganchosEliminacionProyecto.push(async (idProyecto) => {
  await Adjunto.deleteMany({ proyecto: idProyecto });
  await fs.promises.rm(path.join(CARPETA_UPLOADS, String(idProyecto)), { recursive: true, force: true });
});

// ---------- Subida (upload) ----------

const almacenamiento = multer.diskStorage({
  destination(req, _archivo, cb) {
    const carpeta = path.join(CARPETA_UPLOADS, String(req.proyecto._id));
    fs.promises.mkdir(carpeta, { recursive: true }).then(() => cb(null, carpeta), cb);
  },
  filename(_req, archivo, cb) {
    const ext = extensionDe(archivo.originalname);
    cb(null, `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`);
  },
});

const recibirArchivos = multer({
  storage: almacenamiento,
  defParamCharset: 'utf8', // los nombres con tilde llegan bien
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: MAX_ARCHIVOS_POR_ENVIO },
}).array('archivos', MAX_ARCHIVOS_POR_ENVIO);

// Middleware: comprueba el acceso al proyecto ANTES de guardar ningún archivo.
export async function prepararEnvio(req, _res, next) {
  try {
    req.proyecto = await cargarProyecto(req.params.id, req.usuario);
    next();
  } catch (error) {
    next(error);
  }
}

export function recibir(req, res, next) {
  recibirArchivos(req, res, (error) => {
    if (!error) return next();
    // Si algo falló a mitad de la subida, borra lo que ya se guardó.
    for (const f of req.files || []) fs.promises.unlink(f.path).catch(() => {});
    if (error.code === 'LIMIT_FILE_SIZE') return next(new ErrorHttp(413, `Archivo demasiado grande. El máximo es ${env.maxUploadMb} MB por archivo.`));
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ErrorHttp(400, `Envía como máximo ${MAX_ARCHIVOS_POR_ENVIO} archivos cada vez.`));
    }
    next(new ErrorHttp(400, `No se pudo recibir el archivo: ${error.message}`));
  });
}

export async function registrarEnvio(usuario, proyecto, archivos = [], descripcion = '') {
  if (!archivos.length) throw new ErrorHttp(400, 'Elige al menos un archivo.');
  const docs = await Adjunto.insertMany(
    archivos.map((f) => ({
      proyecto: proyecto._id,
      nombre: String(f.originalname || 'archivo').slice(0, 255),
      tipo: clasificar(f.originalname),
      extension: extensionDe(f.originalname),
      mime: f.mimetype || 'application/octet-stream',
      tamano: f.size,
      archivo: f.filename,
      descripcion: String(descripcion || '').slice(0, 1000),
      enviadoPor: usuario._id,
    }))
  );
  const nombres = docs.map((d) => d.nombre);
  await registrarEventoSistema(
    proyecto._id,
    `${usuario.nombre} subió ${docs.length === 1 ? 'el adjunto' : `${docs.length} adjuntos`}: ${nombres.slice(0, 5).join(', ')}${nombres.length > 5 ? '…' : ''}`,
    { autor: usuario._id, categoria: 'observacion' }
  );
  return docs.map((d) => formatear({ ...d.toJSON(), enviadoPor: { _id: usuario._id, nombre: usuario.nombre } }));
}

// ---------- Consulta ----------

export async function listarAdjuntos(usuario, idProyecto, query = {}) {
  const proyecto = await cargarProyecto(idProyecto, usuario);
  const filtro = { proyecto: proyecto._id };
  if (query.tipo && ['video', 'imagen', 'documento', 'archivo'].includes(query.tipo)) filtro.tipo = query.tipo;
  if (query.busqueda) filtro.nombre = new RegExp(escaparRegex(String(query.busqueda)), 'i');

  const [items, conteos] = await Promise.all([
    Adjunto.find(filtro).sort({ createdAt: -1 }).limit(1000).populate('enviadoPor', 'nombre'),
    Adjunto.aggregate([
      { $match: { proyecto: proyecto._id } },
      { $group: { _id: '$tipo', total: { $sum: 1 }, bytes: { $sum: '$tamano' } } },
    ]),
  ]);
  const porTipo = { video: 0, imagen: 0, documento: 0, archivo: 0 };
  let bytes = 0;
  for (const c of conteos) {
    porTipo[c._id] = c.total;
    bytes += c.bytes;
  }
  return {
    items: items.map(formatear),
    porTipo,
    total: Object.values(porTipo).reduce((a, b) => a + b, 0),
    bytes,
    maxUploadMb: env.maxUploadMb,
  };
}

async function cargarAdjunto(usuario, id) {
  const adjunto = await Adjunto.findById(exigirId(id, 'id del adjunto')).select('+archivo');
  if (!adjunto) throw new ErrorHttp(404, 'Adjunto no encontrado');
  await cargarProyecto(adjunto.proyecto, usuario);
  return adjunto;
}

// Enlace temporal (30 min) para ver o descargar. Necesario porque <img>, <video> y
// las descargas no pueden enviar la cabecera de login.
export async function linkTemporal(usuario, id) {
  const adjunto = await cargarAdjunto(usuario, id);
  const token = jwt.sign({ uso: 'adjunto', a: String(adjunto._id), u: String(usuario._id) }, env.jwtSecret, { expiresIn: VALIDEZ_LINK });
  const ruta = `/archivos/${adjunto._id}?t=${encodeURIComponent(token)}`;
  return { ver: ruta, descargar: `${ruta}&descargar=1`, visualizador: visualizadorDe(adjunto) };
}

export async function eliminarAdjunto(usuario, id) {
  const adjunto = await cargarAdjunto(usuario, id);
  if (!esAdmin(usuario) && String(adjunto.enviadoPor) !== String(usuario._id)) {
    throw new ErrorHttp(403, 'Solo puedes eliminar los adjuntos que has subido');
  }
  await fs.promises.unlink(path.join(CARPETA_UPLOADS, String(adjunto.proyecto), adjunto.archivo)).catch(() => {});
  await adjunto.deleteOne();
  return { eliminado: true, nombre: adjunto.nombre };
}

// ---------- Entrega del archivo (con soporte para vídeo "saltando" a cualquier punto) ----------

export async function servirArchivo(req, res, next) {
  try {
    let datos;
    try {
      datos = jwt.verify(String(req.query.t || ''), env.jwtSecret);
    } catch {
      throw new ErrorHttp(401, 'Enlace caducado o no válido. Vuelve a abrir el adjunto desde Taskly.');
    }
    if (datos.uso !== 'adjunto' || datos.a !== req.params.id) throw new ErrorHttp(401, 'Enlace no válido.');

    const adjunto = await Adjunto.findById(exigirId(req.params.id)).select('+archivo');
    if (!adjunto) throw new ErrorHttp(404, 'Adjunto no encontrado');
    const ruta = path.join(CARPETA_UPLOADS, String(adjunto.proyecto), adjunto.archivo);
    if (!ruta.startsWith(CARPETA_UPLOADS + path.sep)) throw new ErrorHttp(400, 'Ruta no válida');
    if (!fs.existsSync(ruta)) throw new ErrorHttp(404, 'El archivo ya no está en el servidor.');

    const inline = Boolean(visualizadorDe(adjunto)) && req.query.descargar !== '1';
    const nombreSeguro = adjunto.nombre.replace(/["\\\r\n]/g, '_');
    const cabeceras = {
      'Content-Type': inline ? contentType(adjunto) : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nombreSeguro.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(adjunto.nombre)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=1800',
    };
    // Un SVG puede contener scripts: se abre "aislado" (sin ejecutar nada).
    if (adjunto.extension === 'svg') cabeceras['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    res.sendFile(ruta, { headers: cabeceras }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
}

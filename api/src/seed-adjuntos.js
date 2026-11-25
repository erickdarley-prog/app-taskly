// Archivos de ejemplo para el área de Adjuntos (generados aquí mismo, sin descargar nada).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Adjunto } from './models/Adjunto.js';
import { CARPETA_UPLOADS, clasificar, extensionDe } from './servicios/adjuntos.js';

// ---------- CRC32 (se usa en el PNG y en el ZIP del .docx) ----------
const TABLA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- PNG: franja en degradado azul → cian ----------
function generarPng(anchura = 640, altura = 360) {
  const lineas = [];
  for (let y = 0; y < altura; y += 1) {
    const linea = Buffer.alloc(1 + anchura * 3);
    for (let x = 0; x < anchura; x += 1) {
      const t = (x / anchura) * 0.7 + (y / altura) * 0.3;
      const franja = (x + y) % 40 < 3 ? 12 : 0;
      linea[1 + x * 3] = Math.min(255, Math.round(1 + t * 14) + franja);
      linea[2 + x * 3] = Math.min(255, Math.round(33 + t * 173) + franja);
      linea[3 + x * 3] = Math.min(255, Math.round(66 + t * 145) + franja);
    }
    lineas.push(linea);
  }
  const bloque = (tipo, datos) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(datos.length);
    const tipoBuf = Buffer.from(tipo);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, datos])));
    return Buffer.concat([tam, tipoBuf, datos, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(anchura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(Buffer.concat(lineas))),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- PDF sencillo con texto ----------
function generarPdf(lineas) {
  const texto = lineas
    .map((l, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 60 ${760 - i * 26} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`)
    .join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(texto, 'latin1')} >>\nstream\n${texto}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const posiciones = [];
  objetos.forEach((o, i) => {
    posiciones.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ---------- DOCX mínimo (un ZIP con 3 archivos XML) ----------
function generarZip(archivos) {
  const partes = [];
  const central = [];
  let posicion = 0;
  for (const [nombre, contenido] of archivos) {
    const datos = Buffer.from(contenido, 'utf8');
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    partes.push(local, nombreBuf, datos);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(datos.length, 20);
    c.writeUInt32LE(datos.length, 24);
    c.writeUInt16LE(nombreBuf.length, 28);
    c.writeUInt32LE(posicion, 42);
    central.push(c, nombreBuf);
    posicion += 30 + nombreBuf.length + datos.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(tamCentral, 12);
  fin.writeUInt32LE(posicion, 16);
  return Buffer.concat([...partes, ...central, fin]);
}

function generarDocx(titulo, parrafos) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const p = (t, negrita = false, tam = 22) =>
    `<w:p><w:r><w:rPr>${negrita ? '<w:b/>' : ''}<w:sz w:val="${tam}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  const cuerpo = [p(titulo, true, 36), ...parrafos.map((t) => (t.startsWith('# ') ? p(t.slice(2), true, 26) : p(t)))].join('');
  return generarZip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}</w:body></w:document>`,
    ],
  ]);
}

// ---------- Creación de los adjuntos ----------

// Borra solo las subcarpetas de proyectos (nombres de 24 caracteres hexadecimales) de la carpeta de uploads.
export async function limpiarUploads() {
  if (!fs.existsSync(CARPETA_UPLOADS)) return;
  for (const nombre of await fs.promises.readdir(CARPETA_UPLOADS)) {
    if (/^[a-f0-9]{24}$/.test(nombre)) await fs.promises.rm(path.join(CARPETA_UPLOADS, nombre), { recursive: true, force: true });
  }
}

export async function crearAdjuntosDeEjemplo(proyecto, porEmail, enDias) {
  const ejemplos = [
    ['acta-kickoff-AHK.pdf', 'admin@taskly.local', -16, generarPdf([
      'Acta de la reunion de kickoff - Plataforma AHK',
      'Participantes: Admin Taskly (Awakelab) y Laura Mendez (AHK)',
      'Objetivo: plataforma lista para los grupos de enero.',
      'Acordado: Moodle 4.5, dominio propio y tema con la identidad de AHK.',
      'El cliente pidio informes de alumnos y un dashboard para el SEPE.',
      'Siguiente paso: el cliente envia logos, colores y lista de cursos.',
    ])],
    ['propuesta-grafica-v1.png', 'maria@taskly.local', -9, generarPng()],
    ['especificacion-dashboard-SEPE.docx', 'ana@taskly.local', -2, generarDocx('Especificación – Dashboard administrativo SEPE', [
      '# Objetivo',
      'Reunir en una pantalla los indicadores que el cliente debe enviar al SEPE: alumnos matriculados, horas cursadas, avance por curso y certificados emitidos.',
      '# Indicadores',
      'Alumnos activos por curso; horas de conexión por alumno; porcentaje de finalización; alumnos sin acceso desde hace más de 7 días.',
      '# Fuera del alcance',
      'La gestión del certificado SEPE sigue a cargo del cliente (ver acuerdo de especificaciones).',
    ])],
    ['checklist-implantacion.md', 'joao@taskly.local', -12, `# Checklist de implantación – Plataforma AHK

## Infraestructura
- [x] DNS y subdominios
- [x] Certificado SSL
- [x] Moodle 4.5 instalado

## Configuración
- [x] Idioma español y zona horaria de Madrid
- [ ] Tema gráfico aplicado
- [ ] E-mails del sistema probados

> Observación: a la espera de que el cliente elija la propuesta gráfica.
`],
    ['notas-reunion-laura.txt', 'admin@taskly.local', -4, `Reunión rápida con Laura (AHK)

- Todavía está decidiendo entre las dos propuestas de diseño.
- Pidió mantener el azul corporativo.
- Enviará la plantilla de informe del SEPE antes del viernes.
`],
    ['plantilla-alumnos.csv', 'carla@taskly.local', -1, 'nombre;email;curso;perfil\nAlumno Ejemplo;alumno@example.com;Prevención de riesgos;estudiante\nTutora Ejemplo;tutora@example.com;Prevención de riesgos;tutor\n'],
  ];

  const carpeta = path.join(CARPETA_UPLOADS, String(proyecto._id));
  await fs.promises.mkdir(carpeta, { recursive: true });
  const docs = [];
  for (const [nombre, autor, dia, contenido] of ejemplos) {
    const ext = extensionDe(nombre);
    const archivo = `${crypto.randomUUID()}.${ext}`;
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    await fs.promises.writeFile(path.join(carpeta, archivo), datos);
    docs.push({
      proyecto: proyecto._id,
      nombre,
      tipo: clasificar(nombre),
      extension: ext,
      mime: 'application/octet-stream',
      tamano: datos.length,
      archivo,
      enviadoPor: porEmail[autor]._id,
      createdAt: enDias(dia),
      updatedAt: enDias(dia),
    });
  }
  await Adjunto.insertMany(docs, { timestamps: false });
  return docs.length;
}

// Arquivos de exemplo para a área de Anexos (gerados aqui mesmo, sem baixar nada).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Anexo } from './models/Anexo.js';
import { PASTA_UPLOADS, classificar, extensaoDe } from './servicos/anexos.js';

// ---------- CRC32 (usado no PNG e no ZIP do .docx) ----------
const TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- PNG: faixa em degradê azul → ciano ----------
function gerarPng(largura = 640, altura = 360) {
  const linhas = [];
  for (let y = 0; y < altura; y += 1) {
    const linha = Buffer.alloc(1 + largura * 3);
    for (let x = 0; x < largura; x += 1) {
      const t = (x / largura) * 0.7 + (y / altura) * 0.3;
      const listra = (x + y) % 40 < 3 ? 12 : 0;
      linha[1 + x * 3] = Math.min(255, Math.round(1 + t * 14) + listra);
      linha[2 + x * 3] = Math.min(255, Math.round(33 + t * 173) + listra);
      linha[3 + x * 3] = Math.min(255, Math.round(66 + t * 145) + listra);
    }
    linhas.push(linha);
  }
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const tipoBuf = Buffer.from(tipo);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])));
    return Buffer.concat([tam, tipoBuf, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- PDF simples com texto ----------
function gerarPdf(linhas) {
  const texto = linhas
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
  const posicoes = [];
  objetos.forEach((o, i) => {
    posicoes.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ---------- DOCX mínimo (um ZIP com 3 arquivos XML) ----------
function gerarZip(arquivos) {
  const partes = [];
  const central = [];
  let posicao = 0;
  for (const [nome, conteudo] of arquivos) {
    const dados = Buffer.from(conteudo, 'utf8');
    const nomeBuf = Buffer.from(nome, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    partes.push(local, nomeBuf, dados);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(dados.length, 20);
    c.writeUInt32LE(dados.length, 24);
    c.writeUInt16LE(nomeBuf.length, 28);
    c.writeUInt32LE(posicao, 42);
    central.push(c, nomeBuf);
    posicao += 30 + nomeBuf.length + dados.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamCentral, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...partes, ...central, fim]);
}

function gerarDocx(titulo, paragrafos) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const p = (t, negrito = false, tam = 22) =>
    `<w:p><w:r><w:rPr>${negrito ? '<w:b/>' : ''}<w:sz w:val="${tam}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  const corpo = [p(titulo, true, 36), ...paragrafos.map((t) => (t.startsWith('# ') ? p(t.slice(2), true, 26) : p(t)))].join('');
  return gerarZip([
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
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`,
    ],
  ]);
}

// ---------- Criação dos anexos ----------

// Apaga só as subpastas de projetos (nomes de 24 caracteres hexadecimais) da pasta de uploads.
export async function limparUploads() {
  if (!fs.existsSync(PASTA_UPLOADS)) return;
  for (const nome of await fs.promises.readdir(PASTA_UPLOADS)) {
    if (/^[a-f0-9]{24}$/.test(nome)) await fs.promises.rm(path.join(PASTA_UPLOADS, nome), { recursive: true, force: true });
  }
}

export async function criarAnexosDeExemplo(projeto, porEmail, emDias) {
  const exemplos = [
    ['ata-kickoff-AHK.pdf', 'admin@taskly.local', -16, gerarPdf([
      'Ata da reuniao de kickoff - Plataforma AHK',
      'Participantes: Admin Taskly (Awakelab) e Laura Mendez (AHK)',
      'Objetivo: plataforma pronta para as turmas de janeiro.',
      'Combinado: Moodle 4.5, dominio proprio e tema com a identidade AHK.',
      'Cliente pediu informes de alunos e dashboard para o SEPE.',
      'Proximo passo: cliente envia logos, cores e lista de cursos.',
    ])],
    ['proposta-grafica-v1.png', 'maria@taskly.local', -9, gerarPng()],
    ['especificacao-dashboard-SEPE.docx', 'ana@taskly.local', -2, gerarDocx('Especificação – Dashboard administrativo SEPE', [
      '# Objetivo',
      'Reunir em uma tela os indicadores que o cliente precisa enviar ao SEPE: alunos matriculados, horas cursadas, avanço por curso e certificados emitidos.',
      '# Indicadores',
      'Alunos ativos por curso; horas de conexão por aluno; percentual de conclusão; alunos sem acesso há mais de 7 dias.',
      '# Fora do escopo',
      'A gestão do certificado SEPE continua com o cliente (ver acordo de especificações).',
    ])],
    ['checklist-implantacao.md', 'joao@taskly.local', -12, `# Checklist de implantação – Plataforma AHK

## Infraestrutura
- [x] DNS e subdomínios
- [x] Certificado SSL
- [x] Moodle 4.5 instalado

## Configuração
- [x] Idioma espanhol e fuso de Madrid
- [ ] Tema gráfico aplicado
- [ ] E-mails do sistema testados

> Observação: aguardando a escolha da proposta gráfica pelo cliente.
`],
    ['notas-reuniao-laura.txt', 'admin@taskly.local', -4, `Reunião rápida com Laura (AHK)

- Ela ainda está decidindo entre as duas propostas de layout.
- Pediu para manter o azul institucional.
- Vai enviar o modelo de relatório do SEPE até sexta.
`],
    ['planilha-alunos-modelo.csv', 'carla@taskly.local', -1, 'nome;email;curso;perfil\nAluno Exemplo;aluno@example.com;Prevenção de riscos;estudante\nTutora Exemplo;tutora@example.com;Prevenção de riscos;tutor\n'],
  ];

  const pasta = path.join(PASTA_UPLOADS, String(projeto._id));
  await fs.promises.mkdir(pasta, { recursive: true });
  const docs = [];
  for (const [nome, autor, dia, conteudo] of exemplos) {
    const ext = extensaoDe(nome);
    const arquivo = `${crypto.randomUUID()}.${ext}`;
    const dados = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8');
    await fs.promises.writeFile(path.join(pasta, arquivo), dados);
    docs.push({
      projeto: projeto._id,
      nome,
      tipo: classificar(nome),
      extensao: ext,
      mime: 'application/octet-stream',
      tamanho: dados.length,
      arquivo,
      enviadoPor: porEmail[autor]._id,
      createdAt: emDias(dia),
      updatedAt: emDias(dia),
    });
  }
  await Anexo.insertMany(docs, { timestamps: false });
  return docs.length;
}

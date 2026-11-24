// Anexos dos projetos: vídeos, imagens, documentos e outros arquivos.
// Os arquivos ficam no disco (pasta "uploads", uma subpasta por projeto) e os dados no MongoDB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Anexo } from '../models/Anexo.js';
import { env } from '../config/env.js';
import { ehAdmin } from '../middlewares/auth.js';
import { ErroHttp, exigirId } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { carregarProjeto } from '../utils/acesso.js';
import { ganchosExclusaoProjeto } from './projetos.js';
import { registrarEventoSistema } from './diario.js';

const RAIZ_API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PASTA_UPLOADS = env.pastaUploads ? path.resolve(env.pastaUploads) : path.join(RAIZ_API, 'uploads');
const MAX_ARQUIVOS_POR_ENVIO = 10;
const VALIDADE_LINK = '30m';

// ---------- Tipos de arquivo ----------
// extensão -> [tipo, visualizador (ou null = só baixar), content-type]
const EXTENSOES = {
  mp4: ['video', 'video', 'video/mp4'],
  m4v: ['video', 'video', 'video/mp4'],
  webm: ['video', 'video', 'video/webm'],
  ogv: ['video', 'video', 'video/ogg'],
  mov: ['video', 'video', 'video/quicktime'],
  avi: ['video', null, 'video/x-msvideo'],
  mkv: ['video', null, 'video/x-matroska'],
  png: ['imagem', 'imagem', 'image/png'],
  jpg: ['imagem', 'imagem', 'image/jpeg'],
  jpeg: ['imagem', 'imagem', 'image/jpeg'],
  gif: ['imagem', 'imagem', 'image/gif'],
  webp: ['imagem', 'imagem', 'image/webp'],
  bmp: ['imagem', 'imagem', 'image/bmp'],
  svg: ['imagem', 'imagem', 'image/svg+xml'],
  pdf: ['documento', 'pdf', 'application/pdf'],
  docx: ['documento', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['documento', null, 'application/msword'],
  odt: ['documento', null, 'application/vnd.oasis.opendocument.text'],
  rtf: ['documento', null, 'application/rtf'],
  txt: ['documento', 'texto', 'text/plain; charset=utf-8'],
  md: ['documento', 'markdown', 'text/plain; charset=utf-8'],
  markdown: ['documento', 'markdown', 'text/plain; charset=utf-8'],
};

export function extensaoDe(nome) {
  const ext = path.extname(String(nome || '')).slice(1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

export function classificar(nome) {
  const info = EXTENSOES[extensaoDe(nome)];
  return info ? info[0] : 'arquivo';
}

export function visualizadorDe(anexo) {
  return EXTENSOES[anexo.extensao]?.[1] || null;
}

function contentType(anexo) {
  return EXTENSOES[anexo.extensao]?.[2] || 'application/octet-stream';
}

function formatar(anexo) {
  const a = typeof anexo.toJSON === 'function' ? anexo.toJSON() : anexo;
  delete a.arquivo;
  return {
    ...a,
    visualizador: visualizadorDe(a),
    enviadoPor: a.enviadoPor?.nome ? { _id: a.enviadoPor._id, nome: a.enviadoPor.nome } : a.enviadoPor,
  };
}

ganchosExclusaoProjeto.push(async (idProjeto) => {
  await Anexo.deleteMany({ projeto: idProjeto });
  await fs.promises.rm(path.join(PASTA_UPLOADS, String(idProjeto)), { recursive: true, force: true });
});

// ---------- Envio (upload) ----------

const armazenamento = multer.diskStorage({
  destination(req, _arquivo, cb) {
    const pasta = path.join(PASTA_UPLOADS, String(req.projeto._id));
    fs.promises.mkdir(pasta, { recursive: true }).then(() => cb(null, pasta), cb);
  },
  filename(_req, arquivo, cb) {
    const ext = extensaoDe(arquivo.originalname);
    cb(null, `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`);
  },
});

const receberArquivos = multer({
  storage: armazenamento,
  defParamCharset: 'utf8', // nomes com acento chegam certos
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: MAX_ARQUIVOS_POR_ENVIO },
}).array('arquivos', MAX_ARQUIVOS_POR_ENVIO);

// Middleware: confere o acesso ao projeto ANTES de gravar qualquer arquivo.
export async function prepararEnvio(req, _res, next) {
  try {
    req.projeto = await carregarProjeto(req.params.id, req.usuario);
    next();
  } catch (erro) {
    next(erro);
  }
}

export function receber(req, res, next) {
  receberArquivos(req, res, (erro) => {
    if (!erro) return next();
    // Se algo deu errado no meio do envio, apaga o que já foi gravado.
    for (const f of req.files || []) fs.promises.unlink(f.path).catch(() => {});
    if (erro.code === 'LIMIT_FILE_SIZE') return next(new ErroHttp(413, `Arquivo muito grande. O máximo é ${env.maxUploadMb} MB por arquivo.`));
    if (erro.code === 'LIMIT_FILE_COUNT' || erro.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ErroHttp(400, `Envie no máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por vez.`));
    }
    next(new ErroHttp(400, `Não foi possível receber o arquivo: ${erro.message}`));
  });
}

export async function registrarEnvio(usuario, projeto, arquivos = [], descricao = '') {
  if (!arquivos.length) throw new ErroHttp(400, 'Escolha pelo menos um arquivo.');
  const docs = await Anexo.insertMany(
    arquivos.map((f) => ({
      projeto: projeto._id,
      nome: String(f.originalname || 'arquivo').slice(0, 255),
      tipo: classificar(f.originalname),
      extensao: extensaoDe(f.originalname),
      mime: f.mimetype || 'application/octet-stream',
      tamanho: f.size,
      arquivo: f.filename,
      descricao: String(descricao || '').slice(0, 1000),
      enviadoPor: usuario._id,
    }))
  );
  const nomes = docs.map((d) => d.nome);
  await registrarEventoSistema(
    projeto._id,
    `${usuario.nome} enviou ${docs.length === 1 ? 'o anexo' : `${docs.length} anexos`}: ${nomes.slice(0, 5).join(', ')}${nomes.length > 5 ? '…' : ''}`,
    { autor: usuario._id, categoria: 'observacao' }
  );
  return docs.map((d) => formatar({ ...d.toJSON(), enviadoPor: { _id: usuario._id, nome: usuario.nome } }));
}

// ---------- Consulta ----------

export async function listarAnexos(usuario, idProjeto, query = {}) {
  const projeto = await carregarProjeto(idProjeto, usuario);
  const filtro = { projeto: projeto._id };
  if (query.tipo && ['video', 'imagem', 'documento', 'arquivo'].includes(query.tipo)) filtro.tipo = query.tipo;
  if (query.busca) filtro.nome = new RegExp(escaparRegex(String(query.busca)), 'i');

  const [itens, contagens] = await Promise.all([
    Anexo.find(filtro).sort({ createdAt: -1 }).limit(1000).populate('enviadoPor', 'nome'),
    Anexo.aggregate([
      { $match: { projeto: projeto._id } },
      { $group: { _id: '$tipo', total: { $sum: 1 }, bytes: { $sum: '$tamanho' } } },
    ]),
  ]);
  const porTipo = { video: 0, imagem: 0, documento: 0, arquivo: 0 };
  let bytes = 0;
  for (const c of contagens) {
    porTipo[c._id] = c.total;
    bytes += c.bytes;
  }
  return {
    itens: itens.map(formatar),
    porTipo,
    total: Object.values(porTipo).reduce((a, b) => a + b, 0),
    bytes,
    maxUploadMb: env.maxUploadMb,
  };
}

async function carregarAnexo(usuario, id) {
  const anexo = await Anexo.findById(exigirId(id, 'id do anexo')).select('+arquivo');
  if (!anexo) throw new ErroHttp(404, 'Anexo não encontrado');
  await carregarProjeto(anexo.projeto, usuario);
  return anexo;
}

// Link temporário (30 min) para ver ou baixar. Necessário porque <img>, <video> e
// downloads não conseguem mandar o cabeçalho de login.
export async function linkTemporario(usuario, id) {
  const anexo = await carregarAnexo(usuario, id);
  const token = jwt.sign({ uso: 'anexo', a: String(anexo._id), u: String(usuario._id) }, env.jwtSecret, { expiresIn: VALIDADE_LINK });
  const caminho = `/arquivos/${anexo._id}?t=${encodeURIComponent(token)}`;
  return { ver: caminho, baixar: `${caminho}&baixar=1`, visualizador: visualizadorDe(anexo) };
}

export async function excluirAnexo(usuario, id) {
  const anexo = await carregarAnexo(usuario, id);
  if (!ehAdmin(usuario) && String(anexo.enviadoPor) !== String(usuario._id)) {
    throw new ErroHttp(403, 'Você só pode excluir os anexos que enviou');
  }
  await fs.promises.unlink(path.join(PASTA_UPLOADS, String(anexo.projeto), anexo.arquivo)).catch(() => {});
  await anexo.deleteOne();
  return { excluido: true, nome: anexo.nome };
}

// ---------- Entrega do arquivo (com suporte a vídeo "pulando" para qualquer ponto) ----------

export async function servirArquivo(req, res, next) {
  try {
    let dados;
    try {
      dados = jwt.verify(String(req.query.t || ''), env.jwtSecret);
    } catch {
      throw new ErroHttp(401, 'Link expirado ou inválido. Abra o anexo de novo pelo Taskly.');
    }
    if (dados.uso !== 'anexo' || dados.a !== req.params.id) throw new ErroHttp(401, 'Link inválido.');

    const anexo = await Anexo.findById(exigirId(req.params.id)).select('+arquivo');
    if (!anexo) throw new ErroHttp(404, 'Anexo não encontrado');
    const caminho = path.join(PASTA_UPLOADS, String(anexo.projeto), anexo.arquivo);
    if (!caminho.startsWith(PASTA_UPLOADS + path.sep)) throw new ErroHttp(400, 'Caminho inválido');
    if (!fs.existsSync(caminho)) throw new ErroHttp(404, 'O arquivo não está mais no servidor.');

    const inline = Boolean(visualizadorDe(anexo)) && req.query.baixar !== '1';
    const nomeSeguro = anexo.nome.replace(/["\\\r\n]/g, '_');
    const cabecalhos = {
      'Content-Type': inline ? contentType(anexo) : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nomeSeguro.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=1800',
    };
    // SVG pode conter scripts: abre "isolado" (sem executar nada).
    if (anexo.extensao === 'svg') cabecalhos['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    res.sendFile(caminho, { headers: cabecalhos }, (erro) => {
      if (erro && !res.headersSent) next(erro);
    });
  } catch (erro) {
    next(erro);
  }
}

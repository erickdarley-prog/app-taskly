// Envio de e-mails em nome do usuário logado.
// Ordem: 1) e-mail configurado pelo usuário em "Minha conta"
//        2) e-mail geral do .env (SMTP_*), com resposta indo para o usuário
//        3) MODO TESTE: o e-mail é gerado e guardado, mas não sai do computador
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Usuario } from '../models/Usuario.js';
import { ErroHttp } from '../utils/http.js';

// ---------- Cifra das senhas de e-mail guardadas no banco ----------
const chave = crypto.createHash('sha256').update(String(env.chaveCifra)).digest();

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([cifra.update(String(texto), 'utf8'), cifra.final()]);
  return [iv, cifra.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

export function decifrar(valor) {
  const [iv, tag, dados] = String(valor).split('.').map((p) => Buffer.from(p, 'base64'));
  const decifra = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
}

// ---------- Escolha de como enviar ----------
let transporteTeste = null; // permite trocar nos testes automatizados

export function definirTransporteTeste(t) {
  transporteTeste = t;
}

async function montarEnvio(idUsuario) {
  const usuario = await Usuario.findById(idUsuario).select('+emailEnvio.senhaCifrada');
  if (!usuario) throw new ErroHttp(404, 'Usuário remetente não encontrado');
  const cfg = usuario.emailEnvio || {};

  if (cfg.host && cfg.usuario && cfg.senhaCifrada) {
    let senha;
    try {
      senha = decifrar(cfg.senhaCifrada);
    } catch {
      throw new ErroHttp(400, 'Não foi possível ler a senha do seu e-mail de envio. Configure de novo em "Minha conta".');
    }
    return {
      modo: 'pessoal',
      de: `"${cfg.nomeRemetente || usuario.nome}" <${cfg.usuario}>`,
      responderPara: undefined,
      transporte:
        transporteTeste ||
        nodemailer.createTransport({ host: cfg.host, port: cfg.porta, secure: cfg.seguro, auth: { user: cfg.usuario, pass: senha } }),
      usuario,
    };
  }

  if (env.smtp.host && env.smtp.usuario) {
    return {
      modo: 'geral',
      de: `"${usuario.nome} (via Taskly)" <${env.smtp.remetente || env.smtp.usuario}>`,
      responderPara: usuario.email,
      transporte:
        transporteTeste ||
        nodemailer.createTransport({
          host: env.smtp.host,
          port: env.smtp.porta,
          secure: env.smtp.seguro,
          auth: { user: env.smtp.usuario, pass: env.smtp.senha },
        }),
      usuario,
    };
  }

  return {
    modo: 'teste',
    de: `"${usuario.nome}" <${usuario.email}>`,
    responderPara: undefined,
    transporte: nodemailer.createTransport({ jsonTransport: true }),
    usuario,
  };
}

// Envia (ou simula) e devolve um registro completo do e-mail, para guardar como comprovante.
export async function enviarEmail(idRemetente, { para, assunto, html, texto }) {
  const envio = await montarEnvio(idRemetente);
  const destinatarios = Array.isArray(para) ? para : [para];
  let info;
  try {
    info = await envio.transporte.sendMail({
      from: envio.de,
      to: destinatarios.join(', '),
      replyTo: envio.responderPara,
      subject: assunto,
      html,
      text: texto,
    });
  } catch (erro) {
    console.error('[email] falha ao enviar:', erro.message);
    throw new ErroHttp(
      502,
      `Não foi possível enviar o e-mail (${erro.code || erro.message}). Confira a configuração do e-mail de envio em "Minha conta".`
    );
  }
  return {
    modo: envio.modo,
    de: envio.de,
    para: destinatarios,
    assunto,
    html,
    enviadoEm: new Date(),
    idMensagem: info?.messageId || '',
  };
}

// ---------- Configuração pelo próprio usuário ----------
export async function obterConfigEmail(usuario) {
  const u = await Usuario.findById(usuario._id);
  const cfg = u.emailEnvio || {};
  return {
    host: cfg.host || '',
    porta: cfg.porta || 587,
    seguro: Boolean(cfg.seguro),
    usuario: cfg.usuario || '',
    nomeRemetente: cfg.nomeRemetente || '',
    configurado: Boolean(cfg.host && cfg.usuario),
    emailGeralDisponivel: Boolean(env.smtp.host && env.smtp.usuario),
  };
}

export async function salvarConfigEmail(usuario, corpo = {}) {
  const u = await Usuario.findById(usuario._id).select('+emailEnvio.senhaCifrada');
  if (corpo.remover) {
    u.emailEnvio = { host: '', porta: 587, seguro: false, usuario: '', senhaCifrada: '', nomeRemetente: '' };
    await u.save();
    return obterConfigEmail(usuario);
  }
  const host = String(corpo.host || '').trim();
  const usuarioEmail = String(corpo.usuario || '').trim();
  const porta = Number(corpo.porta) || 587;
  if (!host || !usuarioEmail) throw new ErroHttp(400, 'Informe o servidor (host) e o e-mail/usuário da conta');
  if (porta < 1 || porta > 65535) throw new ErroHttp(400, 'Porta inválida');
  const senhaNova = corpo.senha ? String(corpo.senha) : '';
  if (!senhaNova && !u.emailEnvio?.senhaCifrada) throw new ErroHttp(400, 'Informe a senha (ou senha de app) do e-mail');

  u.emailEnvio = {
    host,
    porta,
    seguro: Boolean(corpo.seguro),
    usuario: usuarioEmail,
    nomeRemetente: String(corpo.nomeRemetente || '').trim(),
    senhaCifrada: senhaNova ? cifrar(senhaNova) : u.emailEnvio.senhaCifrada,
  };
  await u.save();
  return obterConfigEmail(usuario);
}

export async function enviarEmailDeTeste(usuario) {
  const r = await enviarEmail(usuario._id, {
    para: usuario.email,
    assunto: 'Taskly – e-mail de teste',
    html: `<p>Olá, ${escaparHtml(usuario.nome)}!</p><p>Se você recebeu esta mensagem, o envio de e-mails do Taskly está funcionando.</p>`,
    texto: `Olá, ${usuario.nome}! Se você recebeu esta mensagem, o envio de e-mails do Taskly está funcionando.`,
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

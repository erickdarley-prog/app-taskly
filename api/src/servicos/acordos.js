// Escopo do projeto (o que vai / o que não vai) e o acordo assinado pelas duas partes.
import crypto from 'node:crypto';
import { Acordo } from '../models/Acordo.js';
import { Projeto } from '../models/Projeto.js';
import { Usuario } from '../models/Usuario.js';
import { env } from '../config/env.js';
import { ErroHttp, exigirId } from '../utils/http.js';
import { carregarProjeto } from '../utils/acesso.js';
import { exigirAdmin, ganchosExclusaoProjeto } from './projetos.js';
import { enviarEmail, escaparHtml } from './email.js';
import { registrarEventoSistema } from './diario.js';

ganchosExclusaoProjeto.push((idProjeto) => Acordo.deleteMany({ projeto: idProjeto }));

const VALIDADE_LINK_DIAS = 30;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function formatarDataHora(d) {
  return new Date(d).toLocaleString('pt-BR', { timeZone: env.fuso, dateStyle: 'short', timeStyle: 'short' });
}

function normalizarItens(lista, nome) {
  if (lista === undefined) return undefined;
  if (!Array.isArray(lista)) throw new ErroHttp(400, `${nome} deve ser uma lista`);
  const itens = lista
    .map((i) => String(typeof i === 'string' ? i : i?.texto || '').trim())
    .filter(Boolean)
    .map((texto) => ({ texto: texto.slice(0, 500) }));
  if (itens.length > 200) throw new ErroHttp(400, `Máximo de 200 itens em ${nome}`);
  return itens;
}

// ---------- Consulta ----------

export async function listarAcordos(usuario, idProjeto) {
  const projeto = await carregarProjeto(idProjeto, usuario, { popular: true });
  const versoes = await Acordo.find({ projeto: projeto._id })
    .sort({ versao: -1 })
    .populate('criadoPor', 'nome')
    .populate('enviadoPor', 'nome')
    .lean();
  const vigente = versoes.find((v) => v.status === 'assinado') || null;
  const emAndamento = versoes.find((v) => v.status === 'rascunho' || v.status === 'aguardando') || null;
  return {
    responsavelEmpresa: projeto.responsavel ? { _id: projeto.responsavel._id, nome: projeto.responsavel.nome } : null,
    responsavelCliente: projeto.responsavelCliente || null,
    vigente,
    emAndamento,
    versoes: versoes.map((v) => ({ ...v, emails: (v.emails || []).map(({ html, ...resto }) => resto) })),
  };
}

export async function carregarAcordo(usuario, id) {
  const acordo = await Acordo.findById(exigirId(id, 'id do acordo'));
  if (!acordo) throw new ErroHttp(404, 'Acordo não encontrado');
  const projeto = await carregarProjeto(acordo.projeto, usuario);
  return { acordo, projeto };
}

// Comprovante completo: conteúdo, assinaturas e os e-mails enviados (com o HTML).
export async function comprovante(usuario, id) {
  const { acordo } = await carregarAcordo(usuario, id);
  await acordo.populate([
    { path: 'projeto', select: 'nome cliente' },
    { path: 'enviadoPor', select: 'nome email' },
  ]);
  return acordo;
}

// ---------- Edição (rascunho) ----------

// Devolve a versão em edição; se não houver, cria uma nova a partir da versão mais recente.
export async function abrirRascunho(usuario, idProjeto) {
  exigirAdmin(usuario, 'Apenas administradores podem alterar o escopo');
  const projeto = await carregarProjeto(idProjeto, usuario);
  const aberta = await Acordo.findOne({ projeto: projeto._id, status: { $in: ['rascunho', 'aguardando'] } });
  if (aberta?.status === 'rascunho') return aberta;
  if (aberta?.status === 'aguardando') {
    throw new ErroHttp(409, `A versão ${aberta.versao} está aguardando assinatura. Cancele o envio para poder alterar o escopo.`);
  }
  // Parte do conteúdo da versão mais recente (assinada ou cancelada), para não perder nada.
  const ultima = await Acordo.findOne({ projeto: projeto._id }).sort({ versao: -1 });
  const base = ultima;
  return Acordo.create({
    projeto: projeto._id,
    versao: (ultima?.versao || 0) + 1,
    status: 'rascunho',
    incluidos: base?.incluidos?.map((i) => ({ texto: i.texto })) || [],
    naoIncluidos: base?.naoIncluidos?.map((i) => ({ texto: i.texto })) || [],
    observacoes: base?.observacoes || '',
    criadoPor: usuario._id,
  });
}

export async function atualizarRascunho(usuario, id, corpo = {}) {
  exigirAdmin(usuario, 'Apenas administradores podem alterar o escopo');
  const { acordo } = await carregarAcordo(usuario, id);
  if (acordo.status !== 'rascunho') throw new ErroHttp(409, 'Só é possível alterar uma versão em rascunho');
  const incluidos = normalizarItens(corpo.incluidos, 'incluídos');
  const naoIncluidos = normalizarItens(corpo.naoIncluidos, 'não incluídos');
  if (incluidos) acordo.incluidos = incluidos;
  if (naoIncluidos) acordo.naoIncluidos = naoIncluidos;
  if (corpo.observacoes !== undefined) acordo.observacoes = String(corpo.observacoes || '').trim();
  await acordo.save();
  return acordo;
}

// Atalho para o chat: adiciona/remove itens no rascunho (cria o rascunho se preciso).
export async function alterarItensDoEscopo(usuario, idProjeto, { adicionarIncluidos = [], adicionarNaoIncluidos = [], remover = [] }) {
  const rascunho = await abrirRascunho(usuario, idProjeto);
  const tirar = new Set(remover.map((r) => String(r).trim().toLowerCase()));
  const filtrar = (lista) => lista.filter((i) => !tirar.has(i.texto.toLowerCase()));
  const incluidos = [...filtrar(rascunho.incluidos), ...adicionarIncluidos.map((texto) => ({ texto }))];
  const naoIncluidos = [...filtrar(rascunho.naoIncluidos), ...adicionarNaoIncluidos.map((texto) => ({ texto }))];
  return atualizarRascunho(usuario, rascunho._id, { incluidos, naoIncluidos });
}

// ---------- Envio e assinaturas ----------

function linkDoCliente(token) {
  return `${env.appUrl}/acordo/${token}`;
}

function htmlLista(itens, vazio) {
  if (!itens.length) return `<p style="color:#5b6b84;margin:4px 0 0">${vazio}</p>`;
  return `<ul style="margin:6px 0 0;padding-left:20px">${itens.map((i) => `<li style="margin:3px 0">${escaparHtml(i.texto)}</li>`).join('')}</ul>`;
}

function htmlPedido({ projeto, acordo, remetente, link }) {
  const nomeCliente = escaparHtml(acordo.cliente.nome || 'cliente');
  return `<!doctype html><html><body style="margin:0;background:#f0f3fc;font-family:Arial,Helvetica,sans-serif;color:#14213a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#012142;color:#19f7f1;padding:18px 24px;font-size:18px;font-weight:bold">Acordo de especificações – versão ${acordo.versao}</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px">Olá, ${nomeCliente}.</p>
<p style="margin:0 0 16px">Segue o acordo de especificações do projeto <strong>${escaparHtml(projeto.nome)}</strong>${projeto.cliente ? ` (${escaparHtml(projeto.cliente)})` : ''}. Por favor, revise o que <strong>está</strong> e o que <strong>não está</strong> incluído.</p>
<h3 style="margin:18px 0 0;color:#127a52;font-size:15px">✔ Incluído no projeto</h3>
${htmlLista(acordo.incluidos, 'Nenhum item.')}
<h3 style="margin:18px 0 0;color:#b42318;font-size:15px">✘ Não incluído no projeto</h3>
${htmlLista(acordo.naoIncluidos, 'Nenhum item.')}
${acordo.observacoes ? `<h3 style="margin:18px 0 0;font-size:15px">Observações</h3><p style="margin:6px 0 0;white-space:pre-line">${escaparHtml(acordo.observacoes)}</p>` : ''}
<p style="margin:24px 0 8px">Se estiver de acordo, clique no botão abaixo:</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#0fced3;color:#012142;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Concordo com o acordo</a></p>
<p style="margin:0;color:#5b6b84;font-size:13px">O link vale por ${VALIDADE_LINK_DIAS} dias. Se não concordar com algum ponto, responda este e-mail para ${escaparHtml(remetente.nome)}.<br>Qualquer alteração futura no escopo gera uma nova versão, que precisará de uma nova concordância.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function textoPedido({ projeto, acordo, link }) {
  const lista = (itens) => (itens.length ? itens.map((i) => `- ${i.texto}`).join('\n') : '(nenhum)');
  return `Acordo de especificações – versão ${acordo.versao}\nProjeto: ${projeto.nome}\n\nINCLUÍDO:\n${lista(acordo.incluidos)}\n\nNÃO INCLUÍDO:\n${lista(acordo.naoIncluidos)}\n\nPara concordar, acesse: ${link}`;
}

function htmlConfirmacao({ projeto, acordo }) {
  const a = acordo.assinaturaCliente;
  const e = acordo.assinaturaEmpresa;
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#14213a">
<h2 style="color:#012142">Concordância registrada</h2>
<p><strong>${escaparHtml(a.nome || a.email)}</strong> (${escaparHtml(a.email)}) concordou com o acordo de especificações <strong>versão ${acordo.versao}</strong> do projeto <strong>${escaparHtml(projeto.nome)}</strong> em ${formatarDataHora(a.em)}.</p>
<p>${e?.em ? `Assinatura da Awakelab: ${escaparHtml(e.nome)} em ${formatarDataHora(e.em)}. <strong>Acordo assinado pelas duas partes.</strong>` : 'Aguardando a assinatura do responsável da Awakelab.'}</p>
<h3 style="color:#127a52">Incluído</h3>${htmlLista(acordo.incluidos, 'Nenhum item.')}
<h3 style="color:#b42318">Não incluído</h3>${htmlLista(acordo.naoIncluidos, 'Nenhum item.')}
<p style="color:#5b6b84;font-size:12px">Registro: IP ${escaparHtml(a.ip || '—')}. Este e-mail fica anexado ao projeto como comprovante.</p>
</body></html>`;
}

async function finalizarSeCompleto(acordo, projeto) {
  if (!acordo.assinaturaEmpresa?.em || !acordo.assinaturaCliente?.em) return false;
  await Acordo.updateMany({ projeto: projeto._id, status: 'assinado', _id: { $ne: acordo._id } }, { status: 'substituido' });
  acordo.status = 'assinado';
  acordo.assinadoEm = new Date();
  await acordo.save();
  await registrarEventoSistema(projeto._id, `Acordo de especificações versão ${acordo.versao} assinado pelas duas partes.`, { categoria: 'cliente' });
  return true;
}

export async function enviarParaAssinatura(usuario, id) {
  exigirAdmin(usuario, 'Apenas administradores podem enviar o acordo');
  const { acordo, projeto } = await carregarAcordo(usuario, id);
  if (acordo.status !== 'rascunho') throw new ErroHttp(409, 'Só é possível enviar uma versão em rascunho');
  if (!acordo.incluidos.length && !acordo.naoIncluidos.length) throw new ErroHttp(400, 'O escopo está vazio. Adicione os itens antes de enviar.');
  const rc = projeto.responsavelCliente || {};
  if (!rc.email) throw new ErroHttp(400, 'Cadastre o e-mail do responsável do cliente no projeto (Editar projeto) antes de enviar.');

  const token = crypto.randomBytes(32).toString('base64url');
  acordo.cliente = { nome: rc.nome, email: rc.email, cargo: rc.cargo };
  acordo.tokenHash = hash(token);
  acordo.tokenExpiraEm = new Date(Date.now() + VALIDADE_LINK_DIAS * 24 * 3600 * 1000);
  acordo.enviadoPor = usuario._id;
  acordo.enviadoEm = new Date();
  acordo.assinaturaEmpresa = undefined;
  acordo.assinaturaCliente = undefined;

  const link = linkDoCliente(token);
  const email = await enviarEmail(usuario._id, {
    para: rc.email,
    assunto: `Acordo de especificações – ${projeto.nome} (versão ${acordo.versao})`,
    html: htmlPedido({ projeto, acordo, remetente: usuario, link }),
    texto: textoPedido({ projeto, acordo, link }),
  });
  // A cópia guardada não leva o link real (quem vê o comprovante não deve poder "assinar pelo cliente").
  acordo.emails.push({ tipo: 'pedido', ...email, html: email.html.split(link).join('#link-de-concordancia') });
  acordo.status = 'aguardando';
  await acordo.save();
  await registrarEventoSistema(projeto._id, `Acordo versão ${acordo.versao} enviado para ${rc.nome || rc.email} (${rc.email}) assinar.`, {
    autor: usuario._id,
    categoria: 'cliente',
  });

  // Em modo teste o e-mail não sai do computador: devolvemos o link para simular o clique do cliente.
  return { acordo, modoEmail: email.modo, linkTeste: email.modo === 'teste' ? link : undefined };
}

export async function cancelarEnvio(usuario, id) {
  exigirAdmin(usuario, 'Apenas administradores podem cancelar');
  const { acordo, projeto } = await carregarAcordo(usuario, id);
  if (!['aguardando', 'rascunho'].includes(acordo.status)) throw new ErroHttp(409, 'Esta versão não pode ser cancelada');
  const estava = acordo.status;
  acordo.status = 'cancelado';
  await acordo.save();
  if (estava === 'aguardando') {
    await registrarEventoSistema(projeto._id, `Envio do acordo versão ${acordo.versao} cancelado.`, { autor: usuario._id, categoria: 'cliente' });
  }
  return acordo;
}

// Assinatura da Awakelab: só o responsável do projeto (lado empresa), pelo botão no sistema.
export async function assinarPelaEmpresa(usuario, id, ip) {
  const { acordo, projeto } = await carregarAcordo(usuario, id);
  if (String(projeto.responsavel) !== String(usuario._id)) {
    throw new ErroHttp(403, 'Só o responsável do projeto pela Awakelab pode assinar o acordo');
  }
  if (acordo.status !== 'aguardando') throw new ErroHttp(409, 'Envie o acordo para o cliente antes de assinar');
  if (acordo.assinaturaEmpresa?.em) throw new ErroHttp(409, 'Você já assinou esta versão');
  acordo.assinaturaEmpresa = { usuario: usuario._id, nome: usuario.nome, email: usuario.email, em: new Date(), ip };
  await acordo.save();
  await registrarEventoSistema(projeto._id, `${usuario.nome} assinou o acordo versão ${acordo.versao} pela Awakelab.`, {
    autor: usuario._id,
    categoria: 'cliente',
  });
  await finalizarSeCompleto(acordo, projeto);
  return acordo;
}

// ---------- Página pública do cliente (sem login) ----------

async function acordoPorToken(token) {
  if (!token || String(token).length < 20) throw new ErroHttp(404, 'Link inválido');
  const acordo = await Acordo.findOne({ tokenHash: hash(String(token)) }).select('+tokenHash');
  if (!acordo) throw new ErroHttp(404, 'Este link não é válido ou o acordo foi substituído/cancelado.');
  const projeto = await Projeto.findById(acordo.projeto).populate('responsavel', 'nome');
  return { acordo, projeto };
}

function visaoPublica(acordo, projeto) {
  return {
    projeto: projeto.nome,
    cliente: projeto.cliente || '',
    versao: acordo.versao,
    status: acordo.status,
    incluidos: acordo.incluidos.map((i) => i.texto),
    naoIncluidos: acordo.naoIncluidos.map((i) => i.texto),
    observacoes: acordo.observacoes || '',
    destinatario: acordo.cliente?.nome || acordo.cliente?.email || '',
    responsavelEmpresa: projeto.responsavel?.nome || '',
    assinadoPeloCliente: acordo.assinaturaCliente?.em || null,
    assinadoPelaEmpresa: acordo.assinaturaEmpresa?.em || null,
    expiraEm: acordo.tokenExpiraEm,
  };
}

export async function verAcordoPublico(token) {
  const { acordo, projeto } = await acordoPorToken(token);
  return visaoPublica(acordo, projeto);
}

export async function concordarPublico(token, { ip, navegador }) {
  const { acordo, projeto } = await acordoPorToken(token);
  if (acordo.status !== 'aguardando') throw new ErroHttp(409, 'Este acordo não está mais aguardando assinatura.');
  if (acordo.tokenExpiraEm && acordo.tokenExpiraEm < new Date()) {
    throw new ErroHttp(410, 'Este link expirou. Peça à Awakelab um novo envio.');
  }
  if (acordo.assinaturaCliente?.em) return visaoPublica(acordo, projeto); // clique repetido: nada muda

  acordo.assinaturaCliente = {
    nome: acordo.cliente?.nome,
    email: acordo.cliente?.email,
    em: new Date(),
    ip,
    navegador: String(navegador || '').slice(0, 300),
  };
  await acordo.save();
  await registrarEventoSistema(
    projeto._id,
    `${acordo.cliente?.nome || acordo.cliente?.email} (cliente) concordou com o acordo versão ${acordo.versao} pelo e-mail.`,
    { categoria: 'cliente' }
  );
  await finalizarSeCompleto(acordo, projeto);

  // E-mail de confirmação para o cliente e para quem enviou: fica anexado como comprovante.
  try {
    const remetente = await Usuario.findById(acordo.enviadoPor).select('email');
    const email = await enviarEmail(acordo.enviadoPor, {
      para: [acordo.cliente.email, remetente?.email].filter(Boolean),
      assunto: `Confirmação: acordo de especificações – ${projeto.nome} (versão ${acordo.versao})`,
      html: htmlConfirmacao({ projeto, acordo }),
      texto: `${acordo.cliente.nome || acordo.cliente.email} concordou com o acordo versão ${acordo.versao} do projeto ${projeto.nome} em ${formatarDataHora(acordo.assinaturaCliente.em)}.`,
    });
    acordo.emails.push({ tipo: 'confirmacao', ...email });
    await acordo.save();
  } catch (erro) {
    console.error('[acordo] concordância registrada, mas o e-mail de confirmação falhou:', erro.message);
  }
  return visaoPublica(acordo, projeto);
}

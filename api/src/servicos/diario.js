// Diário do projeto: registros por dia (manuais e automáticos) + mudanças nas tarefas.
import { RegistroDiario, CATEGORIAS_DIARIO } from '../models/RegistroDiario.js';
import { Historico } from '../models/Historico.js';
import { Marco } from '../models/Marco.js';
import { env } from '../config/env.js';
import { ehAdmin } from '../middlewares/auth.js';
import { ErroHttp, escolher, exigirId } from '../utils/http.js';
import { carregarProjeto } from '../utils/acesso.js';
import { ganchosExclusaoProjeto } from './projetos.js';

ganchosExclusaoProjeto.push((idProjeto) => RegistroDiario.deleteMany({ projeto: idProjeto }));

const ROTULO_STATUS = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída' };

// "AAAA-MM-DD" do dia, no fuso configurado.
export function diaDe(data) {
  return new Date(data).toLocaleDateString('en-CA', { timeZone: env.fuso });
}

// Converte "AAAA-MM-DD" para o meio-dia daquele dia (evita trocar de dia por fuso).
function lerDia(valor, campo = 'data') {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const texto = String(valor).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(texto);
  if (Number.isNaN(d.getTime())) throw new ErroHttp(400, `Data inválida em ${campo}`);
  return d;
}

function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return diaDe(d);
}

export function registrarEventoSistema(idProjeto, texto, { autor, categoria = 'observacao' } = {}) {
  return RegistroDiario.create({ projeto: idProjeto, data: new Date(), texto, categoria, autor, tipo: 'sistema' });
}

function descreverHistorico(h) {
  const titulo = h.tarefa?.titulo ? `"${h.tarefa.titulo}"` : 'uma tarefa';
  const d = h.detalhes || {};
  switch (h.acao) {
    case 'criou':
      return `criou a tarefa ${titulo}`;
    case 'status':
      return `mudou ${titulo} de ${ROTULO_STATUS[d.de] || d.de} para ${ROTULO_STATUS[d.para] || d.para}`;
    case 'horas':
      return `lançou ${d.horas} h em ${titulo}${d.nota ? ` — ${d.nota}` : ''}`;
    case 'editou':
      return `editou ${titulo}`;
    default:
      return `${h.acao} ${titulo}`;
  }
}

// Diário agrupado por dia, do mais recente para o mais antigo, num intervalo de dias.
export async function obterDiario(usuario, idProjeto, query = {}) {
  const projeto = await carregarProjeto(idProjeto, usuario);
  const ate = query.ate && /^\d{4}-\d{2}-\d{2}$/.test(query.ate) ? query.ate : diaDe(new Date());
  const dias = Math.min(90, Math.max(1, parseInt(query.dias, 10) || 30));
  const de = somarDias(ate, -(dias - 1));
  const inicio = new Date(`${de}T00:00:00`);
  inicio.setHours(inicio.getHours() - 14); // folga para diferenças de fuso
  const fim = new Date(`${ate}T23:59:59`);
  fim.setHours(fim.getHours() + 14);

  const incluirAutomaticos = query.automaticos !== 'false';
  const [registros, historicos] = await Promise.all([
    RegistroDiario.find({ projeto: projeto._id, data: { $gte: inicio, $lte: fim }, ...(incluirAutomaticos ? {} : { tipo: 'manual' }) })
      .sort({ data: -1, createdAt: -1 })
      .limit(2000)
      .populate('autor', 'nome')
      .populate('marco', 'titulo')
      .lean(),
    incluirAutomaticos
      ? Historico.find({ projeto: projeto._id, acao: { $in: ['status', 'criou', 'horas'] }, createdAt: { $gte: inicio, $lte: fim } })
          .sort({ createdAt: -1 })
          .limit(2000)
          .populate('usuario', 'nome')
          .populate('tarefa', 'titulo')
          .lean()
      : [],
  ]);

  const itens = [
    ...registros.map((r) => ({
      id: String(r._id),
      dia: diaDe(r.data),
      quando: r.createdAt,
      tipo: r.tipo,
      categoria: r.categoria,
      texto: r.texto,
      autor: r.autor?.nome || null,
      autorId: r.autor?._id ? String(r.autor._id) : null,
      marco: r.marco?.titulo || null,
      marcoId: r.marco?._id ? String(r.marco._id) : null,
    })),
    ...historicos.map((h) => ({
      id: `h${h._id}`,
      dia: diaDe(h.createdAt),
      quando: h.createdAt,
      tipo: 'tarefa',
      categoria: 'avanco',
      texto: descreverHistorico(h),
      autor: h.usuario?.nome || null,
    })),
  ].filter((i) => i.dia >= de && i.dia <= ate);

  const porDia = new Map();
  for (const item of itens.sort((a, b) => (a.dia === b.dia ? new Date(b.quando) - new Date(a.quando) : a.dia < b.dia ? 1 : -1))) {
    if (!porDia.has(item.dia)) porDia.set(item.dia, []);
    porDia.get(item.dia).push(item);
  }

  return {
    de,
    ate,
    anterior: somarDias(de, -1), // use como "ate" para carregar os dias anteriores
    dias: [...porDia.entries()].map(([dia, lista]) => ({ dia, itens: lista })),
  };
}

const CAMPOS = ['data', 'texto', 'categoria', 'marco'];

async function validar(projeto, dados) {
  if (dados.data !== undefined) dados.data = lerDia(dados.data) || new Date();
  if (dados.categoria !== undefined && !CATEGORIAS_DIARIO.includes(dados.categoria)) {
    throw new ErroHttp(400, 'Categoria inválida');
  }
  if (dados.marco === '' || dados.marco === null) dados.marco = null;
  else if (dados.marco !== undefined) {
    const existe = await Marco.exists({ _id: exigirId(dados.marco, 'marco'), projeto: projeto._id });
    if (!existe) throw new ErroHttp(400, 'O marco informado não pertence a este projeto');
  }
}

// Qualquer participante do projeto pode escrever no diário.
export async function criarRegistro(usuario, idProjeto, corpo) {
  const projeto = await carregarProjeto(idProjeto, usuario);
  const dados = escolher(corpo || {}, CAMPOS);
  if (!String(dados.texto || '').trim()) throw new ErroHttp(400, 'Escreva o que aconteceu (observações)');
  await validar(projeto, dados);
  if (!dados.data) dados.data = new Date();
  if (!dados.marco) delete dados.marco;
  return RegistroDiario.create({ ...dados, projeto: projeto._id, autor: usuario._id, tipo: 'manual' });
}

async function carregarRegistro(usuario, id) {
  const registro = await RegistroDiario.findById(exigirId(id, 'id do registro'));
  if (!registro) throw new ErroHttp(404, 'Registro não encontrado');
  const projeto = await carregarProjeto(registro.projeto, usuario);
  if (registro.tipo === 'sistema') throw new ErroHttp(400, 'Registros automáticos não podem ser alterados');
  if (!ehAdmin(usuario) && String(registro.autor) !== String(usuario._id)) {
    throw new ErroHttp(403, 'Você só pode alterar os registros que escreveu');
  }
  return { registro, projeto };
}

export async function atualizarRegistro(usuario, id, corpo) {
  const { registro, projeto } = await carregarRegistro(usuario, id);
  const dados = escolher(corpo || {}, CAMPOS);
  await validar(projeto, dados);
  if (dados.marco === null) {
    delete dados.marco;
    registro.marco = undefined;
  }
  Object.assign(registro, dados);
  await registro.save();
  return registro;
}

export async function excluirRegistro(usuario, id) {
  const { registro } = await carregarRegistro(usuario, id);
  await registro.deleteOne();
  return { excluido: true };
}

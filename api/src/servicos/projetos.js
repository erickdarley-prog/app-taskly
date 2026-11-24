// Regras de negócio de projetos e tarefas do projeto.
// Usadas tanto pelas rotas (botões) quanto pelo assistente de chat,
// para que as permissões sejam exatamente as mesmas nos dois caminhos.
import { Projeto, STATUS_PROJETO } from '../models/Projeto.js';
import { Tarefa, STATUS_TAREFA, PRIORIDADES, LADOS } from '../models/Tarefa.js';
import { Usuario } from '../models/Usuario.js';
import { Historico } from '../models/Historico.js';
import { Marco } from '../models/Marco.js';
import { ehAdmin } from '../middlewares/auth.js';
import { ErroHttp, escolher, exigirId, paginacao, respostaPaginada } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { carregarProjeto, filtroProjetosVisiveis, participaDoProjeto } from '../utils/acesso.js';
import { andamentoDoProjeto, resumoDosProjetos } from '../utils/andamento.js';
import { registrarHistorico } from '../utils/historico.js';

export const CAMPOS_PROJETO = [
  'nome',
  'descricao',
  'cliente',
  'responsavel',
  'responsavelCliente',
  'integrantes',
  'status',
  'dataInicio',
  'prazo',
];
export const CAMPOS_TAREFA = [
  'titulo',
  'descricao',
  'responsavel',
  'responsavelExterno',
  'lado',
  'marco',
  'status',
  'prioridade',
  'prazo',
  'horasEstimadas',
];

// Outros módulos (acordos, diário) registram aqui o que apagar junto com o projeto.
export const ganchosExclusaoProjeto = [];

export function exigirAdmin(usuario, mensagem = 'Apenas administradores podem fazer isso') {
  if (!ehAdmin(usuario)) throw new ErroHttp(403, mensagem);
}

// Confere se responsável e integrantes existem e remove duplicados.
async function validarPessoas(dados) {
  if (dados.responsavelCliente !== undefined) {
    const rc = dados.responsavelCliente || {};
    dados.responsavelCliente = {
      nome: String(rc.nome || '').trim(),
      email: String(rc.email || '').trim().toLowerCase(),
      cargo: String(rc.cargo || '').trim(),
    };
  }
  const ids = new Set();
  if (dados.responsavel) ids.add(String(exigirId(dados.responsavel, 'responsável')));

  if (dados.integrantes !== undefined) {
    if (!Array.isArray(dados.integrantes)) throw new ErroHttp(400, 'integrantes deve ser uma lista');
    const vistos = new Set();
    dados.integrantes = dados.integrantes
      .map((i) => ({ usuario: String(exigirId(i?.usuario, 'integrante')), funcao: String(i?.funcao || '').trim() }))
      .filter((i) => (vistos.has(i.usuario) ? false : vistos.add(i.usuario)));
    dados.integrantes.forEach((i) => ids.add(i.usuario));
  }

  if (ids.size) {
    const encontrados = await Usuario.countDocuments({ _id: { $in: [...ids] }, ativo: true });
    if (encontrados !== ids.size) throw new ErroHttp(400, 'Algum usuário informado não existe ou está desativado');
  }
  return dados;
}

export async function listarProjetos(usuario, query = {}) {
  const pag = paginacao(query, 12);
  const filtro = { ...filtroProjetosVisiveis(usuario) };
  if (query.status && STATUS_PROJETO.includes(query.status)) filtro.status = query.status;
  if (query.busca) {
    const termo = new RegExp(escaparRegex(String(query.busca)), 'i');
    const busca = { $or: [{ nome: termo }, { cliente: termo }] };
    if (filtro.$or) {
      filtro.$and = [{ $or: filtro.$or }, busca];
      delete filtro.$or;
    } else Object.assign(filtro, busca);
  }

  const [projetos, total] = await Promise.all([
    Projeto.find(filtro).sort({ updatedAt: -1 }).skip(pag.pular).limit(pag.limite).populate('responsavel', 'nome email').lean(),
    Projeto.countDocuments(filtro),
  ]);

  const resumos = await resumoDosProjetos(projetos.map((p) => p._id));
  const itens = projetos.map((p) => ({
    ...p,
    totalIntegrantes: p.integrantes.length,
    integrantes: undefined,
    resumo: resumos.get(String(p._id)),
  }));
  return respostaPaginada(itens, total, pag);
}

export async function obterProjeto(usuario, id) {
  const projeto = await carregarProjeto(id, usuario, { popular: true });
  const resumos = await resumoDosProjetos([projeto._id]);
  return { ...projeto.toJSON(), resumo: resumos.get(String(projeto._id)) };
}

export async function criarProjeto(usuario, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem criar projetos');
  const dados = escolher(corpo || {}, CAMPOS_PROJETO);
  dados.responsavel = dados.responsavel || usuario._id;
  await validarPessoas(dados);
  return Projeto.create(dados);
}

export async function atualizarProjeto(usuario, id, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem editar projetos');
  const projeto = await carregarProjeto(id, usuario);
  const dados = await validarPessoas(escolher(corpo || {}, CAMPOS_PROJETO));
  Object.assign(projeto, dados);
  await projeto.save();
  return projeto;
}

export async function excluirProjeto(usuario, id) {
  exigirAdmin(usuario, 'Apenas administradores podem excluir projetos');
  const projeto = await carregarProjeto(id, usuario);
  await Promise.all([
    Tarefa.deleteMany({ projeto: projeto._id }),
    Historico.deleteMany({ projeto: projeto._id }),
    Marco.deleteMany({ projeto: projeto._id }),
    ...ganchosExclusaoProjeto.map((fn) => fn(projeto._id)),
  ]);
  await projeto.deleteOne();
  return { excluido: true, nome: projeto.nome };
}

export async function obterAndamento(usuario, id) {
  const projeto = await carregarProjeto(id, usuario, { popular: true });
  return andamentoDoProjeto(projeto);
}

export async function listarTarefasDoProjeto(usuario, id, query = {}) {
  const projeto = await carregarProjeto(id, usuario);
  const pag = paginacao(query, 50, 200);
  const filtro = { projeto: projeto._id };

  if (STATUS_TAREFA.includes(query.status)) filtro.status = query.status;
  if (PRIORIDADES.includes(query.prioridade)) filtro.prioridade = query.prioridade;
  if (query.responsavel === 'sem') filtro.responsavel = null;
  else if (query.responsavel) filtro.responsavel = exigirId(query.responsavel, 'responsável');
  if (query.atrasadas === 'true' || query.atrasadas === true) {
    filtro.status = { $ne: 'concluida' };
    filtro.prazo = { $lt: new Date() };
  }
  if (query.busca) filtro.titulo = new RegExp(escaparRegex(String(query.busca)), 'i');
  if (LADOS.includes(query.lado)) filtro.lado = query.lado;
  if (query.marco === 'sem') filtro.marco = null;
  else if (query.marco) filtro.marco = exigirId(query.marco, 'marco');

  const [itens, total] = await Promise.all([
    Tarefa.find(filtro)
      .sort({ prazo: 1, createdAt: -1 })
      .skip(pag.pular)
      .limit(pag.limite)
      .populate('responsavel', 'nome email')
      .populate('marco', 'titulo'),
    Tarefa.countDocuments(filtro),
  ]);
  return respostaPaginada(itens, total, pag);
}

// Confere marco/lado/responsáveis de uma tarefa (criação e edição).
// "atual" = valores atuais da tarefa (na edição), para combinar com o que mudou.
export async function normalizarCamposTarefa(projeto, dados, atual = {}) {
  if (dados.marco !== undefined) {
    if (dados.marco === '' || dados.marco === null) dados.marco = null;
    else {
      const marco = await Marco.findOne({ _id: exigirId(dados.marco, 'marco'), projeto: projeto._id });
      if (!marco) throw new ErroHttp(400, 'O marco informado não pertence a este projeto');
      dados.marco = marco._id;
    }
  }
  if (dados.lado !== undefined && !LADOS.includes(dados.lado)) throw new ErroHttp(400, 'Lado inválido (use awakelab ou cliente)');

  const lado = dados.lado ?? atual.lado ?? 'awakelab';
  if (lado === 'cliente') {
    // Tarefa do cliente: o responsável é alguém do cliente (texto), não um usuário do sistema.
    if (dados.responsavel) throw new ErroHttp(400, 'Tarefas do cliente não têm responsável da Awakelab; use o nome do responsável do cliente');
    if (atual.responsavel || dados.lado === 'cliente') dados.responsavel = null;
  } else {
    if (dados.responsavel) await validarResponsavelDaTarefa(projeto, dados.responsavel);
    if (dados.lado === 'awakelab') dados.responsavelExterno = '';
  }
  return dados;
}

export async function validarResponsavelDaTarefa(projeto, idResponsavel) {
  const resp = await Usuario.findById(exigirId(idResponsavel, 'responsável'));
  if (!resp || !participaDoProjeto(projeto, resp)) {
    throw new ErroHttp(400, 'O responsável precisa ser integrante do projeto');
  }
  return resp;
}

export async function criarTarefa(usuario, idProjeto, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem criar tarefas');
  const projeto = await carregarProjeto(idProjeto, usuario);
  const dados = escolher(corpo || {}, CAMPOS_TAREFA);

  await normalizarCamposTarefa(projeto, dados);
  if (!dados.responsavel) dados.responsavel = undefined;
  if (!dados.marco) dados.marco = undefined;
  if (dados.prazo === '' || dados.prazo === null) dados.prazo = undefined;
  if (dados.status === 'concluida') dados.concluidaEm = new Date();

  const tarefa = await Tarefa.create({ ...dados, projeto: projeto._id });
  await registrarHistorico(tarefa, usuario, 'criou', { titulo: tarefa.titulo });
  await projeto.updateOne({ $currentDate: { updatedAt: true } });

  await tarefa.populate([
    { path: 'responsavel', select: 'nome email' },
    { path: 'marco', select: 'titulo' },
  ]);
  return tarefa;
}

// Regras de negócio de tarefas (usadas pelas rotas e pelo assistente de chat).
import { Tarefa, STATUS_TAREFA } from '../models/Tarefa.js';
import { Historico } from '../models/Historico.js';
import { ErroHttp, escolher, paginacao, respostaPaginada } from '../utils/http.js';
import { carregarTarefa, podeAtualizarTarefa } from '../utils/acesso.js';
import { registrarHistorico } from '../utils/historico.js';
import { exigirAdmin, normalizarCamposTarefa } from './projetos.js';

function aplicarStatus(tarefa, status) {
  if (!STATUS_TAREFA.includes(status)) throw new ErroHttp(400, 'Status inválido');
  tarefa.status = status;
  tarefa.concluidaEm = status === 'concluida' ? tarefa.concluidaEm || new Date() : undefined;
}

export async function minhasTarefas(usuario, query = {}) {
  const pag = paginacao(query, 50, 200);
  const filtro = { responsavel: usuario._id };
  if (STATUS_TAREFA.includes(query.status)) filtro.status = query.status;
  else if (query.status === 'abertas') filtro.status = { $ne: 'concluida' };
  if (query.atrasadas === 'true' || query.atrasadas === true) {
    filtro.status = { $ne: 'concluida' };
    filtro.prazo = { $lt: new Date() };
  }

  const [itens, total] = await Promise.all([
    Tarefa.find(filtro).sort({ prazo: 1, createdAt: -1 }).skip(pag.pular).limit(pag.limite).populate('projeto', 'nome status')
      .populate('marco', 'titulo'),
    Tarefa.countDocuments(filtro),
  ]);
  return respostaPaginada(itens, total, pag);
}

export async function obterTarefa(usuario, id) {
  const { tarefa } = await carregarTarefa(id, usuario);
  await tarefa.populate([
    { path: 'responsavel', select: 'nome email' },
    { path: 'projeto', select: 'nome' },
    { path: 'marco', select: 'titulo dataInicio dataFim' },
  ]);
  return tarefa;
}

const CAMPOS_EDITAVEIS = [
  'titulo',
  'descricao',
  'responsavel',
  'responsavelExterno',
  'lado',
  'marco',
  'prioridade',
  'prazo',
  'horasEstimadas',
  'status',
];

export async function atualizarTarefa(usuario, id, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem editar tarefas');
  const { tarefa, projeto } = await carregarTarefa(id, usuario);
  const dados = escolher(corpo || {}, CAMPOS_EDITAVEIS);
  const campos = Object.keys(dados);

  await normalizarCamposTarefa(projeto, dados, tarefa);

  // Campos que podem ser "limpos" (null/vazio) são removidos do documento.
  for (const campo of ['responsavel', 'marco', 'prazo']) {
    if (dados[campo] === '' || dados[campo] === null) {
      delete dados[campo];
      tarefa[campo] = undefined;
    }
  }

  if (dados.status) {
    aplicarStatus(tarefa, dados.status);
    delete dados.status;
  }
  Object.assign(tarefa, dados);
  await tarefa.save();
  await registrarHistorico(tarefa, usuario, 'editou', { campos });

  await tarefa.populate([
    { path: 'responsavel', select: 'nome email' },
    { path: 'marco', select: 'titulo' },
  ]);
  return tarefa;
}

export async function mudarStatus(usuario, id, status) {
  const { tarefa } = await carregarTarefa(id, usuario);
  if (!podeAtualizarTarefa(tarefa, usuario)) {
    throw new ErroHttp(403, 'Você só pode atualizar as suas próprias tarefas');
  }
  const de = tarefa.status;
  aplicarStatus(tarefa, status);
  if (de === tarefa.status) return tarefa;

  await tarefa.save();
  await registrarHistorico(tarefa, usuario, 'status', { de, para: tarefa.status });
  return tarefa;
}

export async function lancarHoras(usuario, id, horasInformadas, notaInformada) {
  const { tarefa } = await carregarTarefa(id, usuario);
  if (!podeAtualizarTarefa(tarefa, usuario)) {
    throw new ErroHttp(403, 'Você só pode lançar horas nas suas próprias tarefas');
  }
  const horas = Number(horasInformadas);
  if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
    throw new ErroHttp(400, 'Informe as horas entre 0,1 e 24');
  }
  const nota = String(notaInformada || '').trim().slice(0, 500);

  const atualizada = await Tarefa.findByIdAndUpdate(
    tarefa._id,
    { $inc: { horasGastas: Math.round(horas * 10) / 10 } },
    { new: true }
  );
  await registrarHistorico(atualizada, usuario, 'horas', { horas, nota });
  return atualizada;
}

export async function excluirTarefa(usuario, id) {
  exigirAdmin(usuario, 'Apenas administradores podem excluir tarefas');
  const { tarefa } = await carregarTarefa(id, usuario);
  await Historico.deleteMany({ tarefa: tarefa._id });
  await tarefa.deleteOne();
  return { excluida: true, titulo: tarefa.titulo };
}

export async function historicoDaTarefa(usuario, id, query = {}) {
  const { tarefa } = await carregarTarefa(id, usuario);
  const pag = paginacao(query, 30, 100);
  const filtro = { tarefa: tarefa._id };
  const [itens, total] = await Promise.all([
    Historico.find(filtro).sort({ createdAt: -1 }).skip(pag.pular).limit(pag.limite).populate('usuario', 'nome'),
    Historico.countDocuments(filtro),
  ]);
  return respostaPaginada(itens, total, pag);
}

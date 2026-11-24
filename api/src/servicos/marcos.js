// Marcos (hitos) do projeto e a visão linear: marco a marco, com as tarefas e o status.
import { Marco } from '../models/Marco.js';
import { Tarefa } from '../models/Tarefa.js';
import { ErroHttp, escolher, exigirId } from '../utils/http.js';
import { carregarProjeto } from '../utils/acesso.js';
import { exigirAdmin } from './projetos.js';

const CAMPOS_MARCO = ['titulo', 'descricao', 'dataInicio', 'dataFim', 'ordem'];

function inicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Status do marco calculado pelas tarefas: pendente, em_andamento ou concluido (+ atrasado).
export function calcularStatusMarco(marco, contagem) {
  const total = contagem?.total || 0;
  const concluidas = contagem?.concluidas || 0;
  const iniciadas = (contagem?.emAndamento || 0) + concluidas;
  let status = 'pendente';
  if (total > 0 && concluidas === total) status = 'concluido';
  else if (iniciadas > 0) status = 'em_andamento';
  const atrasado = status !== 'concluido' && Boolean(marco.dataFim) && new Date(marco.dataFim) < inicioDeHoje();
  return {
    status,
    atrasado,
    total,
    concluidas,
    emAndamento: contagem?.emAndamento || 0,
    aFazer: contagem?.aFazer || 0,
    doCliente: contagem?.doCliente || 0,
    daAwakelab: contagem?.daAwakelab || 0,
    percentual: total ? Math.round((concluidas / total) * 100) : 0,
  };
}

function validarDatas(dados, atual = {}) {
  const inicio = dados.dataInicio !== undefined ? dados.dataInicio : atual.dataInicio;
  const fim = dados.dataFim !== undefined ? dados.dataFim : atual.dataFim;
  if (inicio && fim && new Date(fim) < new Date(inicio)) {
    throw new ErroHttp(400, 'A data de entrega do marco não pode ser antes da data de início');
  }
}

async function contagensPorMarco(projetoId) {
  const linhas = await Tarefa.aggregate([
    { $match: { projeto: projetoId } },
    {
      $group: {
        _id: '$marco',
        total: { $sum: 1 },
        concluidas: { $sum: { $cond: [{ $eq: ['$status', 'concluida'] }, 1, 0] } },
        emAndamento: { $sum: { $cond: [{ $eq: ['$status', 'em_andamento'] }, 1, 0] } },
        aFazer: { $sum: { $cond: [{ $eq: ['$status', 'a_fazer'] }, 1, 0] } },
        doCliente: { $sum: { $cond: [{ $eq: ['$lado', 'cliente'] }, 1, 0] } },
        daAwakelab: { $sum: { $cond: [{ $ne: ['$lado', 'cliente'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(linhas.map((l) => [l._id ? String(l._id) : 'sem', l]));
}

// Lista os marcos em ordem; com "comTarefas" traz também as tarefas de cada um (visão linear).
export async function listarMarcos(usuario, idProjeto, { comTarefas = false } = {}) {
  const projeto = await carregarProjeto(idProjeto, usuario);
  const [marcos, contagens] = await Promise.all([
    Marco.find({ projeto: projeto._id }).sort({ ordem: 1, dataInicio: 1, createdAt: 1 }).lean(),
    contagensPorMarco(projeto._id),
  ]);

  let tarefasPorMarco = new Map();
  if (comTarefas) {
    const tarefas = await Tarefa.find({ projeto: projeto._id })
      .sort({ prazo: 1, createdAt: 1 })
      .limit(2000)
      .populate('responsavel', 'nome email');
    tarefasPorMarco = tarefas.reduce((mapa, t) => {
      const chave = t.marco ? String(t.marco) : 'sem';
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(t.toJSON());
      return mapa;
    }, new Map());
  }

  const itens = marcos.map((m) => ({
    ...m,
    ...calcularStatusMarco(m, contagens.get(String(m._id))),
    ...(comTarefas ? { tarefas: tarefasPorMarco.get(String(m._id)) || [] } : {}),
  }));

  const semMarco = contagens.get('sem');
  return {
    marcos: itens,
    semMarco: semMarco
      ? { total: semMarco.total, concluidas: semMarco.concluidas, ...(comTarefas ? { tarefas: tarefasPorMarco.get('sem') || [] } : {}) }
      : null,
  };
}

export async function criarMarco(usuario, idProjeto, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem criar marcos');
  const projeto = await carregarProjeto(idProjeto, usuario);
  const dados = escolher(corpo || {}, CAMPOS_MARCO);
  validarDatas(dados);
  if (dados.ordem === undefined) {
    const ultimo = await Marco.findOne({ projeto: projeto._id }).sort({ ordem: -1 }).select('ordem').lean();
    dados.ordem = (ultimo?.ordem ?? 0) + 1;
  }
  const marco = await Marco.create({ ...dados, projeto: projeto._id });
  await projeto.updateOne({ $currentDate: { updatedAt: true } });
  return marco;
}

export async function carregarMarco(usuario, id) {
  const marco = await Marco.findById(exigirId(id, 'id do marco'));
  if (!marco) throw new ErroHttp(404, 'Marco não encontrado');
  const projeto = await carregarProjeto(marco.projeto, usuario);
  return { marco, projeto };
}

export async function atualizarMarco(usuario, id, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem editar marcos');
  const { marco } = await carregarMarco(usuario, id);
  const dados = escolher(corpo || {}, CAMPOS_MARCO);
  for (const campo of ['dataInicio', 'dataFim']) {
    if (dados[campo] === '' || dados[campo] === null) {
      delete dados[campo];
      marco[campo] = undefined;
    }
  }
  validarDatas(dados, marco);
  Object.assign(marco, dados);
  await marco.save();
  return marco;
}

// Excluir um marco NÃO apaga as tarefas: elas ficam "sem marco".
export async function excluirMarco(usuario, id) {
  exigirAdmin(usuario, 'Apenas administradores podem excluir marcos');
  const { marco } = await carregarMarco(usuario, id);
  const { modifiedCount } = await Tarefa.updateMany({ marco: marco._id }, { $unset: { marco: 1 } });
  await marco.deleteOne();
  return { excluido: true, titulo: marco.titulo, tarefasSemMarco: modifiedCount };
}

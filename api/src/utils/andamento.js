import { Tarefa } from '../models/Tarefa.js';

// Cálculos de andamento feitos no próprio MongoDB (aggregation),
// para continuar rápido mesmo com milhares de tarefas.

function camposContagem(agora) {
  const atrasada = {
    $and: [
      { $ne: ['$status', 'concluida'] },
      { $ne: [{ $ifNull: ['$prazo', null] }, null] },
      { $lt: ['$prazo', agora] },
    ],
  };
  return {
    total: { $sum: 1 },
    aFazer: { $sum: { $cond: [{ $eq: ['$status', 'a_fazer'] }, 1, 0] } },
    emAndamento: { $sum: { $cond: [{ $eq: ['$status', 'em_andamento'] }, 1, 0] } },
    concluidas: { $sum: { $cond: [{ $eq: ['$status', 'concluida'] }, 1, 0] } },
    atrasadas: { $sum: { $cond: [atrasada, 1, 0] } },
    horasEstimadas: { $sum: '$horasEstimadas' },
    horasGastas: { $sum: '$horasGastas' },
  };
}

const VAZIO = {
  total: 0,
  aFazer: 0,
  emAndamento: 0,
  concluidas: 0,
  atrasadas: 0,
  horasEstimadas: 0,
  horasGastas: 0,
};

function finalizar(dados = {}) {
  const r = { ...VAZIO, ...dados };
  delete r._id;
  r.percentual = r.total ? Math.round((r.concluidas / r.total) * 100) : 0;
  r.horasEstimadas = Math.round(r.horasEstimadas * 10) / 10;
  r.horasGastas = Math.round(r.horasGastas * 10) / 10;
  return r;
}

// Resumo de vários projetos de uma vez (usado na lista de projetos).
export async function resumoDosProjetos(idsProjetos) {
  if (!idsProjetos.length) return new Map();
  const linhas = await Tarefa.aggregate([
    { $match: { projeto: { $in: idsProjetos } } },
    { $group: { _id: '$projeto', ...camposContagem(new Date()) } },
  ]);
  const mapa = new Map(linhas.map((l) => [String(l._id), finalizar(l)]));
  return new Map(idsProjetos.map((id) => [String(id), mapa.get(String(id)) || finalizar()]));
}

// Andamento completo de um projeto: geral, por prioridade e por integrante.
export async function andamentoDoProjeto(projeto) {
  const agora = new Date();
  const [resultado] = await Tarefa.aggregate([
    { $match: { projeto: projeto._id } },
    {
      $facet: {
        geral: [{ $group: { _id: null, ...camposContagem(agora) } }],
        porPrioridade: [{ $group: { _id: '$prioridade', ...camposContagem(agora) } }],
        porIntegrante: [{ $group: { _id: '$responsavel', ...camposContagem(agora) } }],
      },
    },
  ]);

  const geral = finalizar(resultado.geral[0]);

  const porPrioridade = {};
  for (const p of ['alta', 'media', 'baixa']) {
    const linha = resultado.porPrioridade.find((l) => l._id === p);
    porPrioridade[p] = finalizar(linha);
  }

  const contagemPorUsuario = new Map(
    resultado.porIntegrante.map((l) => [l._id ? String(l._id) : 'sem_responsavel', l])
  );

  const porIntegrante = projeto.integrantes.map((i) => {
    const usuario = i.usuario;
    const id = String(usuario?._id || usuario);
    return {
      usuario: usuario?._id ? { _id: usuario._id, nome: usuario.nome, email: usuario.email } : { _id: id },
      funcao: i.funcao || usuario?.funcao || '',
      ...finalizar(contagemPorUsuario.get(id)),
    };
  });

  const semResponsavel = contagemPorUsuario.get('sem_responsavel');

  return {
    geral,
    porPrioridade,
    porIntegrante,
    semResponsavel: semResponsavel ? finalizar(semResponsavel) : null,
  };
}

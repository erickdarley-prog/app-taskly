import { Historico } from '../models/Historico.js';

export function registrarHistorico(tarefa, usuario, acao, detalhes = {}) {
  return Historico.create({
    tarefa: tarefa._id,
    projeto: tarefa.projeto,
    usuario: usuario._id,
    acao,
    detalhes,
  });
}

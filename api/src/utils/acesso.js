import { Projeto } from '../models/Projeto.js';
import { Tarefa } from '../models/Tarefa.js';
import { ehAdmin } from '../middlewares/auth.js';
import { ErroHttp, exigirId } from './http.js';

export function participaDoProjeto(projeto, usuario) {
  const id = String(usuario._id);
  const responsavel = String(projeto.responsavel?._id || projeto.responsavel);
  if (responsavel === id) return true;
  return projeto.integrantes.some((i) => String(i.usuario?._id || i.usuario) === id);
}

// Filtro de projetos visíveis: admin vê todos; equipe vê os que participa.
export function filtroProjetosVisiveis(usuario) {
  if (ehAdmin(usuario)) return {};
  return { $or: [{ responsavel: usuario._id }, { 'integrantes.usuario': usuario._id }] };
}

export async function carregarProjeto(idProjeto, usuario, { popular = false } = {}) {
  const id = exigirId(idProjeto, 'id do projeto');
  let consulta = Projeto.findById(id);
  if (popular) {
    consulta = consulta
      .populate('responsavel', 'nome email funcao')
      .populate('integrantes.usuario', 'nome email funcao ativo');
  }
  const projeto = await consulta;
  if (!projeto) throw new ErroHttp(404, 'Projeto não encontrado');
  if (!ehAdmin(usuario) && !participaDoProjeto(projeto, usuario)) {
    throw new ErroHttp(403, 'Você não participa deste projeto');
  }
  return projeto;
}

export async function carregarTarefa(idTarefa, usuario) {
  const id = exigirId(idTarefa, 'id da tarefa');
  const tarefa = await Tarefa.findById(id);
  if (!tarefa) throw new ErroHttp(404, 'Tarefa não encontrada');
  const projeto = await carregarProjeto(tarefa.projeto, usuario);
  return { tarefa, projeto };
}

// Integrante só pode atualizar status/horas das PRÓPRIAS tarefas.
export function podeAtualizarTarefa(tarefa, usuario) {
  if (ehAdmin(usuario)) return true;
  return tarefa.responsavel && String(tarefa.responsavel) === String(usuario._id);
}

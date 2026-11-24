// Regras de negócio de usuários (usadas pelas rotas e pelo assistente de chat).
import { Usuario } from '../models/Usuario.js';
import { ErroHttp, escolher, exigirId, paginacao, respostaPaginada } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { exigirAdmin } from './projetos.js';

export async function listarUsuarios(usuario, query = {}) {
  exigirAdmin(usuario, 'Apenas administradores podem ver a lista de usuários');
  const pag = paginacao(query);
  const filtro = {};
  if (query.busca) {
    const termo = new RegExp(escaparRegex(String(query.busca)), 'i');
    filtro.$or = [{ nome: termo }, { email: termo }];
  }
  if (query.papel) filtro.papel = query.papel;
  if (query.ativo !== undefined) filtro.ativo = query.ativo === 'true' || query.ativo === true;

  const [itens, total] = await Promise.all([
    Usuario.find(filtro).sort({ nome: 1 }).skip(pag.pular).limit(pag.limite),
    Usuario.countDocuments(filtro),
  ]);
  return respostaPaginada(itens, total, pag);
}

export async function opcoesDeUsuarios(usuario, query = {}) {
  exigirAdmin(usuario);
  const filtro = { ativo: true };
  if (query.busca) {
    const termo = new RegExp(escaparRegex(String(query.busca)), 'i');
    filtro.$or = [{ nome: termo }, { email: termo }];
  }
  return Usuario.find(filtro).select('nome email funcao papel').sort({ nome: 1 }).limit(200);
}

export async function criarUsuario(usuario, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem criar usuários');
  const dados = escolher(corpo || {}, ['nome', 'email', 'senha', 'papel', 'funcao']);
  if (!dados.senha || String(dados.senha).length < 6) {
    throw new ErroHttp(400, 'A senha precisa ter ao menos 6 caracteres');
  }
  return Usuario.create(dados);
}

export async function atualizarUsuario(usuario, id, corpo) {
  exigirAdmin(usuario, 'Apenas administradores podem editar usuários');
  const alvo = await Usuario.findById(exigirId(id));
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado');

  const dados = escolher(corpo || {}, ['nome', 'email', 'papel', 'funcao', 'ativo', 'senha']);
  const ehEleMesmo = String(alvo._id) === String(usuario._id);
  if (ehEleMesmo && (dados.papel === 'equipe' || dados.ativo === false)) {
    throw new ErroHttp(400, 'Você não pode remover seu próprio acesso de administrador');
  }
  if (dados.senha === '' || dados.senha === null) delete dados.senha;
  if (dados.senha !== undefined && String(dados.senha).length < 6) {
    throw new ErroHttp(400, 'A senha precisa ter ao menos 6 caracteres');
  }

  Object.assign(alvo, dados);
  await alvo.save();
  return alvo;
}

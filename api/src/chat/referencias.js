// O assistente fala em NOMES ("Portal do Aluno", "Ana"); aqui convertemos
// esses nomes nos registros do banco, sempre respeitando o que o usuário pode ver.
import { Projeto } from '../models/Projeto.js';
import { Tarefa } from '../models/Tarefa.js';
import { Usuario } from '../models/Usuario.js';
import { ErroHttp, idValido } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { carregarProjeto, carregarTarefa, filtroProjetosVisiveis } from '../utils/acesso.js';

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Escolhe um único item: primeiro por nome exato, depois por "contém".
function escolherUnico(candidatos, termo, campo, tipo) {
  const alvo = normalizar(termo);
  const exatos = candidatos.filter((c) => normalizar(c[campo]) === alvo);
  if (exatos.length === 1) return exatos[0];
  const lista = exatos.length > 1 ? exatos : candidatos;
  if (lista.length === 1) return lista[0];
  if (lista.length === 0) throw new ErroHttp(404, `Nenhum(a) ${tipo} encontrado(a) para "${termo}".`);
  const nomes = lista.slice(0, 8).map((c) => c[campo]);
  throw new ErroHttp(409, `Mais de um(a) ${tipo} corresponde a "${termo}": ${nomes.join('; ')}. Pergunte ao usuário qual deles.`);
}

// Busca que ignora maiúsculas e acentos ("modulo" encontra "módulo").
const VARIACOES = {
  a: 'aáàâãä',
  e: 'eéèêë',
  i: 'iíìîï',
  o: 'oóòôõö',
  u: 'uúùûü',
  c: 'cç',
  n: 'nñ',
};
function regexFlexivel(termo) {
  const base = normalizar(termo);
  const padrao = escaparRegex(base).replace(/[aeioucn]/g, (l) => `[${VARIACOES[l]}${VARIACOES[l].toUpperCase()}]`);
  return new RegExp(padrao, 'i');
}

export async function resolverProjeto(usuario, referencia, opcoes = {}) {
  if (!referencia) throw new ErroHttp(400, 'Informe o projeto.');
  if (idValido(referencia)) return carregarProjeto(referencia, usuario, opcoes);

  const candidatos = await Projeto.find({ ...filtroProjetosVisiveis(usuario), nome: regexFlexivel(referencia) })
    .select('nome')
    .limit(20)
    .lean();
  const escolhido = escolherUnico(candidatos, referencia, 'nome', 'projeto');
  return carregarProjeto(escolhido._id, usuario, opcoes);
}

// Pessoa por id, e-mail ou nome. Se "projeto" for informado, procura só entre quem participa dele.
export async function resolverPessoa(referencia, { projeto, somenteAtivos = true } = {}) {
  if (!referencia) throw new ErroHttp(400, 'Informe a pessoa.');
  const filtro = somenteAtivos ? { ativo: true } : {};

  if (projeto) {
    const ids = [projeto.responsavel?._id || projeto.responsavel, ...projeto.integrantes.map((i) => i.usuario?._id || i.usuario)];
    filtro._id = { $in: ids };
  }

  if (idValido(referencia)) {
    const u = await Usuario.findOne({ ...filtro, _id: referencia });
    if (!u) throw new ErroHttp(404, 'Pessoa não encontrada' + (projeto ? ' neste projeto.' : '.'));
    return u;
  }

  const texto = String(referencia).trim();
  if (texto.includes('@')) {
    const u = await Usuario.findOne({ ...filtro, email: texto.toLowerCase() });
    if (!u) throw new ErroHttp(404, `Nenhuma pessoa com o e-mail ${texto}` + (projeto ? ' neste projeto.' : '.'));
    return u;
  }

  const candidatos = await Usuario.find({ ...filtro, nome: regexFlexivel(texto) }).limit(20);
  return escolherUnico(candidatos, texto, 'nome', projeto ? 'integrante do projeto' : 'pessoa');
}

export async function resolverTarefa(usuario, referencia, referenciaProjeto) {
  if (!referencia) throw new ErroHttp(400, 'Informe a tarefa.');
  if (idValido(referencia)) return carregarTarefa(referencia, usuario);

  let idsProjetos;
  if (referenciaProjeto) {
    const projeto = await resolverProjeto(usuario, referenciaProjeto);
    idsProjetos = [projeto._id];
  } else {
    const visiveis = await Projeto.find(filtroProjetosVisiveis(usuario)).select('_id').lean();
    idsProjetos = visiveis.map((p) => p._id);
  }

  const candidatos = await Tarefa.find({ projeto: { $in: idsProjetos }, titulo: regexFlexivel(referencia) })
    .select('titulo projeto')
    .populate('projeto', 'nome')
    .limit(20)
    .lean();
  const comRotulo = candidatos.map((c) => ({ ...c, rotulo: `${c.titulo} (projeto ${c.projeto?.nome})` }));
  const alvo = normalizar(referencia);
  const exatos = comRotulo.filter((c) => normalizar(c.titulo) === alvo);
  const lista = exatos.length ? exatos : comRotulo;
  if (lista.length === 0) throw new ErroHttp(404, `Nenhuma tarefa encontrada para "${referencia}".`);
  if (lista.length > 1) {
    throw new ErroHttp(
      409,
      `Mais de uma tarefa corresponde a "${referencia}": ${lista.slice(0, 8).map((c) => c.rotulo).join('; ')}. Pergunte ao usuário qual delas (ou informe o projeto).`
    );
  }
  return carregarTarefa(lista[0]._id, usuario);
}

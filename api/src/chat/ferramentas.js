// Funções que o assistente pode usar. Cada uma chama os MESMOS serviços dos botões,
// então as permissões (admin x equipe) valem igualmente aqui.
import crypto from 'node:crypto';
import { ehAdmin } from '../middlewares/auth.js';
import { ErroHttp } from '../utils/http.js';
import * as projetos from '../servicos/projetos.js';
import * as tarefas from '../servicos/tarefas.js';
import * as usuarios from '../servicos/usuarios.js';
import * as marcos from '../servicos/marcos.js';
import * as acordos from '../servicos/acordos.js';
import * as diario from '../servicos/diario.js';
import { listarAnexos } from '../servicos/anexos.js';
import { Marco } from '../models/Marco.js';
import { resolverPessoa, resolverProjeto, resolverTarefa } from './referencias.js';

// ---------- Formatação compacta para a IA ----------

function dataCurta(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  const fuso = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - fuso).toISOString().slice(0, 10);
}

// Aceita "AAAA-MM-DD" (ou data ISO) e grava ao meio-dia, para não "voltar um dia" por fuso.
function lerData(valor, campo) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const texto = String(valor).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(texto);
  if (Number.isNaN(d.getTime())) throw new ErroHttp(400, `Data inválida em ${campo}. Use o formato AAAA-MM-DD.`);
  return d;
}

const resumoProjeto = (p) => ({
  id: String(p._id),
  nome: p.nome,
  cliente: p.cliente || null,
  status: p.status,
  prazo: dataCurta(p.prazo),
  responsavel: p.responsavel?.nome || null,
  andamento: p.resumo
    ? {
        percentual: p.resumo.percentual,
        concluidas: p.resumo.concluidas,
        total: p.resumo.total,
        atrasadas: p.resumo.atrasadas,
        horasGastas: p.resumo.horasGastas,
        horasEstimadas: p.resumo.horasEstimadas,
      }
    : undefined,
});

const resumoTarefa = (t) => ({
  id: String(t._id),
  titulo: t.titulo,
  projeto: t.projeto?.nome || undefined,
  marco: t.marco?.titulo || undefined,
  lado: t.lado || 'awakelab',
  responsavel:
    t.lado === 'cliente'
      ? t.responsavelExterno || 'cliente'
      : t.responsavel?.nome || (t.responsavel ? String(t.responsavel) : null),
  status: t.status,
  prioridade: t.prioridade,
  prazo: dataCurta(t.prazo),
  atrasada: Boolean(t.atrasada),
  horasGastas: t.horasGastas,
  horasEstimadas: t.horasEstimadas,
});

const resumoUsuario = (u) => ({
  id: String(u._id),
  nome: u.nome,
  email: u.email,
  papel: u.papel,
  funcao: u.funcao || null,
  ativo: u.ativo,
});

// ---------- Confirmação de exclusões ----------
// Além de a IA ser instruída a perguntar, a API só exclui se:
//  1) a resposta anterior do assistente pediu confirmação ("Confirma ...?"), e
//  2) a mensagem atual do usuário for um "sim" claro.
const CONFIRMACAO = /(^|[^\p{L}])(sim|confirmo|confirmado|pode|ok|okay|isso|claro|certo|manda|yes)([^\p{L}]|$)/iu;
const NEGACAO = /(^|[^\p{L}])(n[aã]o|cancela\w*|espera|pare)([^\p{L}]|$)/iu;

function confirmacaoValida(ctx, confirmado) {
  const ultima = ctx.ultimaMensagem || '';
  const pediu = /confirma/i.test(ctx.respostaAnterior || '');
  return confirmado === true && pediu && CONFIRMACAO.test(ultima) && !NEGACAO.test(ultima);
}

function pedirConfirmacao(descricao) {
  return {
    precisaConfirmacao: true,
    instrucao: `Não executado. Pergunte ao usuário, de forma explícita: "Confirma ${descricao}? Essa ação não pode ser desfeita." Só chame a função de novo com confirmado=true depois que ele responder que sim.`,
  };
}

async function resolverMarco(projeto, referencia) {
  if (!referencia) return undefined;
  if (referencia === 'sem') return null;
  const lista = await Marco.find({ projeto: projeto._id }).select('titulo').lean();
  const alvo = String(referencia).trim().toLowerCase();
  const exatos = lista.filter((m) => m.titulo.toLowerCase() === alvo || String(m._id) === referencia);
  const parecidos = exatos.length ? exatos : lista.filter((m) => m.titulo.toLowerCase().includes(alvo));
  if (parecidos.length === 1) return String(parecidos[0]._id);
  if (!parecidos.length) {
    throw new ErroHttp(404, `Nenhum marco "${referencia}" em ${projeto.nome}. Marcos existentes: ${lista.map((m) => m.titulo).join('; ') || 'nenhum'}.`);
  }
  throw new ErroHttp(409, `Mais de um marco corresponde a "${referencia}": ${parecidos.map((m) => m.titulo).join('; ')}. Pergunte qual.`);
}

const resumoMarco = (m) => ({
  id: String(m._id),
  titulo: m.titulo,
  inicio: dataCurta(m.dataInicio),
  entrega: dataCurta(m.dataFim),
  status: m.status,
  atrasado: m.atrasado,
  concluidas: m.concluidas,
  total: m.total,
  percentual: m.percentual,
});

function senhaTemporaria() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

// ---------- Esquemas reutilizados ----------
const STATUS_PROJETO = ['planejamento', 'em_andamento', 'pausado', 'concluido'];
const STATUS_TAREFA = ['a_fazer', 'em_andamento', 'concluida'];
const PRIORIDADES = ['baixa', 'media', 'alta'];
const texto = (description) => ({ type: 'string', description });
const data = (description) => ({ type: 'string', description: `${description} Formato AAAA-MM-DD.` });

// ---------- Definição das funções ----------
// "admin: true" = só aparece para administradores.
// "altera: true" = muda dados (a tela é atualizada depois).

const FERRAMENTAS = [
  // ===== Consultas (todos) =====
  {
    nome: 'listar_projetos',
    descricao: 'Lista os projetos que o usuário pode ver, com andamento resumido. Use para encontrar projetos ou responder "quais projetos existem".',
    parametros: {
      busca: texto('Parte do nome ou do cliente (opcional).'),
      status: { type: 'string', enum: STATUS_PROJETO, description: 'Filtrar por status (opcional).' },
    },
    executar: async (ctx, a) => {
      const r = await projetos.listarProjetos(ctx.usuario, { busca: a.busca, status: a.status, limite: 30 });
      return { total: r.total, projetos: r.itens.map(resumoProjeto) };
    },
  },
  {
    nome: 'ver_projeto',
    descricao: 'Mostra os detalhes e o andamento completo de um projeto: integrantes, totais, atrasadas, horas e andamento por pessoa e por prioridade.',
    parametros: { projeto: texto('Nome (ou id) do projeto.') },
    obrigatorios: ['projeto'],
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const [detalhe, andamento] = await Promise.all([
        projetos.obterProjeto(ctx.usuario, p._id),
        projetos.obterAndamento(ctx.usuario, p._id),
      ]);
      const { marcos: listaMarcos } = await marcos.listarMarcos(ctx.usuario, p._id);
      return {
        ...resumoProjeto(detalhe),
        responsavelCliente: detalhe.responsavelCliente?.nome ? detalhe.responsavelCliente : null,
        marcos: listaMarcos.map(resumoMarco),
        descricao: detalhe.descricao || null,
        dataInicio: dataCurta(detalhe.dataInicio),
        integrantes: detalhe.integrantes.map((i) => ({ nome: i.usuario?.nome, funcao: i.funcao || null })),
        andamentoGeral: andamento.geral,
        porIntegrante: andamento.porIntegrante.map((i) => ({
          nome: i.usuario.nome,
          funcao: i.funcao,
          total: i.total,
          concluidas: i.concluidas,
          emAndamento: i.emAndamento,
          aFazer: i.aFazer,
          atrasadas: i.atrasadas,
          horasGastas: i.horasGastas,
          horasEstimadas: i.horasEstimadas,
        })),
        porPrioridade: andamento.porPrioridade,
        semResponsavel: andamento.semResponsavel,
      };
    },
  },
  {
    nome: 'listar_tarefas',
    descricao: 'Lista as tarefas de um projeto, com filtros opcionais.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      status: { type: 'string', enum: STATUS_TAREFA, description: 'Filtrar por status (opcional).' },
      responsavel: texto('Nome ou e-mail da pessoa responsável (opcional). Use "sem" para tarefas sem responsável.'),
      prioridade: { type: 'string', enum: PRIORIDADES, description: 'Filtrar por prioridade (opcional).' },
      atrasadas: { type: 'boolean', description: 'true para só as atrasadas (opcional).' },
      busca: texto('Parte do título (opcional).'),
    },
    obrigatorios: ['projeto'],
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      let responsavel;
      if (a.responsavel === 'sem') responsavel = 'sem';
      else if (a.responsavel) responsavel = String((await resolverPessoa(a.responsavel, { projeto: p, somenteAtivos: false }))._id);
      const r = await projetos.listarTarefasDoProjeto(ctx.usuario, p._id, {
        status: a.status,
        prioridade: a.prioridade,
        responsavel,
        atrasadas: a.atrasadas,
        busca: a.busca,
        limite: 100,
      });
      return { projeto: p.nome, total: r.total, mostrando: r.itens.length, tarefas: r.itens.map(resumoTarefa) };
    },
  },
  {
    nome: 'minhas_tarefas',
    descricao: 'Lista as tarefas do usuário logado em todos os projetos.',
    parametros: {
      status: { type: 'string', enum: ['abertas', ...STATUS_TAREFA], description: 'Filtro (padrão: abertas = não concluídas).' },
      atrasadas: { type: 'boolean', description: 'true para só as atrasadas (opcional).' },
    },
    executar: async (ctx, a) => {
      const r = await tarefas.minhasTarefas(ctx.usuario, { status: a.status || 'abertas', atrasadas: a.atrasadas, limite: 100 });
      return { total: r.total, tarefas: r.itens.map(resumoTarefa) };
    },
  },
  {
    nome: 'ver_tarefa',
    descricao: 'Mostra os detalhes de uma tarefa e o histórico de alterações.',
    parametros: {
      tarefa: texto('Título (ou id) da tarefa.'),
      projeto: texto('Nome do projeto, para desambiguar (opcional).'),
    },
    obrigatorios: ['tarefa'],
    executar: async (ctx, a) => {
      const { tarefa } = await resolverTarefa(ctx.usuario, a.tarefa, a.projeto);
      const [t, hist] = await Promise.all([
        tarefas.obterTarefa(ctx.usuario, tarefa._id),
        tarefas.historicoDaTarefa(ctx.usuario, tarefa._id, { limite: 15 }),
      ]);
      return {
        ...resumoTarefa(t),
        descricao: t.descricao || null,
        concluidaEm: dataCurta(t.concluidaEm),
        historico: hist.itens.map((h) => ({ quem: h.usuario?.nome, acao: h.acao, detalhes: h.detalhes, quando: h.createdAt })),
      };
    },
  },

  // ===== Atualizações da própria tarefa (todos) =====
  {
    nome: 'mudar_status_tarefa',
    descricao: 'Muda o status de uma tarefa. Integrantes da equipe só podem mudar as próprias tarefas.',
    parametros: {
      tarefa: texto('Título (ou id) da tarefa.'),
      projeto: texto('Nome do projeto, para desambiguar (opcional).'),
      status: { type: 'string', enum: STATUS_TAREFA, description: 'Novo status.' },
    },
    obrigatorios: ['tarefa', 'status'],
    altera: true,
    executar: async (ctx, a) => {
      const { tarefa } = await resolverTarefa(ctx.usuario, a.tarefa, a.projeto);
      const t = await tarefas.mudarStatus(ctx.usuario, tarefa._id, a.status);
      return { ok: true, tarefa: t.titulo, status: t.status };
    },
  },
  {
    nome: 'lancar_horas',
    descricao: 'Lança horas trabalhadas numa tarefa (soma ao total). Integrantes da equipe só podem lançar nas próprias tarefas.',
    parametros: {
      tarefa: texto('Título (ou id) da tarefa.'),
      projeto: texto('Nome do projeto, para desambiguar (opcional).'),
      horas: { type: 'number', description: 'Horas trabalhadas, entre 0.1 e 24 (ex.: 1.5).' },
      nota: texto('O que foi feito (opcional).'),
    },
    obrigatorios: ['tarefa', 'horas'],
    altera: true,
    executar: async (ctx, a) => {
      const { tarefa } = await resolverTarefa(ctx.usuario, a.tarefa, a.projeto);
      const t = await tarefas.lancarHoras(ctx.usuario, tarefa._id, a.horas, a.nota);
      return { ok: true, tarefa: t.titulo, horasLancadas: a.horas, horasGastasTotal: t.horasGastas, horasEstimadas: t.horasEstimadas };
    },
  },

  // ===== Projetos (admin) =====
  {
    nome: 'criar_projeto',
    admin: true,
    descricao:
      'Cria um projeto. Só o nome é obrigatório; antes de criar, pergunte (se ele ainda não disse) o cliente, o responsável do lado do cliente (nome e e-mail), os integrantes com função e o prazo. Depois sugira criar os marcos.',
    parametros: {
      nome: texto('Nome do projeto.'),
      cliente: texto('Cliente ou empresa (opcional).'),
      descricao: texto('Descrição (opcional).'),
      status: { type: 'string', enum: STATUS_PROJETO, description: 'Status inicial (padrão: planejamento).' },
      dataInicio: data('Data de início (opcional).'),
      prazo: data('Prazo de entrega (opcional).'),
      responsavel: texto('Nome ou e-mail do responsável pela Awakelab (padrão: o próprio usuário).'),
      contatoClienteNome: texto('Nome do responsável do lado do cliente (quem assina o acordo).'),
      contatoClienteEmail: texto('E-mail do responsável do cliente (recebe o acordo para concordar).'),
      contatoClienteCargo: texto('Cargo do responsável do cliente (opcional).'),
      integrantes: {
        type: 'array',
        description: 'Integrantes do projeto (opcional).',
        items: {
          type: 'object',
          properties: { pessoa: texto('Nome ou e-mail da pessoa.'), funcao: texto('Função no projeto (opcional).') },
          required: ['pessoa'],
        },
      },
    },
    obrigatorios: ['nome'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem criar projetos');
      const integrantes = [];
      for (const i of a.integrantes || []) {
        const u = await resolverPessoa(i.pessoa);
        integrantes.push({ usuario: String(u._id), funcao: i.funcao || u.funcao || '' });
      }
      const responsavel = a.responsavel ? String((await resolverPessoa(a.responsavel))._id) : undefined;
      const p = await projetos.criarProjeto(ctx.usuario, {
        nome: a.nome,
        cliente: a.cliente,
        descricao: a.descricao,
        status: a.status,
        dataInicio: lerData(a.dataInicio, 'dataInicio'),
        prazo: lerData(a.prazo, 'prazo'),
        responsavel,
        integrantes,
        responsavelCliente: a.contatoClienteNome || a.contatoClienteEmail
          ? { nome: a.contatoClienteNome, email: a.contatoClienteEmail, cargo: a.contatoClienteCargo }
          : undefined,
      });
      return { ok: true, projeto: { id: String(p._id), nome: p.nome, prazo: dataCurta(p.prazo), integrantes: integrantes.length } };
    },
  },
  {
    nome: 'editar_projeto',
    admin: true,
    descricao: 'Altera dados de um projeto (nome, cliente, descrição, status, datas, responsável). Envie só os campos que mudam.',
    parametros: {
      projeto: texto('Nome (ou id) atual do projeto.'),
      novoNome: texto('Novo nome (opcional).'),
      cliente: texto('Cliente (opcional).'),
      descricao: texto('Descrição (opcional).'),
      status: { type: 'string', enum: STATUS_PROJETO, description: 'Novo status (opcional).' },
      dataInicio: data('Nova data de início (opcional). Use "" para remover.'),
      prazo: data('Novo prazo (opcional). Use "" para remover.'),
      responsavel: texto('Nome ou e-mail do novo responsável pela Awakelab (opcional).'),
      contatoClienteNome: texto('Novo nome do responsável do cliente (opcional).'),
      contatoClienteEmail: texto('Novo e-mail do responsável do cliente (opcional).'),
      contatoClienteCargo: texto('Novo cargo do responsável do cliente (opcional).'),
    },
    obrigatorios: ['projeto'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem editar projetos');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const dados = {};
      if (a.novoNome) dados.nome = a.novoNome;
      if (a.cliente !== undefined) dados.cliente = a.cliente;
      if (a.descricao !== undefined) dados.descricao = a.descricao;
      if (a.status) dados.status = a.status;
      if (a.dataInicio !== undefined) dados.dataInicio = lerData(a.dataInicio, 'dataInicio');
      if (a.prazo !== undefined) dados.prazo = lerData(a.prazo, 'prazo');
      if (a.responsavel) dados.responsavel = String((await resolverPessoa(a.responsavel))._id);
      if (a.contatoClienteNome !== undefined || a.contatoClienteEmail !== undefined || a.contatoClienteCargo !== undefined) {
        const atual = p.responsavelCliente || {};
        dados.responsavelCliente = {
          nome: a.contatoClienteNome ?? atual.nome,
          email: a.contatoClienteEmail ?? atual.email,
          cargo: a.contatoClienteCargo ?? atual.cargo,
        };
      }
      const atualizado = await projetos.atualizarProjeto(ctx.usuario, p._id, dados);
      return { ok: true, projeto: atualizado.nome, alterados: Object.keys(dados) };
    },
  },
  {
    nome: 'adicionar_integrante',
    admin: true,
    descricao: 'Adiciona uma pessoa a um projeto (ou atualiza a função dela, se já participa).',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      pessoa: texto('Nome ou e-mail da pessoa.'),
      funcao: texto('Função no projeto (opcional).'),
    },
    obrigatorios: ['projeto', 'pessoa'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem alterar integrantes');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const u = await resolverPessoa(a.pessoa);
      const integrantes = p.integrantes.map((i) => ({ usuario: String(i.usuario), funcao: i.funcao }));
      const existente = integrantes.find((i) => i.usuario === String(u._id));
      if (existente) existente.funcao = a.funcao ?? existente.funcao;
      else integrantes.push({ usuario: String(u._id), funcao: a.funcao || u.funcao || '' });
      await projetos.atualizarProjeto(ctx.usuario, p._id, { integrantes });
      return { ok: true, projeto: p.nome, pessoa: u.nome, jaParticipava: Boolean(existente) };
    },
  },
  {
    nome: 'remover_integrante',
    admin: true,
    descricao: 'Remove uma pessoa da lista de integrantes de um projeto. As tarefas dela continuam no projeto.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      pessoa: texto('Nome ou e-mail da pessoa.'),
    },
    obrigatorios: ['projeto', 'pessoa'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem alterar integrantes');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const u = await resolverPessoa(a.pessoa, { projeto: p, somenteAtivos: false });
      const integrantes = p.integrantes
        .filter((i) => String(i.usuario) !== String(u._id))
        .map((i) => ({ usuario: String(i.usuario), funcao: i.funcao }));
      if (integrantes.length === p.integrantes.length) return { ok: false, aviso: `${u.nome} não é integrante de ${p.nome}.` };
      await projetos.atualizarProjeto(ctx.usuario, p._id, { integrantes });
      return { ok: true, projeto: p.nome, removido: u.nome };
    },
  },
  {
    nome: 'excluir_projeto',
    admin: true,
    descricao: 'Exclui um projeto e TODAS as suas tarefas. Antes, pergunte ao usuário se confirma; só envie confirmado=true depois que ele responder que sim.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      confirmado: { type: 'boolean', description: 'true somente se o usuário acabou de confirmar a exclusão.' },
    },
    obrigatorios: ['projeto'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem excluir projetos');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      if (!confirmacaoValida(ctx, a.confirmado)) return pedirConfirmacao(`a exclusão do projeto "${p.nome}" e de todas as suas tarefas`);
      return { ok: true, ...(await projetos.excluirProjeto(ctx.usuario, p._id)) };
    },
  },

  // ===== Tarefas (admin) =====
  {
    nome: 'criar_tarefa',
    admin: true,
    descricao:
      'Cria uma tarefa num projeto, dentro de um marco. Se o usuário não disse o marco, de quem é a tarefa (Awakelab ou cliente), o responsável ou o prazo, pergunte antes (pode criar sem eles se ele preferir).',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      titulo: texto('Título da tarefa.'),
      marco: texto('Título do marco onde a tarefa fica (opcional).'),
      lado: { type: 'string', enum: ['awakelab', 'cliente'], description: 'De quem é a tarefa (padrão: awakelab).' },
      descricao: texto('Descrição (opcional).'),
      responsavel: texto('Para tarefa da Awakelab: nome ou e-mail do integrante responsável (opcional).'),
      responsavelCliente: texto('Para tarefa do cliente: nome da pessoa do cliente (opcional).'),
      prioridade: { type: 'string', enum: PRIORIDADES, description: 'Prioridade (padrão: media).' },
      status: { type: 'string', enum: STATUS_TAREFA, description: 'Status inicial (padrão: a_fazer).' },
      prazo: data('Prazo (opcional).'),
      horasEstimadas: { type: 'number', description: 'Horas estimadas (opcional).' },
    },
    obrigatorios: ['projeto', 'titulo'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem criar tarefas');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const lado = a.lado || 'awakelab';
      const responsavel =
        lado === 'awakelab' && a.responsavel ? String((await resolverPessoa(a.responsavel, { projeto: p }))._id) : undefined;
      const t = await projetos.criarTarefa(ctx.usuario, p._id, {
        titulo: a.titulo,
        marco: await resolverMarco(p, a.marco),
        lado,
        responsavelExterno: lado === 'cliente' ? a.responsavelCliente || a.responsavel || '' : '',
        descricao: a.descricao,
        responsavel,
        prioridade: a.prioridade,
        status: a.status,
        prazo: lerData(a.prazo, 'prazo'),
        horasEstimadas: a.horasEstimadas,
      });
      return { ok: true, projeto: p.nome, tarefa: resumoTarefa(t) };
    },
  },
  {
    nome: 'editar_tarefa',
    admin: true,
    descricao: 'Altera uma tarefa (título, descrição, responsável, prioridade, prazo, horas estimadas, status). Envie só o que muda.',
    parametros: {
      tarefa: texto('Título (ou id) atual da tarefa.'),
      projeto: texto('Nome do projeto, para desambiguar (opcional).'),
      novoTitulo: texto('Novo título (opcional).'),
      marco: texto('Mover para este marco (título), ou "sem" para tirar do marco (opcional).'),
      lado: { type: 'string', enum: ['awakelab', 'cliente'], description: 'Mudar de quem é a tarefa (opcional).' },
      descricao: texto('Nova descrição (opcional).'),
      responsavel: texto('Nome ou e-mail do novo responsável da Awakelab, ou "sem" para remover (opcional).'),
      responsavelCliente: texto('Para tarefa do cliente: nome da pessoa do cliente (opcional).'),
      prioridade: { type: 'string', enum: PRIORIDADES, description: 'Nova prioridade (opcional).' },
      status: { type: 'string', enum: STATUS_TAREFA, description: 'Novo status (opcional).' },
      prazo: data('Novo prazo (opcional). Use "" para remover.'),
      horasEstimadas: { type: 'number', description: 'Novas horas estimadas (opcional).' },
    },
    obrigatorios: ['tarefa'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem editar tarefas');
      const { tarefa, projeto } = await resolverTarefa(ctx.usuario, a.tarefa, a.projeto);
      const dados = {};
      if (a.novoTitulo) dados.titulo = a.novoTitulo;
      if (a.marco !== undefined) dados.marco = await resolverMarco(projeto, a.marco);
      if (a.lado) dados.lado = a.lado;
      if (a.responsavelCliente !== undefined) dados.responsavelExterno = a.responsavelCliente;
      if (a.descricao !== undefined) dados.descricao = a.descricao;
      if (a.responsavel === 'sem') dados.responsavel = null;
      else if (a.responsavel) dados.responsavel = String((await resolverPessoa(a.responsavel, { projeto }))._id);
      if (a.prioridade) dados.prioridade = a.prioridade;
      if (a.status) dados.status = a.status;
      if (a.prazo !== undefined) dados.prazo = lerData(a.prazo, 'prazo');
      if (a.horasEstimadas !== undefined) dados.horasEstimadas = a.horasEstimadas;
      const t = await tarefas.atualizarTarefa(ctx.usuario, tarefa._id, dados);
      return { ok: true, tarefa: resumoTarefa(t), alterados: Object.keys(dados) };
    },
  },
  {
    nome: 'excluir_tarefa',
    admin: true,
    descricao: 'Exclui uma tarefa. Antes, pergunte ao usuário se confirma; só envie confirmado=true depois que ele responder que sim.',
    parametros: {
      tarefa: texto('Título (ou id) da tarefa.'),
      projeto: texto('Nome do projeto, para desambiguar (opcional).'),
      confirmado: { type: 'boolean', description: 'true somente se o usuário acabou de confirmar a exclusão.' },
    },
    obrigatorios: ['tarefa'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem excluir tarefas');
      const { tarefa } = await resolverTarefa(ctx.usuario, a.tarefa, a.projeto);
      if (!confirmacaoValida(ctx, a.confirmado)) return pedirConfirmacao(`a exclusão da tarefa "${tarefa.titulo}"`);
      return { ok: true, ...(await tarefas.excluirTarefa(ctx.usuario, tarefa._id)) };
    },
  },

  // ===== Marcos (todos consultam; admin altera) =====
  {
    nome: 'ver_marcos',
    descricao:
      'Visão linear do projeto: marco a marco, com datas, status e as tarefas de cada um (de quem é, responsável e status). Use para "como está cada etapa", "o que falta no marco X", "o que depende do cliente".',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      marco: texto('Mostrar só este marco (opcional).'),
    },
    obrigatorios: ['projeto'],
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const r = await marcos.listarMarcos(ctx.usuario, p._id, { comTarefas: true });
      let lista = r.marcos;
      if (a.marco) {
        const id = await resolverMarco(p, a.marco);
        lista = lista.filter((m) => String(m._id) === id);
      }
      return {
        projeto: p.nome,
        marcos: lista.map((m) => ({ ...resumoMarco(m), tarefas: m.tarefas.map(resumoTarefa) })),
        tarefasSemMarco: a.marco ? undefined : r.semMarco?.tarefas?.map(resumoTarefa),
      };
    },
  },
  {
    nome: 'criar_marco',
    admin: true,
    descricao: 'Cria um marco (etapa) no projeto, com datas aproximadas de início e entrega. Pergunte as datas se o usuário não disse.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      titulo: texto('Nome do marco, ex.: "Criar domínios".'),
      descricao: texto('Descrição (opcional).'),
      inicio: data('Data aproximada de início (opcional).'),
      entrega: data('Data aproximada de entrega (opcional).'),
    },
    obrigatorios: ['projeto', 'titulo'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem criar marcos');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const m = await marcos.criarMarco(ctx.usuario, p._id, {
        titulo: a.titulo,
        descricao: a.descricao,
        dataInicio: lerData(a.inicio, 'inicio'),
        dataFim: lerData(a.entrega, 'entrega'),
      });
      return { ok: true, projeto: p.nome, marco: { titulo: m.titulo, inicio: dataCurta(m.dataInicio), entrega: dataCurta(m.dataFim), ordem: m.ordem } };
    },
  },
  {
    nome: 'editar_marco',
    admin: true,
    descricao: 'Altera um marco (nome, descrição, datas ou posição na ordem). Envie só o que muda.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      marco: texto('Título atual do marco.'),
      novoTitulo: texto('Novo título (opcional).'),
      descricao: texto('Nova descrição (opcional).'),
      inicio: data('Nova data de início (opcional). Use "" para remover.'),
      entrega: data('Nova data de entrega (opcional). Use "" para remover.'),
      ordem: { type: 'number', description: 'Nova posição na lista (1 = primeiro) (opcional).' },
    },
    obrigatorios: ['projeto', 'marco'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem editar marcos');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const id = await resolverMarco(p, a.marco);
      const dados = {};
      if (a.novoTitulo) dados.titulo = a.novoTitulo;
      if (a.descricao !== undefined) dados.descricao = a.descricao;
      if (a.inicio !== undefined) dados.dataInicio = lerData(a.inicio, 'inicio');
      if (a.entrega !== undefined) dados.dataFim = lerData(a.entrega, 'entrega');
      if (a.ordem !== undefined) dados.ordem = a.ordem;
      const m = await marcos.atualizarMarco(ctx.usuario, id, dados);
      return { ok: true, marco: m.titulo, alterados: Object.keys(dados) };
    },
  },
  {
    nome: 'excluir_marco',
    admin: true,
    descricao: 'Exclui um marco. As tarefas dele NÃO são apagadas (ficam sem marco). Pergunte se confirma antes; só envie confirmado=true depois do "sim".',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      marco: texto('Título do marco.'),
      confirmado: { type: 'boolean', description: 'true somente se o usuário acabou de confirmar.' },
    },
    obrigatorios: ['projeto', 'marco'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem excluir marcos');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const id = await resolverMarco(p, a.marco);
      if (!confirmacaoValida(ctx, a.confirmado)) return pedirConfirmacao(`a exclusão do marco "${a.marco}" (as tarefas ficam sem marco)`);
      return { ok: true, ...(await marcos.excluirMarco(ctx.usuario, id)) };
    },
  },

  // ===== Escopo / acordo =====
  {
    nome: 'ver_escopo',
    descricao:
      'Mostra o escopo do projeto: o que está incluído e o que NÃO está incluído, a versão vigente (assinada), a versão em andamento e a situação das assinaturas.',
    parametros: { projeto: texto('Nome (ou id) do projeto.') },
    obrigatorios: ['projeto'],
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const r = await acordos.listarAcordos(ctx.usuario, p._id);
      const resumir = (v) =>
        v && {
          versao: v.versao,
          status: v.status,
          incluidos: v.incluidos.map((i) => i.texto),
          naoIncluidos: v.naoIncluidos.map((i) => i.texto),
          assinaturaAwakelab: v.assinaturaEmpresa?.em ? { nome: v.assinaturaEmpresa.nome, em: v.assinaturaEmpresa.em } : null,
          concordanciaCliente: v.assinaturaCliente?.em ? { nome: v.assinaturaCliente.nome, em: v.assinaturaCliente.em } : null,
        };
      return {
        projeto: p.nome,
        responsavelCliente: r.responsavelCliente,
        responsavelAwakelab: r.responsavelEmpresa?.nome,
        vigente: resumir(r.vigente),
        emAndamento: resumir(r.emAndamento),
        aviso: 'O envio para o cliente e a assinatura da Awakelab são feitos pelos botões na aba "Escopo e acordo".',
      };
    },
  },
  {
    nome: 'alterar_escopo',
    admin: true,
    descricao:
      'Adiciona ou remove itens do escopo (incluído / não incluído). As mudanças vão para uma NOVA VERSÃO em rascunho; depois o usuário envia ao cliente pelo botão "Enviar para assinatura" na aba "Escopo e acordo".',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      adicionarIncluidos: { type: 'array', items: { type: 'string' }, description: 'Itens que VÃO no projeto (opcional).' },
      adicionarNaoIncluidos: { type: 'array', items: { type: 'string' }, description: 'Itens que NÃO vão no projeto (opcional).' },
      remover: { type: 'array', items: { type: 'string' }, description: 'Textos exatos de itens a remover de qualquer lista (opcional).' },
    },
    obrigatorios: ['projeto'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem alterar o escopo');
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const r = await acordos.alterarItensDoEscopo(ctx.usuario, p._id, {
        adicionarIncluidos: a.adicionarIncluidos || [],
        adicionarNaoIncluidos: a.adicionarNaoIncluidos || [],
        remover: a.remover || [],
      });
      return {
        ok: true,
        versao: r.versao,
        status: 'rascunho',
        incluidos: r.incluidos.map((i) => i.texto),
        naoIncluidos: r.naoIncluidos.map((i) => i.texto),
        proximoPasso: 'Revisar e clicar em "Enviar para assinatura" na aba "Escopo e acordo" do projeto.',
      };
    },
  },

  // ===== Diário (todos os participantes) =====
  {
    nome: 'registrar_diario',
    descricao:
      'Escreve no diário do projeto o que aconteceu num dia, com observações. Use quando o usuário contar um avanço, problema, reunião ou algo do cliente.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      texto: texto('O que aconteceu, com as observações.'),
      data: data('Dia do registro (padrão: hoje).'),
      marco: texto('Marco relacionado (opcional).'),
      categoria: { type: 'string', enum: ['avanco', 'observacao', 'problema', 'reuniao', 'cliente'], description: 'Tipo do registro (padrão: avanco).' },
    },
    obrigatorios: ['projeto', 'texto'],
    altera: true,
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const r = await diario.criarRegistro(ctx.usuario, p._id, {
        texto: a.texto,
        data: a.data,
        categoria: a.categoria,
        marco: await resolverMarco(p, a.marco),
      });
      return { ok: true, projeto: p.nome, dia: dataCurta(r.data), categoria: r.categoria };
    },
  },
  {
    nome: 'ver_diario',
    descricao: 'Mostra o diário do projeto (registros por dia com observações e mudanças nas tarefas).',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      ate: data('Último dia a mostrar (padrão: hoje).'),
      dias: { type: 'number', description: 'Quantos dias para trás (padrão 7, máximo 90).' },
    },
    obrigatorios: ['projeto'],
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const r = await diario.obterDiario(ctx.usuario, p._id, { ate: a.ate, dias: a.dias || 7 });
      return {
        projeto: p.nome,
        de: r.de,
        ate: r.ate,
        dias: r.dias.map((d) => ({
          dia: d.dia,
          registros: d.itens.slice(0, 30).map((i) => ({ tipo: i.tipo, categoria: i.categoria, autor: i.autor, marco: i.marco, texto: i.texto })),
        })),
      };
    },
  },

  {
    nome: 'listar_anexos',
    descricao: 'Lista os anexos do projeto (vídeos, imagens, documentos e arquivos) com quem enviou e quando. O usuário abre e baixa pela aba "Anexos" do projeto.',
    parametros: {
      projeto: texto('Nome (ou id) do projeto.'),
      tipo: { type: 'string', enum: ['video', 'imagem', 'documento', 'arquivo'], description: 'Filtrar por tipo (opcional).' },
      busca: texto('Parte do nome do arquivo (opcional).'),
    },
    obrigatorios: ['projeto'],
    executar: async (ctx, a) => {
      const p = await resolverProjeto(ctx.usuario, a.projeto);
      const r = await listarAnexos(ctx.usuario, p._id, { tipo: a.tipo, busca: a.busca });
      return {
        projeto: p.nome,
        total: r.total,
        porTipo: r.porTipo,
        anexos: r.itens.slice(0, 50).map((x) => ({
          nome: x.nome,
          tipo: x.tipo,
          tamanhoKb: Math.round(x.tamanho / 1024),
          enviadoPor: x.enviadoPor?.nome,
          em: dataCurta(x.createdAt),
          podeVisualizar: Boolean(x.visualizador),
        })),
        aviso: 'Para ver ou baixar, use a aba "Anexos" do projeto. Pelo chat não é possível enviar arquivos.',
      };
    },
  },

  // ===== Usuários (admin) =====
  {
    nome: 'listar_usuarios',
    admin: true,
    descricao: 'Lista os usuários do sistema.',
    parametros: { busca: texto('Parte do nome ou e-mail (opcional).') },
    executar: async (ctx, a) => {
      const r = await usuarios.listarUsuarios(ctx.usuario, { busca: a.busca, limite: 50 });
      return { total: r.total, usuarios: r.itens.map(resumoUsuario) };
    },
  },
  {
    nome: 'criar_usuario',
    admin: true,
    descricao: 'Cria um usuário. A senha é gerada automaticamente e mostrada só na tela do administrador (não peça senha ao usuário).',
    parametros: {
      nome: texto('Nome completo.'),
      email: texto('E-mail de login.'),
      papel: { type: 'string', enum: ['equipe', 'admin'], description: 'Perfil (padrão: equipe).' },
      funcao: texto('Função, ex.: Front-end (opcional).'),
    },
    obrigatorios: ['nome', 'email'],
    altera: true,
    executar: async (ctx, a) => {
      const senha = senhaTemporaria();
      const u = await usuarios.criarUsuario(ctx.usuario, { nome: a.nome, email: a.email, papel: a.papel, funcao: a.funcao, senha });
      // A senha vai só para a tela; a IA recebe apenas o aviso.
      ctx.extras.push({ tipo: 'senha', nome: u.nome, email: u.email, senha });
      return { ok: true, usuario: resumoUsuario(u), senha: 'Gerada e exibida apenas na tela do administrador.' };
    },
  },
  {
    nome: 'editar_usuario',
    admin: true,
    descricao: 'Altera um usuário (nome, e-mail, perfil, função, ativo). Para desativar o acesso use ativo=false. Para nova senha use redefinirSenha=true.',
    parametros: {
      usuario: texto('Nome ou e-mail atual do usuário.'),
      nome: texto('Novo nome (opcional).'),
      email: texto('Novo e-mail (opcional).'),
      papel: { type: 'string', enum: ['equipe', 'admin'], description: 'Novo perfil (opcional).' },
      funcao: texto('Nova função (opcional).'),
      ativo: { type: 'boolean', description: 'false desativa o acesso; true reativa (opcional).' },
      redefinirSenha: { type: 'boolean', description: 'true gera uma nova senha temporária (opcional).' },
    },
    obrigatorios: ['usuario'],
    altera: true,
    executar: async (ctx, a) => {
      projetos.exigirAdmin(ctx.usuario, 'Apenas administradores podem editar usuários');
      const alvo = await resolverPessoa(a.usuario, { somenteAtivos: false });
      const dados = {};
      for (const c of ['nome', 'email', 'papel', 'funcao', 'ativo']) if (a[c] !== undefined) dados[c] = a[c];
      let senha;
      if (a.redefinirSenha) dados.senha = senha = senhaTemporaria();
      const u = await usuarios.atualizarUsuario(ctx.usuario, alvo._id, dados);
      if (senha) ctx.extras.push({ tipo: 'senha', nome: u.nome, email: u.email, senha });
      const alterados = Object.keys(dados).map((c) => (c === 'senha' ? 'senha (exibida na tela)' : c));
      return { ok: true, usuario: resumoUsuario(u), alterados };
    },
  },
];

// Monta a lista no formato da OpenAI (Responses API), conforme o perfil.
export function definicoesPara(usuario) {
  return FERRAMENTAS.filter((f) => !f.admin || ehAdmin(usuario)).map((f) => ({
    type: 'function',
    name: f.nome,
    description: f.descricao,
    parameters: {
      type: 'object',
      properties: f.parametros || {},
      required: f.obrigatorios || [],
      additionalProperties: false,
    },
    strict: false,
  }));
}

// Executa uma chamada de função pedida pela IA e devolve um resultado em JSON.
export async function executarFerramenta(ctx, nome, argumentosJson) {
  const ferramenta = FERRAMENTAS.find((f) => f.nome === nome);
  if (!ferramenta) return { erro: `Função desconhecida: ${nome}` };
  if (ferramenta.admin && !ehAdmin(ctx.usuario)) {
    return { erro: 'Apenas administradores podem fazer isso. Explique ao usuário o que ele pode fazer pelo chat.' };
  }

  let args;
  try {
    args = argumentosJson ? JSON.parse(argumentosJson) : {};
  } catch {
    return { erro: 'Argumentos inválidos (JSON malformado).' };
  }

  try {
    const resultado = await ferramenta.executar(ctx, args);
    const executou = ferramenta.altera && resultado?.ok;
    if (executou) ctx.alterou = true;
    ctx.acoes.push({ ferramenta: nome, ok: Boolean(resultado?.ok ?? !resultado?.erro), altera: Boolean(ferramenta.altera) });
    return resultado;
  } catch (erro) {
    if (erro instanceof ErroHttp) {
      ctx.acoes.push({ ferramenta: nome, ok: false, altera: Boolean(ferramenta.altera) });
      return { erro: erro.message };
    }
    if (erro?.name === 'ValidationError') {
      const msgs = Object.values(erro.errors || {}).map((e) => e.message);
      return { erro: `Dados inválidos: ${msgs.join(', ')}` };
    }
    if (erro?.code === 11000) return { erro: 'Já existe um registro com esse e-mail/valor.' };
    console.error('[chat] erro na função', nome, erro);
    return { erro: 'Erro interno ao executar a ação.' };
  }
}

export const NOMES_FERRAMENTAS = FERRAMENTAS.map((f) => ({ nome: f.nome, admin: Boolean(f.admin), altera: Boolean(f.altera) }));

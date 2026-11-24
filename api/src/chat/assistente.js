// Conversa com a OpenAI: envia a mensagem + as funções disponíveis, executa as
// funções que a IA pedir (com as permissões do usuário) e devolve a resposta final.
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { Conversa } from '../models/Conversa.js';
import { ehAdmin } from '../middlewares/auth.js';
import { ErroHttp } from '../utils/http.js';
import { definicoesPara, executarFerramenta } from './ferramentas.js';

const MAX_PASSOS = 8; // limite de rodadas IA -> função -> IA por mensagem
const MAX_ITENS_SALVOS = 60; // tamanho máximo do histórico guardado por usuário

let clienteAtual = null;

// Permite trocar o cliente (usado nos testes, sem chamar a OpenAI de verdade).
export function definirClienteOpenAI(cliente) {
  clienteAtual = cliente;
}

function cliente() {
  if (clienteAtual) return clienteAtual;
  if (!env.openaiApiKey) {
    throw new ErroHttp(503, 'O assistente ainda não está configurado: coloque sua OPENAI_API_KEY no arquivo api/.env e reinicie a API.');
  }
  clienteAtual = new OpenAI({ apiKey: env.openaiApiKey });
  return clienteAtual;
}

export function assistenteConfigurado() {
  return Boolean(clienteAtual || env.openaiApiKey);
}

function hojeEmSaoPaulo() {
  const agora = new Date();
  const data = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  const diaSemana = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
  return `${data} (${diaSemana})`;
}

function instrucoes(usuario) {
  const admin = ehAdmin(usuario);
  return [
    'Você é o assistente do Taskly, o sistema da Awakelab para acompanhar projetos de clientes.',
    'Como os projetos funcionam: cada projeto é dividido em MARCOS (etapas, "hitos") com datas aproximadas de início e entrega; cada marco tem TAREFAS, que são da Awakelab ou do Cliente, com responsável opcional. O projeto tem um responsável da Awakelab e um do cliente, um ESCOPO (o que está incluído e o que não está) assinado pelas duas partes (cada alteração gera nova versão e nova assinatura), e um DIÁRIO com o que aconteceu em cada dia, com observações.',
    `Usuário logado: ${usuario.nome} (${usuario.email}), perfil ${admin ? 'ADMINISTRADOR' : 'EQUIPE'}${usuario.funcao ? `, função ${usuario.funcao}` : ''}.`,
    `Hoje é ${hojeEmSaoPaulo()}, fuso de São Paulo. Converta datas ditas pelo usuário ("dia 20", "sexta que vem") para AAAA-MM-DD.`,
    '',
    'Como agir:',
    '- Responda sempre em português do Brasil, de forma curta, simpática e direta.',
    '- Use as funções para consultar e alterar dados. Nunca invente projetos, pessoas, números ou resultados.',
    '- Para criar algo, colete o que falta conversando: faça no máximo 2 perguntas por vez. Se o usuário já deu as informações, execute direto.',
    '- Quando o usuário disser "eu" ou "minha", ele se refere a si mesmo.',
    '- Depois de executar uma ação, confirme o que foi feito em uma ou duas frases e sugira o próximo passo útil quando fizer sentido.',
    '- Exclusões: SEMPRE pergunte "Confirma ...?" e só chame a função com confirmado=true depois de um "sim" claro.',
    '- Se uma função retornar "erro", explique o problema ao usuário em linguagem simples. Se houver mais de uma opção parecida, pergunte qual ele quer.',
    '- Não mostre ids internos ao usuário. Mostre datas como DD/MM/AAAA e status em português (a fazer, em andamento, concluída; planejamento, em andamento, pausado, concluído).',
    '- O Taskly mostra ANDAMENTO, não avaliação de pessoas: não faça rankings nem julgue desempenho individual.',
    '- Nunca peça nem mostre senhas; ao criar usuário a senha temporária aparece só na tela do administrador.',
    '- Você NÃO envia o acordo ao cliente nem assina por ninguém: isso é feito pelos botões na aba "Escopo e acordo". Depois de alterar o escopo, lembre o usuário de enviar para assinatura.',
    '- Quando o usuário contar algo que aconteceu no projeto (avanço, problema, reunião, retorno do cliente), ofereça registrar no diário.',
    admin
      ? '- O usuário é administrador e pode usar todas as funções disponíveis.'
      : '- O usuário é da EQUIPE: pode consultar os projetos de que participa (marcos, escopo, diário), escrever no diário e, nas PRÓPRIAS tarefas, mudar status e lançar horas. Se pedir algo de administrador (criar/editar/excluir projetos, marcos, tarefas, escopo ou usuários, mexer em tarefa de outra pessoa ou do cliente), explique gentilmente que só administradores podem e ofereça o que ele pode fazer.',
  ].join('\n');
}

function textoDaMensagem(item) {
  if (typeof item.content === 'string') return item.content;
  return (item.content || [])
    .map((c) => c.text || '')
    .join('')
    .trim();
}

// Converte a saída da OpenAI em itens simples para reenviar/salvar.
// manterRaciocinio: inclui itens de raciocínio criptografados (só durante a mesma resposta).
function limparItens(saida, { manterRaciocinio }) {
  const itens = [];
  for (const item of saida) {
    if (item.type === 'reasoning') {
      if (manterRaciocinio && item.encrypted_content) itens.push(item);
    } else if (item.type === 'function_call') {
      itens.push({ type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments });
    } else if (item.type === 'message' && item.role === 'assistant') {
      const texto = textoDaMensagem(item);
      if (texto) itens.push({ role: 'assistant', content: texto });
    }
  }
  return itens;
}

// Mantém só os itens mais recentes, começando sempre numa mensagem do usuário.
function cortarHistorico(itens) {
  const semRaciocinio = itens.filter((i) => i.type !== 'reasoning');
  if (semRaciocinio.length <= MAX_ITENS_SALVOS) return semRaciocinio;
  let inicio = semRaciocinio.length - MAX_ITENS_SALVOS;
  while (inicio < semRaciocinio.length && semRaciocinio[inicio].role !== 'user') inicio += 1;
  return semRaciocinio.slice(inicio);
}

function traduzirErroOpenAI(erro) {
  const status = erro?.status;
  if (status === 401) return new ErroHttp(502, 'A chave da OpenAI (OPENAI_API_KEY) foi recusada. Confira se ela está correta no arquivo api/.env.');
  if (status === 429) return new ErroHttp(502, 'A OpenAI recusou por limite de uso ou falta de créditos. Verifique o saldo da sua conta OpenAI.');
  if (status === 404) return new ErroHttp(502, `O modelo "${env.openaiModel}" não foi encontrado na sua conta OpenAI. Ajuste OPENAI_MODEL no arquivo api/.env.`);
  if (status === 400) {
    const detalhe = erro?.error?.message || erro?.message || '';
    return new ErroHttp(502, `A OpenAI recusou a requisição: ${detalhe}. Se mencionar "reasoning", deixe OPENAI_REASONING_EFFORT vazio no .env.`);
  }
  if (erro?.code === 'ENOTFOUND' || erro?.name === 'APIConnectionError') {
    return new ErroHttp(502, 'Não foi possível conectar à OpenAI. Verifique a internet.');
  }
  return new ErroHttp(502, 'O assistente não conseguiu responder agora. Tente de novo em instantes.');
}

export async function responder(usuario, mensagem) {
  const texto = String(mensagem || '').trim();
  if (!texto) throw new ErroHttp(400, 'Escreva uma mensagem.');
  if (texto.length > 4000) throw new ErroHttp(400, 'Mensagem muito longa (máximo de 4000 caracteres).');

  const openai = cliente();
  const conversa = (await Conversa.findOne({ usuario: usuario._id })) || new Conversa({ usuario: usuario._id, itens: [] });
  const entrada = [...conversa.itens, { role: 'user', content: texto }];
  const ferramentas = definicoesPara(usuario);
  const respostaAnterior = [...conversa.itens].reverse().find((i) => i.role === 'assistant')?.content || '';
  const ctx = { usuario, ultimaMensagem: texto, respostaAnterior, alterou: false, acoes: [], extras: [] };
  const comRaciocinio = Boolean(env.openaiReasoningEffort);

  let resposta = '';
  for (let passo = 0; passo < MAX_PASSOS; passo += 1) {
    let r;
    try {
      r = await openai.responses.create({
        model: env.openaiModel,
        instructions: instrucoes(usuario),
        input: entrada,
        tools: ferramentas,
        store: false,
        ...(comRaciocinio ? { reasoning: { effort: env.openaiReasoningEffort }, include: ['reasoning.encrypted_content'] } : {}),
      });
    } catch (erro) {
      console.error('[chat] erro da OpenAI:', erro?.status, erro?.message);
      throw traduzirErroOpenAI(erro);
    }

    const saida = r.output || [];
    entrada.push(...limparItens(saida, { manterRaciocinio: true }));
    const chamadas = saida.filter((i) => i.type === 'function_call');

    if (chamadas.length === 0) {
      resposta = (r.output_text || saida.filter((i) => i.type === 'message').map(textoDaMensagem).join('\n')).trim();
      break;
    }

    for (const chamada of chamadas) {
      const resultado = await executarFerramenta(ctx, chamada.name, chamada.arguments);
      entrada.push({ type: 'function_call_output', call_id: chamada.call_id, output: JSON.stringify(resultado) });
    }
  }

  if (!resposta) {
    resposta = ctx.alterou
      ? 'Fiz as alterações, mas não consegui terminar a resposta. Confira na tela e me diga se precisa de mais algo.'
      : 'Não consegui concluir esse pedido. Pode reformular de outro jeito?';
    entrada.push({ role: 'assistant', content: resposta });
  }

  conversa.itens = cortarHistorico(entrada);
  conversa.markModified('itens');
  await conversa.save();

  return { resposta, acoes: ctx.acoes, extras: ctx.extras, alterou: ctx.alterou };
}

// Mensagens para exibir na tela (só o que o usuário e o assistente escreveram).
export async function mensagensDaConversa(usuario) {
  const conversa = await Conversa.findOne({ usuario: usuario._id }).lean();
  return (conversa?.itens || [])
    .filter((i) => (i.role === 'user' || i.role === 'assistant') && typeof i.content === 'string')
    .map((i) => ({ papel: i.role === 'user' ? 'usuario' : 'assistente', texto: i.content }));
}

export async function limparConversa(usuario) {
  await Conversa.deleteOne({ usuario: usuario._id });
}

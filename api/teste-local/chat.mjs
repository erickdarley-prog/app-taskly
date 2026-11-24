// Testes do assistente com uma OpenAI SIMULADA (não gasta créditos).
import { conectarBanco, desconectarBanco } from '../src/config/db.js';
import { Usuario } from '../src/models/Usuario.js';
import { Projeto } from '../src/models/Projeto.js';
import { Tarefa } from '../src/models/Tarefa.js';
import { Conversa } from '../src/models/Conversa.js';
import { definirClienteOpenAI, responder, mensagensDaConversa } from '../src/chat/assistente.js';
import { definicoesPara, executarFerramenta } from '../src/chat/ferramentas.js';

let ok = 0, falhas = 0;
const chk = (n, c, x = '') => { if (c) ok++; else { falhas++; console.log('FALHOU:', n, x); } };

// Fila de respostas simuladas da "OpenAI"
const fila = []; const chamadas = [];
const msg = (t) => ({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] }], output_text: t });
const fn = (name, args, comRaciocinio = false) => ({ output: [
  ...(comRaciocinio ? [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'xyz', summary: [] }] : []),
  { type: 'function_call', id: 'fc_' + name, call_id: 'call_' + Math.random().toString(36).slice(2), name, arguments: JSON.stringify(args) }] });
definirClienteOpenAI({ responses: { create: async (p) => { chamadas.push(structuredClone(p)); if (!fila.length) throw new Error('fila vazia'); return fila.shift(); } } });
const ultimaSaida = (i = -1) => { const p = chamadas.at(i); return p.input.filter(x => x.type === 'function_call_output').map(x => JSON.parse(x.output)).at(-1); };

await conectarBanco();
const admin = await Usuario.findOne({ email: 'admin@taskly.local' });
const ana = await Usuario.findOne({ email: 'ana@taskly.local' });
await Conversa.deleteMany({});

// 1) Definições por perfil
const defAdm = definicoesPara(admin).map(d => d.name), defAna = definicoesPara(ana).map(d => d.name);
chk('admin tem 27 funções', defAdm.length === 27, defAdm.length);
chk('equipe sem funções de admin', !defAna.some(n => /criar|editar|excluir|integrante|usuarios|alterar/.test(n)), defAna);
chk('equipe tem 12', defAna.length === 12, defAna);

// 2) Conversa de criação de projeto em duas mensagens
fila.push(msg('Claro! Qual o nome do projeto e para qual cliente?'));
let r = await responder(admin, 'quero criar um projeto novo');
chk('pergunta', r.resposta.startsWith('Claro') && !r.alterou);
chk('instruções contêm data e perfil', chamadas[0].instructions.includes('ADMINISTRADOR') && /\d{4}-\d{2}-\d{2}/.test(chamadas[0].instructions));
chk('envia tools e store false', chamadas[0].tools.length === 27 && chamadas[0].store === false);

fila.push(fn('criar_projeto', { nome: 'Site institucional', cliente: 'Padaria Sol', prazo: '2026-12-20', integrantes: [{ pessoa: 'Ana', funcao: 'Front-end' }, { pessoa: 'joao@taskly.local', funcao: 'Back-end' }] }, true));
fila.push(msg('✅ Projeto Site institucional criado.'));
r = await responder(admin, 'Site institucional, cliente Padaria Sol, Ana no front e João no back, prazo 20/12');
const novo = await Projeto.findOne({ nome: 'Site institucional' }).populate('integrantes.usuario', 'nome');
chk('projeto criado', novo && novo.cliente === 'Padaria Sol' && novo.integrantes.length === 2, JSON.stringify(novo));
chk('prazo correto', novo && novo.prazo.toISOString().startsWith('2026-12-20'), novo?.prazo);
chk('alterou true', r.alterou === true && r.acoes[0].ferramenta === 'criar_projeto');
chk('histórico enviado na 2ª rodada', chamadas.at(-2).input.filter(i => i.role === 'user').length === 2);
chk('raciocínio mantido dentro da mesma resposta', chamadas.at(-1).input.some(i => i.type === 'reasoning'));
chk('function_call sem id', chamadas.at(-1).input.filter(i => i.type === 'function_call').every(i => !i.id));
const salva = await Conversa.findOne({ usuario: admin._id }).lean();
chk('raciocínio NÃO salvo', !salva.itens.some(i => i.type === 'reasoning'));
const msgs = await mensagensDaConversa(admin);
chk('mensagens para tela', msgs.length === 4 && msgs[0].papel === 'usuario' && msgs[3].papel === 'assistente', JSON.stringify(msgs));

// 3) Criar tarefa para alguém fora do projeto -> erro tratado
fila.push(fn('criar_tarefa', { projeto: 'Site institucional', titulo: 'Home', responsavel: 'Carla Mendes' }));
fila.push(msg('A Carla não participa desse projeto.'));
r = await responder(admin, 'cria a tarefa Home pra Carla no site');
chk('erro responsável fora', ultimaSaida().erro?.includes('integrante do projeto'), JSON.stringify(ultimaSaida()));
chk('não alterou', r.alterou === false);

fila.push(fn('criar_tarefa', { projeto: 'site institucional', titulo: 'Home', responsavel: 'Ana', prioridade: 'alta', prazo: '2026-12-01', horasEstimadas: 6 }));
fila.push(msg('Tarefa criada.'));
r = await responder(admin, 'então pra Ana, alta, dia 1/12, 6 horas');
const home = await Tarefa.findOne({ titulo: 'Home' });
chk('tarefa criada', home && String(home.responsavel) === String(ana._id) && home.prioridade === 'alta' && home.horasEstimadas === 6);

// 4) Equipe: status e horas na própria tarefa; recusa na alheia e em funções de admin
await Conversa.deleteMany({});
fila.push(fn('mudar_status_tarefa', { tarefa: 'Home', status: 'em_andamento' }));
fila.push(fn('lancar_horas', { tarefa: 'Home', horas: 2.5, nota: 'layout' }));
fila.push(msg('Feito!'));
r = await responder(ana, 'comecei a Home e trabalhei 2,5h');
const home2 = await Tarefa.findById(home._id);
chk('ana status', home2.status === 'em_andamento');
chk('ana horas', home2.horasGastas === 2.5);
chk('equipe recebeu 7 tools', chamadas.at(-1).tools.length === 12 && chamadas.at(-1).instructions.includes('EQUIPE'));

const portal = await Projeto.findOne({ nome: 'Portal do Aluno' });
const alheia = await Tarefa.findOne({ projeto: portal._id, responsavel: { $ne: ana._id }, status: { $ne: 'concluida' } });
const ctxAna = { usuario: ana, ultimaMensagem: 'x', alterou: false, acoes: [], extras: [] };
let s = await executarFerramenta(ctxAna, 'mudar_status_tarefa', JSON.stringify({ tarefa: String(alheia._id), status: 'concluida' }));
chk('ana tarefa alheia recusada', s.erro?.includes('próprias'), JSON.stringify(s));
s = await executarFerramenta(ctxAna, 'criar_projeto', JSON.stringify({ nome: 'X' }));
chk('ana criar_projeto recusado', s.erro?.includes('administradores'));
s = await executarFerramenta(ctxAna, 'ver_projeto', JSON.stringify({ projeto: 'App de Inventário' }));
chk('ana não vê projeto alheio', Boolean(s.erro), JSON.stringify(s));
s = await executarFerramenta(ctxAna, 'ver_projeto', JSON.stringify({ projeto: 'portal' }));
chk('ana vê portal (busca parcial)', s.nome === 'Portal do Aluno' && s.porIntegrante.length === 4, JSON.stringify(s).slice(0,200));
s = await executarFerramenta(ctxAna, 'minhas_tarefas', '{}');
chk('minhas tarefas', s.total >= 1 && s.tarefas.every(t => t.status !== 'concluida'));

// 5) Ambiguidade
const ctxAdm = () => ({ usuario: admin, ultimaMensagem: 'x', alterou: false, acoes: [], extras: [] });
s = await executarFerramenta(ctxAdm(), 'ver_tarefa', JSON.stringify({ tarefa: 'Roteiro do módulo' }));
chk('ambiguidade pede escolha', s.erro?.includes('Mais de uma tarefa'), JSON.stringify(s));
s = await executarFerramenta(ctxAdm(), 'ver_tarefa', JSON.stringify({ tarefa: 'roteiro do modulo 3' }));
chk('acentos ignorados', s.titulo === 'Roteiro do módulo 3', JSON.stringify(s));
s = await executarFerramenta(ctxAdm(), 'listar_tarefas', JSON.stringify({ projeto: 'Portal do Aluno', responsavel: 'João', atrasadas: false }));
chk('listar por responsável', s.tarefas.length > 0 && s.tarefas.every(t => t.responsavel === 'João Lima'), JSON.stringify(s).slice(0,300));

// 6) Exclusão exige confirmação
let c = ctxAdm(); c.ultimaMensagem = 'sim'; c.respostaAnterior = 'Tudo certo!';
s = await executarFerramenta(c, 'excluir_projeto', JSON.stringify({ projeto: 'Site institucional', confirmado: true }));
chk('sem pergunta de confirmação antes não exclui', s.precisaConfirmacao === true);
c = ctxAdm(); c.ultimaMensagem = 'exclui o site institucional'; c.respostaAnterior = 'Confirma a exclusão?';
s = await executarFerramenta(c, 'excluir_projeto', JSON.stringify({ projeto: 'Site institucional', confirmado: true }));
chk('sem confirmação do usuário não exclui', s.precisaConfirmacao === true && await Projeto.exists({ nome: 'Site institucional' }));
c = ctxAdm(); c.ultimaMensagem = 'não, espera'; c.respostaAnterior = 'Confirma a exclusão?';
s = await executarFerramenta(c, 'excluir_projeto', JSON.stringify({ projeto: 'Site institucional', confirmado: true }));
chk('negação não exclui', s.precisaConfirmacao === true);
c = ctxAdm(); c.ultimaMensagem = 'sim, pode excluir'; c.respostaAnterior = 'Confirma a exclusão do projeto?';
s = await executarFerramenta(c, 'excluir_projeto', JSON.stringify({ projeto: 'Site institucional', confirmado: false }));
chk('confirmado=false não exclui', s.precisaConfirmacao === true);
s = await executarFerramenta(c, 'excluir_projeto', JSON.stringify({ projeto: 'Site institucional', confirmado: true }));
chk('confirmado exclui', s.ok && !(await Projeto.exists({ nome: 'Site institucional' })) && !(await Tarefa.exists({ titulo: 'Home' })));

// 6b) Fluxo completo de exclusão pelo chat
await Conversa.deleteMany({});
await executarFerramenta(ctxAdm(), 'criar_projeto', JSON.stringify({ nome: 'Temp' }));
fila.push(fn('excluir_projeto', { projeto: 'Temp', confirmado: true })); // IA "apressada"
fila.push(msg('Confirma a exclusão do projeto "Temp"? Essa ação não pode ser desfeita.'));
r = await responder(admin, 'apaga o projeto Temp');
chk('IA apressada bloqueada', await Projeto.exists({ nome: 'Temp' }) && ultimaSaida().precisaConfirmacao);
fila.push(fn('excluir_projeto', { projeto: 'Temp', confirmado: true }));
fila.push(msg('Projeto Temp excluído.'));
r = await responder(admin, 'Sim');
chk('exclusão após sim', !(await Projeto.exists({ nome: 'Temp' })) && r.alterou);

// 7) Criar usuário: senha só na tela
c = ctxAdm();
s = await executarFerramenta(c, 'criar_usuario', JSON.stringify({ nome: 'Bruno Reis', email: 'bruno@taskly.local', funcao: 'Dados' }));
chk('usuário criado', s.ok && c.extras[0]?.senha?.length === 10 && !JSON.stringify(s).includes(c.extras[0].senha));
const bruno = await Usuario.findOne({ email: 'bruno@taskly.local' }).select('+senha');
chk('senha funciona', await bruno.conferirSenha(c.extras[0].senha));
s = await executarFerramenta(ctxAdm(), 'criar_usuario', JSON.stringify({ nome: 'Dup', email: 'bruno@taskly.local' }));
chk('email duplicado', /Já existe/.test(s.erro), JSON.stringify(s));
c = ctxAdm();
s = await executarFerramenta(c, 'editar_usuario', JSON.stringify({ usuario: 'Bruno', ativo: false, redefinirSenha: true }));
chk('desativa e redefine', s.ok && s.usuario.ativo === false && c.extras.length === 1, JSON.stringify(s));
s = await executarFerramenta(ctxAdm(), 'editar_usuario', JSON.stringify({ usuario: 'admin@taskly.local', papel: 'equipe' }));
chk('admin não se rebaixa', /próprio acesso/.test(s.erro));

// 8) Integrantes e edição
s = await executarFerramenta(ctxAdm(), 'adicionar_integrante', JSON.stringify({ projeto: 'App de Inventário', pessoa: 'Carla', funcao: 'Docs' }));
chk('add integrante', s.ok && (await Projeto.findOne({ nome: 'App de Inventário' })).integrantes.length === 3);
s = await executarFerramenta(ctxAdm(), 'remover_integrante', JSON.stringify({ projeto: 'App de Inventário', pessoa: 'Carla' }));
chk('remove integrante', s.ok && (await Projeto.findOne({ nome: 'App de Inventário' })).integrantes.length === 2);
s = await executarFerramenta(ctxAdm(), 'editar_projeto', JSON.stringify({ projeto: 'App de Inventário', status: 'em_andamento', prazo: '2027-02-10' }));
chk('edita projeto', s.ok && (await Projeto.findOne({ nome: 'App de Inventário' })).status === 'em_andamento');
s = await executarFerramenta(ctxAdm(), 'editar_tarefa', JSON.stringify({ tarefa: 'Plano de testes', prioridade: 'alta', responsavel: 'sem', prazo: '' }));
chk('edita tarefa', s.ok && s.tarefa.prioridade === 'alta' && s.tarefa.responsavel === null && s.tarefa.prazo === null, JSON.stringify(s));
s = await executarFerramenta(ctxAdm(), 'editar_projeto', JSON.stringify({ projeto: 'App de Inventário', prazo: '31/12/2026' }));
chk('data inválida', /Data inválida/.test(s.erro || ''), JSON.stringify(s));
s = await executarFerramenta(ctxAdm(), 'funcao_x', '{}');
chk('função desconhecida', /desconhecida/.test(s.erro));
s = await executarFerramenta(ctxAdm(), 'listar_projetos', '{bad json');
chk('json inválido', /JSON/.test(s.erro));

// 9) Limite de passos e erros da OpenAI
for (let i = 0; i < 8; i++) fila.push(fn('listar_projetos', {}));
r = await responder(admin, 'loop');
chk('limite de passos', /Não consegui concluir/.test(r.resposta), r.resposta);
fila.length = 0;
definirClienteOpenAI({ responses: { create: async () => { const e = new Error('bad key'); e.status = 401; throw e; } } });
try { await responder(admin, 'oi'); chk('erro 401', false); } catch (e) { chk('erro 401 traduzido', e.status === 502 && /OPENAI_API_KEY/.test(e.message), e.message); }


// 10) Marcos, escopo e diário pelo chat
definirClienteOpenAI({ responses: { create: async () => { throw new Error('não usado'); } } });
const ctxA = () => ({ usuario: admin, ultimaMensagem: 'x', respostaAnterior: '', alterou: false, acoes: [], extras: [] });
s = await executarFerramenta(ctxA(), 'criar_projeto', JSON.stringify({ nome: 'Plataforma Teste', cliente: 'Cliente T', contatoClienteNome: 'Ana Cliente', contatoClienteEmail: 'ana.cliente@example.com' }));
chk('cria projeto com contato do cliente', s.ok, s);
s = await executarFerramenta(ctxA(), 'criar_marco', JSON.stringify({ projeto: 'Plataforma Teste', titulo: 'Recopilar informação', inicio: '2026-11-01', entrega: '2026-11-04' }));
chk('cria marco', s.ok && s.marco.ordem === 1 && s.marco.entrega === '2026-11-04', s);
s = await executarFerramenta(ctxA(), 'criar_marco', JSON.stringify({ projeto: 'Plataforma Teste', titulo: 'Criar domínios', inicio: '2026-11-04', entrega: '2026-11-03' }));
chk('marco com datas invertidas', /antes da data de início/.test(s.erro || ''), s);
await executarFerramenta(ctxA(), 'criar_marco', JSON.stringify({ projeto: 'Plataforma Teste', titulo: 'Criar domínios', inicio: '2026-11-03', entrega: '2026-11-04' }));
s = await executarFerramenta(ctxA(), 'criar_tarefa', JSON.stringify({ projeto: 'Plataforma Teste', titulo: 'Fornecer informação', marco: 'recopilar', lado: 'cliente', responsavelCliente: 'Ana Cliente' }));
chk('tarefa do cliente no marco', s.ok && s.tarefa.lado === 'cliente' && s.tarefa.marco === 'Recopilar informação' && s.tarefa.responsavel === 'Ana Cliente', s);
s = await executarFerramenta(ctxA(), 'criar_tarefa', JSON.stringify({ projeto: 'Plataforma Teste', titulo: 'X', marco: 'inexistente' }));
chk('marco inexistente lista opções', /Marcos existentes/.test(s.erro || ''), s);
s = await executarFerramenta(ctxA(), 'editar_tarefa', JSON.stringify({ tarefa: 'Fornecer informação', marco: 'Criar domínios' }));
chk('move tarefa de marco', s.ok && s.tarefa.marco === 'Criar domínios', s);
s = await executarFerramenta(ctxA(), 'ver_marcos', JSON.stringify({ projeto: 'Plataforma Teste' }));
chk('visão linear', s.marcos.length === 2 && s.marcos[1].tarefas[0].titulo === 'Fornecer informação', s);
s = await executarFerramenta(ctxA(), 'alterar_escopo', JSON.stringify({ projeto: 'Plataforma Teste', adicionarIncluidos: ['Informes de alunos', 'Dashboard SEPE'], adicionarNaoIncluidos: ['Compra do domínio'] }));
chk('escopo em rascunho', s.ok && s.versao === 1 && s.incluidos.length === 2 && s.naoIncluidos.length === 1, s);
s = await executarFerramenta(ctxA(), 'alterar_escopo', JSON.stringify({ projeto: 'Plataforma Teste', remover: ['dashboard sepe'] }));
chk('remove item do escopo', s.incluidos.length === 1 && s.versao === 1, s);
s = await executarFerramenta(ctxA(), 'ver_escopo', JSON.stringify({ projeto: 'Plataforma Teste' }));
chk('ver escopo', s.emAndamento.status === 'rascunho' && !s.vigente && s.responsavelCliente.email === 'ana.cliente@example.com', s);
const ctxE = { usuario: ana, ultimaMensagem: 'x', alterou: false, acoes: [], extras: [] };
s = await executarFerramenta(ctxE, 'alterar_escopo', JSON.stringify({ projeto: 'Portal do Aluno', adicionarIncluidos: ['x'] }));
chk('equipe não altera escopo', /administradores/.test(s.erro), s);
s = await executarFerramenta(ctxE, 'registrar_diario', JSON.stringify({ projeto: 'Portal do Aluno', texto: 'Terminei o layout da home. Obs.: falta o ícone do menu.', marco: 'Execução' }));
chk('equipe registra no diário', s.ok, s);
s = await executarFerramenta(ctxE, 'ver_diario', JSON.stringify({ projeto: 'Portal do Aluno', dias: 3 }));
chk('ver diário', s.dias[0].registros.some((r) => r.texto.startsWith('Terminei o layout')), s);
s = await executarFerramenta(ctxA(), 'excluir_marco', JSON.stringify({ projeto: 'Plataforma Teste', marco: 'Criar domínios', confirmado: true }));
chk('excluir marco pede confirmação', s.precisaConfirmacao === true);
let cm = ctxA(); cm.ultimaMensagem = 'sim'; cm.respostaAnterior = 'Confirma a exclusão do marco?';
s = await executarFerramenta(cm, 'excluir_marco', JSON.stringify({ projeto: 'Plataforma Teste', marco: 'Criar domínios', confirmado: true }));
chk('exclui marco', s.ok && s.tarefasSemMarco === 1, s);
s = await executarFerramenta(ctxA(), 'ver_projeto', JSON.stringify({ projeto: 'Plataforma Teste' }));
chk('ver_projeto traz marcos e contato', s.marcos.length === 1 && s.responsavelCliente?.nome === 'Ana Cliente', s);

console.log(`\n${ok} verificações OK, ${falhas} falhas`);
await desconectarBanco();

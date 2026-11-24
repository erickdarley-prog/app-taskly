// Cria dados FAKE para teste. Apaga tudo o que estiver no banco "taskly"!
// Uso: npm run seed
import { conectarBanco, desconectarBanco } from './config/db.js';
import { Usuario } from './models/Usuario.js';
import { Projeto } from './models/Projeto.js';
import { Tarefa } from './models/Tarefa.js';
import { Historico } from './models/Historico.js';
import { Conversa } from './models/Conversa.js';
import { Marco } from './models/Marco.js';
import { Acordo } from './models/Acordo.js';
import { RegistroDiario } from './models/RegistroDiario.js';
import { criarProjetoAHK } from './seed-ahk.js';
import { Anexo } from './models/Anexo.js';
import { criarAnexosDeExemplo, limparUploads } from './seed-anexos.js';

const DIA = 24 * 60 * 60 * 1000;
const hoje = new Date();
hoje.setHours(12, 0, 0, 0);
const emDias = (n) => new Date(hoje.getTime() + n * DIA);

// Gerador pseudoaleatório fixo, para o seed gerar sempre os mesmos dados.
let semente = 42;
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646;
const escolherUm = (lista) => lista[Math.floor(aleatorio() * lista.length)];

const pessoas = [
  { nome: 'Admin Taskly', email: 'admin@taskly.local', senha: 'admin123', papel: 'admin', funcao: 'Gestor de projetos' },
  { nome: 'Ana Souza', email: 'ana@taskly.local', senha: '123456', papel: 'equipe', funcao: 'Front-end' },
  { nome: 'João Lima', email: 'joao@taskly.local', senha: '123456', papel: 'equipe', funcao: 'Back-end' },
  { nome: 'Maria Costa', email: 'maria@taskly.local', senha: '123456', papel: 'equipe', funcao: 'Design' },
  { nome: 'Pedro Alves', email: 'pedro@taskly.local', senha: '123456', papel: 'equipe', funcao: 'QA / Testes' },
  { nome: 'Carla Mendes', email: 'carla@taskly.local', senha: '123456', papel: 'equipe', funcao: 'Conteúdo' },
];

const projetosFake = [
  {
    nome: 'Portal do Aluno',
    cliente: 'Escola Horizonte',
    descricao: 'Novo portal para alunos acessarem cursos, notas e certificados.',
    status: 'em_andamento',
    contatoCliente: { nome: 'Rafael Torres', email: 'rafael.torres@example.com', cargo: 'Diretor pedagógico' },
    inicio: -30,
    prazo: 25,
    equipe: ['ana@taskly.local', 'joao@taskly.local', 'maria@taskly.local', 'pedro@taskly.local'],
    tarefas: [
      'Definir arquitetura da API', 'Modelar banco de dados', 'Criar tela de login', 'Layout da home',
      'Protótipo no Figma', 'Endpoint de cursos', 'Endpoint de notas', 'Tela de certificados',
      'Testes de login', 'Testes de responsividade', 'Integração com e-mail', 'Página de perfil',
      'Ícones e ilustrações', 'Revisar acessibilidade', 'Deploy em homologação',
    ],
  },
  {
    nome: 'Curso Segurança no Trabalho',
    cliente: 'Indústria Atlas',
    descricao: 'Curso e-learning de 20 horas em 4 módulos, com avaliações.',
    status: 'em_andamento',
    contatoCliente: { nome: 'Sônia Prado', email: 'sonia.prado@example.com', cargo: 'RH' },
    inicio: -14,
    prazo: 10,
    equipe: ['carla@taskly.local', 'maria@taskly.local', 'ana@taskly.local'],
    tarefas: [
      'Roteiro do módulo 1', 'Roteiro do módulo 2', 'Roteiro do módulo 3', 'Roteiro do módulo 4',
      'Design dos slides', 'Gravação de narração', 'Montagem SCORM', 'Questionários de avaliação',
      'Revisão pedagógica', 'Revisão ortográfica',
    ],
  },
  {
    nome: 'App de Inventário',
    cliente: 'Logística Rápida',
    descricao: 'Aplicativo interno para controle de estoque por leitura de código de barras.',
    status: 'planejamento',
    contatoCliente: { nome: 'Marcos Lima', email: 'marcos.lima@example.com', cargo: 'Gerente de operações' },
    inicio: 3,
    prazo: 60,
    equipe: ['joao@taskly.local', 'pedro@taskly.local'],
    tarefas: ['Levantamento de requisitos', 'Escolher leitor de código de barras', 'Modelo de dados', 'Plano de testes'],
  },
];

async function main() {
  await conectarBanco();

  await Promise.all([
    Historico.deleteMany({}),
    Tarefa.deleteMany({}),
    Projeto.deleteMany({}),
    Usuario.deleteMany({}),
    Conversa.deleteMany({}),
    Marco.deleteMany({}),
    Acordo.deleteMany({}),
    RegistroDiario.deleteMany({}),
    Anexo.deleteMany({}),
    limparUploads(),
  ]);

  const usuarios = [];
  for (const p of pessoas) usuarios.push(await Usuario.create(p));
  const porEmail = Object.fromEntries(usuarios.map((u) => [u.email, u]));
  const admin = porEmail['admin@taskly.local'];

  let totalTarefas = 0;
  for (const pf of projetosFake) {
    const integrantes = pf.equipe.map((email) => ({ usuario: porEmail[email]._id, funcao: porEmail[email].funcao }));
    const projeto = await Projeto.create({
      nome: pf.nome,
      cliente: pf.cliente,
      descricao: pf.descricao,
      status: pf.status,
      responsavel: admin._id,
      integrantes,
      dataInicio: emDias(pf.inicio),
      prazo: emDias(pf.prazo),
      responsavelCliente: pf.contatoCliente,
    });

    // Divide o projeto em 3 marcos, com as tarefas distribuídas entre eles.
    const duracao = pf.prazo - pf.inicio;
    const fases = ['Planejamento', 'Execução', 'Entrega e validação'];
    const marcos = await Marco.insertMany(
      fases.map((titulo, i) => ({
        projeto: projeto._id,
        titulo,
        ordem: i + 1,
        dataInicio: emDias(pf.inicio + Math.round((duracao * i) / 3)),
        dataFim: emDias(pf.inicio + Math.round((duracao * (i + 1)) / 3)),
      }))
    );

    const tarefas = pf.tarefas.map((titulo, i) => {
      const progresso = pf.status === 'planejamento' ? 0 : aleatorio();
      const status = progresso > 0.55 ? 'concluida' : progresso > 0.3 ? 'em_andamento' : 'a_fazer';
      const horasEstimadas = escolherUm([2, 4, 6, 8, 12, 16]);
      const fator = status === 'concluida' ? 0.7 + aleatorio() * 0.6 : status === 'em_andamento' ? aleatorio() * 0.8 : 0;
      // Algumas tarefas abertas ficam com prazo vencido, para aparecerem como atrasadas.
      const atrasar = pf.status !== 'planejamento' && status !== 'concluida' && aleatorio() < 0.3;
      let prazo;
      if (status === 'concluida') prazo = emDias(pf.inicio + 3 + i);
      else if (atrasar) prazo = emDias(-1 - Math.floor(aleatorio() * 5));
      else prazo = emDias(Math.max(pf.inicio, 0) + 2 + i * 2);
      return {
        projeto: projeto._id,
        titulo,
        marco: marcos[Math.min(2, Math.floor((i * 3) / pf.tarefas.length))]._id,
        lado: 'awakelab',
        descricao: `Tarefa de teste do projeto ${pf.nome}.`,
        responsavel: integrantes[i % integrantes.length].usuario,
        status,
        prioridade: escolherUm(['baixa', 'media', 'media', 'alta']),
        prazo,
        horasEstimadas,
        horasGastas: Math.round(horasEstimadas * fator * 10) / 10,
        concluidaEm: status === 'concluida' ? emDias(-Math.floor(aleatorio() * 10)) : undefined,
      };
    });
    const criadas = await Tarefa.insertMany(tarefas);
    await Historico.insertMany(
      criadas.map((t) => ({
        tarefa: t._id,
        projeto: projeto._id,
        usuario: admin._id,
        acao: 'criou',
        detalhes: { titulo: t.titulo },
        createdAt: emDias(Math.min(pf.inicio, 0)),
      })),
      { timestamps: false }
    );
    totalTarefas += criadas.length;
  }

  const ahk = await criarProjetoAHK({ porEmail, admin, emDias });
  totalTarefas += ahk.tarefas;
  const totalAnexos = await criarAnexosDeExemplo(ahk.projeto, porEmail, emDias);

  console.log(`\nSeed concluído: ${usuarios.length} usuários, ${projetosFake.length + 1} projetos, ${totalTarefas} tarefas.`);
  console.log(`Projeto completo de exemplo (marcos, escopo assinado, diário e ${totalAnexos} anexos): Plataforma AHK\n`);
  console.log('Logins de teste:');
  for (const p of pessoas) console.log(`  ${p.papel.padEnd(6)}  ${p.email.padEnd(22)} senha: ${p.senha}`);
  await desconectarBanco();
}

main().catch(async (erro) => {
  console.error('Erro no seed:', erro.message);
  await desconectarBanco();
  process.exit(1);
});

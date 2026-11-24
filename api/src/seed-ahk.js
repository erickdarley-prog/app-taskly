// Projeto de exemplo completo, seguindo o modelo pedido:
// marcos com tarefas da Awakelab e do Cliente, escopo assinado pelas duas partes e diário.
import { Projeto } from './models/Projeto.js';
import { Marco } from './models/Marco.js';
import { Tarefa } from './models/Tarefa.js';
import { Historico } from './models/Historico.js';
import { Acordo } from './models/Acordo.js';
import { RegistroDiario } from './models/RegistroDiario.js';
import { abrirRascunho, atualizarRascunho, assinarPelaEmpresa, concordarPublico, enviarParaAssinatura } from './servicos/acordos.js';

const A = 'awakelab';
const C = 'cliente';

// [título do marco, início, fim, tarefas: [título, lado, responsável (e-mail ou nome do cliente), status, prazo]]
const MARCOS = [
  ['Recopilar informação', -16, -13, [
    ['Fornecer dados da empresa, logos e cores', C, 'Laura Méndez', 'concluida', -14],
    ['Enviar lista de cursos que deseja oferecer', C, 'Laura Méndez', 'concluida', -13],
    ['Enviar catálogo de cursos e planos', A, 'carla@taskly.local', 'concluida', -15],
    ['Reunião de kickoff com o cliente', A, 'admin@taskly.local', 'concluida', -16],
  ]],
  ['Criar domínios', -14, -13, [
    ['Aprovar o nome do domínio', C, 'Laura Méndez', 'concluida', -14],
    ['Configurar DNS e subdomínios', A, 'joao@taskly.local', 'concluida', -13],
    ['Instalar certificado SSL', A, 'joao@taskly.local', 'concluida', -13],
  ]],
  ['Desdobrar a plataforma base com Moodle 4.5', -13, -12, [
    ['Instalar Moodle 4.5', A, 'joao@taskly.local', 'concluida', -12],
    ['Configurar idiomas, fuso e e-mails do sistema', A, 'joao@taskly.local', 'concluida', -12],
    ['Validar acesso de administrador', C, 'Laura Méndez', 'concluida', -12],
  ]],
  ['Proposta gráfica', -10, -3, [
    ['Criar duas propostas de layout', A, 'maria@taskly.local', 'concluida', -6],
    ['Escolher a proposta e enviar feedback', C, 'Laura Méndez', 'em_andamento', -2],
    ['Aplicar o tema escolhido no Moodle', A, 'maria@taskly.local', 'a_fazer', 2],
  ]],
  ['Informes e dashboard SEPE', -2, 8, [
    ['Informes detalhados de avanço de alunos', A, 'joao@taskly.local', 'em_andamento', 5],
    ['Dashboard administrativo para enviar ao SEPE', A, 'ana@taskly.local', 'a_fazer', 8],
    ['Enviar modelo de relatório exigido pelo SEPE', C, 'Laura Méndez', 'a_fazer', 1],
  ]],
  ['Carga de cursos e usuários', 6, 12, [
    ['Enviar planilha de alunos e tutores', C, 'Laura Méndez', 'a_fazer', 7],
    ['Importar cursos do catálogo', A, 'carla@taskly.local', 'a_fazer', 10],
    ['Importar usuários e matrículas', A, 'joao@taskly.local', 'a_fazer', 12],
  ]],
  ['Testes, treinamento e entrega', 12, 16, [
    ['Testes completos da plataforma', A, 'pedro@taskly.local', 'a_fazer', 14],
    ['Homologação pelo cliente', C, 'Laura Méndez', 'a_fazer', 15],
    ['Treinamento de administradores (2 h)', A, 'admin@taskly.local', 'a_fazer', 16],
  ]],
];

const ESCOPO = {
  incluidos: [
    'Plataforma Moodle 4.5 com domínio próprio e certificado SSL',
    'Tema gráfico personalizado com a identidade do cliente',
    'Informes detalhados de avanço de alunos',
    'Dashboard administrativo para enviar ao SEPE',
    'Carga inicial de até 20 cursos e dos usuários',
    'Treinamento de 2 horas para administradores',
  ],
  naoIncluidos: [
    'Compra do domínio',
    'Gestão de certificado SEPE',
    'Produção do conteúdo dos cursos',
    'Hospedagem após os primeiros 12 meses',
  ],
};

// [dia relativo, autor (e-mail), categoria, marco (índice), texto]
const DIARIO = [
  [-16, 'admin@taskly.local', 'reuniao', 0, 'Reunião de kickoff com Laura (AHK). Alinhado o objetivo: plataforma pronta para turmas de janeiro. Cliente pediu relatórios para o SEPE.'],
  [-15, 'carla@taskly.local', 'avanco', 0, 'Catálogo de cursos e planos enviado por e-mail para a Laura.'],
  [-14, 'joao@taskly.local', 'cliente', 1, 'Cliente aprovou o domínio "formacion-ahk". Compra do domínio fica com o cliente (fora do escopo).'],
  [-13, 'joao@taskly.local', 'avanco', 1, 'DNS propagado e SSL instalado. Domínio respondendo normalmente.'],
  [-12, 'joao@taskly.local', 'avanco', 2, 'Moodle 4.5 instalado e configurado (idioma espanhol, fuso Madrid). Acesso de administrador entregue ao cliente.'],
  [-12, 'admin@taskly.local', 'cliente', null, 'Acordo de especificações v1 revisado com a Laura por telefone antes do envio.'],
  [-9, 'maria@taskly.local', 'avanco', 3, 'Primeira proposta de layout pronta (azul institucional).'],
  [-6, 'maria@taskly.local', 'avanco', 3, 'Segunda proposta pronta e as duas enviadas ao cliente.'],
  [-4, 'admin@taskly.local', 'problema', 3, 'Cliente ainda não escolheu a proposta gráfica. Enviado lembrete; isso pode atrasar a aplicação do tema.'],
  [-2, 'joao@taskly.local', 'avanco', 4, 'Começamos os informes de avanço de alunos. Aguardando o modelo de relatório do SEPE (tarefa do cliente).'],
  [-1, 'admin@taskly.local', 'observacao', 3, 'Laura respondeu que decide a proposta até sexta. Mantido o prazo do tema.'],
];

export async function criarProjetoAHK({ porEmail, admin, emDias }) {
  const equipe = [
    ['joao@taskly.local', 'Back-end / Infraestrutura'],
    ['maria@taskly.local', 'Design'],
    ['ana@taskly.local', 'Front-end'],
    ['carla@taskly.local', 'Conteúdo'],
    ['pedro@taskly.local', 'QA / Testes'],
  ];
  const projeto = await Projeto.create({
    nome: 'Plataforma AHK',
    cliente: 'AHK (cliente exemplo)',
    descricao: 'Plataforma completa de formação em Moodle 4.5: domínio, tema gráfico, informes de alunos e dashboard para o SEPE.',
    status: 'em_andamento',
    responsavel: admin._id,
    responsavelCliente: { nome: 'Laura Méndez', email: 'laura.mendez@example.com', cargo: 'Coordenadora de formação' },
    integrantes: equipe.map(([email, funcao]) => ({ usuario: porEmail[email]._id, funcao })),
    dataInicio: emDias(-16),
    prazo: emDias(16),
  });

  const marcos = [];
  let totalTarefas = 0;
  for (const [i, [titulo, inicio, fim, tarefas]] of MARCOS.entries()) {
    const marco = await Marco.create({ projeto: projeto._id, titulo, ordem: i + 1, dataInicio: emDias(inicio), dataFim: emDias(fim) });
    marcos.push(marco);
    const docs = tarefas.map(([t, lado, resp, status, prazo]) => ({
      projeto: projeto._id,
      marco: marco._id,
      titulo: t,
      lado,
      responsavel: lado === A ? porEmail[resp]._id : undefined,
      responsavelExterno: lado === C ? resp : '',
      status,
      prioridade: lado === C && status !== 'concluida' ? 'alta' : 'media',
      prazo: emDias(prazo),
      horasEstimadas: lado === A ? 4 : 0,
      horasGastas: lado === A && status === 'concluida' ? 4 : lado === A && status === 'em_andamento' ? 2 : 0,
      concluidaEm: status === 'concluida' ? emDias(prazo) : undefined,
    }));
    const criadas = await Tarefa.insertMany(docs);
    // Histórico com datas do passado, para o diário mostrar cada coisa no dia em que aconteceu.
    const historicos = criadas.map((t) => ({
      tarefa: t._id,
      projeto: projeto._id,
      usuario: admin._id,
      acao: 'criou',
      detalhes: { titulo: t.titulo },
      createdAt: emDias(inicio - 1),
    }));
    for (const t of criadas) {
      if (t.status === 'a_fazer') continue;
      const quem = t.responsavel || admin._id;
      historicos.push({ tarefa: t._id, projeto: projeto._id, usuario: quem, acao: 'status', detalhes: { de: 'a_fazer', para: 'em_andamento' }, createdAt: emDias(Math.max(inicio, -16)) });
      if (t.status === 'concluida') {
        historicos.push({ tarefa: t._id, projeto: projeto._id, usuario: quem, acao: 'status', detalhes: { de: 'em_andamento', para: 'concluida' }, createdAt: t.concluidaEm });
      }
    }
    await Historico.insertMany(historicos, { timestamps: false });
    totalTarefas += criadas.length;
  }

  // Escopo v1 enviado, assinado pela Awakelab e aceito pelo cliente (fluxo real, e-mail em modo teste).
  const rascunho = await abrirRascunho(admin, projeto._id);
  await atualizarRascunho(admin, rascunho._id, ESCOPO);
  const { linkTeste } = await enviarParaAssinatura(admin, rascunho._id);
  await assinarPelaEmpresa(admin, rascunho._id, '127.0.0.1');
  if (linkTeste) await concordarPublico(linkTeste.split('/').pop(), { ip: '203.0.113.10', navegador: 'Seed (exemplo)' });
  // Ajusta as datas para parecer que aconteceu no início do projeto.
  await Acordo.updateOne(
    { _id: rascunho._id },
    {
      enviadoEm: emDias(-12),
      'assinaturaEmpresa.em': emDias(-12),
      'assinaturaCliente.em': emDias(-11),
      assinadoEm: emDias(-11),
      'emails.0.enviadoEm': emDias(-12),
      'emails.1.enviadoEm': emDias(-11),
    }
  );
  await RegistroDiario.deleteMany({ projeto: projeto._id, tipo: 'sistema' });
  await RegistroDiario.insertMany([
    { projeto: projeto._id, data: emDias(-12), tipo: 'sistema', categoria: 'cliente', texto: 'Acordo versão 1 enviado para Laura Méndez (laura.mendez@example.com) assinar.' },
    { projeto: projeto._id, data: emDias(-12), tipo: 'sistema', categoria: 'cliente', texto: 'Admin Taskly assinou o acordo versão 1 pela Awakelab.' },
    { projeto: projeto._id, data: emDias(-11), tipo: 'sistema', categoria: 'cliente', texto: 'Laura Méndez (cliente) concordou com o acordo versão 1 pelo e-mail.' },
    { projeto: projeto._id, data: emDias(-11), tipo: 'sistema', categoria: 'cliente', texto: 'Acordo de especificações versão 1 assinado pelas duas partes.' },
  ]);

  await RegistroDiario.insertMany(
    DIARIO.map(([dia, autor, categoria, iMarco, texto]) => ({
      projeto: projeto._id,
      data: emDias(dia),
      autor: porEmail[autor]._id,
      categoria,
      marco: iMarco === null ? undefined : marcos[iMarco]._id,
      texto,
      tipo: 'manual',
    }))
  );

  return { projeto, tarefas: totalTarefas };
}

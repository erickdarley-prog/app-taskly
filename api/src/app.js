import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRotas from './routes/auth.js';
import usuariosRotas from './routes/usuarios.js';
import projetosRotas from './routes/projetos.js';
import tarefasRotas from './routes/tarefas.js';
import chatRotas from './routes/chat.js';
import { rotasMarcos, rotasMarcosDoProjeto } from './routes/marcos.js';
import { rotasAcordos, rotasAcordosDoProjeto, rotasPublicas } from './routes/acordos.js';
import { rotasDiario, rotasDiarioDoProjeto } from './routes/diario.js';
import { rotasAnexos, rotasAnexosDoProjeto, rotasArquivos } from './routes/anexos.js';
import { rotaNaoEncontrada, tratarErros } from './middlewares/erros.js';

export function criarApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/saude', (_req, res) => res.json({ ok: true, app: 'Taskly API' }));

  app.use('/api/auth', authRotas);
  app.use('/api/usuarios', usuariosRotas);

  // Partes do projeto (registradas antes de /api/projetos/:id)
  app.use('/api/projetos/:id/marcos', rotasMarcosDoProjeto);
  app.use('/api/projetos/:id/acordos', rotasAcordosDoProjeto);
  app.use('/api/projetos/:id/diario', rotasDiarioDoProjeto);
  app.use('/api/projetos/:id/anexos', rotasAnexosDoProjeto);
  app.use('/api/projetos', projetosRotas);

  app.use('/api/tarefas', tarefasRotas);
  app.use('/api/marcos', rotasMarcos);
  app.use('/api/acordos', rotasAcordos);
  app.use('/api/diario', rotasDiario);
  app.use('/api/anexos', rotasAnexos);
  app.use('/api/arquivos', rotasArquivos); // ver/baixar anexos com link temporário
  app.use('/api/publico', rotasPublicas); // página do cliente para concordar com o acordo (sem login)
  app.use('/api/chat', chatRotas); // assistente de chat (pode ser removido sem afetar o resto)

  app.use(rotaNaoEncontrada);
  app.use(tratarErros);
  return app;
}

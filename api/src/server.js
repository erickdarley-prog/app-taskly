import { criarApp } from './app.js';
import { conectarBanco } from './config/db.js';
import { env } from './config/env.js';

try {
  await conectarBanco();
  criarApp().listen(env.port, () => {
    console.log(`Taskly API rodando em http://localhost:${env.port}/api`);
  });
} catch (erro) {
  console.error('Não foi possível conectar ao MongoDB.');
  console.error('Verifique se o MongoDB está rodando e se MONGO_URI no arquivo .env está correto.');
  console.error(erro.message);
  process.exit(1);
}

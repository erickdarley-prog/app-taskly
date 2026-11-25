import { crearApp } from './app.js';
import { conectarBd } from './config/db.js';
import { env } from './config/env.js';

try {
  await conectarBd();
  crearApp().listen(env.port, () => {
    console.log(`Taskly API funcionando en http://localhost:${env.port}/api`);
  });
} catch (error) {
  console.error('No se pudo conectar a MongoDB.');
  console.error('Comprueba que MongoDB está en marcha y que MONGO_URI en el archivo .env es correcto.');
  console.error(error.message);
  process.exit(1);
}

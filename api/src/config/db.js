import mongoose from 'mongoose';
import { env } from './env.js';

export async function conectarBd(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`MongoDB conectado: ${mongoose.connection.name}`);
}

export async function desconectarBd() {
  await mongoose.disconnect();
}

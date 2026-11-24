import mongoose from 'mongoose';
import { env } from './env.js';

export async function conectarBanco(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`MongoDB conectado: ${mongoose.connection.name}`);
}

export async function desconectarBanco() {
  await mongoose.disconnect();
}

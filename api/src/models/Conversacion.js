import mongoose from 'mongoose';

// Conversación del asistente de chat: una conversación activa por usuario.
// "items" guarda los mensajes y las llamadas a funciones en el formato de OpenAI.
const conversacionSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const Conversacion = mongoose.model('Conversacion', conversacionSchema, 'conversaciones');

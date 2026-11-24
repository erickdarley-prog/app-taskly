import mongoose from 'mongoose';

// Conversa do assistente de chat: uma conversa ativa por usuário.
// "itens" guarda as mensagens e as chamadas de função no formato da OpenAI.
const conversaSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, unique: true },
    itens: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const Conversa = mongoose.model('Conversa', conversaSchema);

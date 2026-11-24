import mongoose from 'mongoose';

// Registro de quem mudou o quê e quando em cada tarefa.
const historicoSchema = new mongoose.Schema(
  {
    tarefa: { type: mongoose.Schema.Types.ObjectId, ref: 'Tarefa', required: true },
    projeto: { type: mongoose.Schema.Types.ObjectId, ref: 'Projeto', required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    acao: {
      type: String,
      enum: ['criou', 'editou', 'status', 'horas', 'excluiu'],
      required: true,
    },
    detalhes: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

historicoSchema.index({ tarefa: 1, createdAt: -1 });
historicoSchema.index({ projeto: 1, createdAt: -1 });

export const Historico = mongoose.model('Historico', historicoSchema);

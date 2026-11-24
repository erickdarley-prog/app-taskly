import mongoose from 'mongoose';

export const STATUS_TAREFA = ['a_fazer', 'em_andamento', 'concluida'];
export const PRIORIDADES = ['baixa', 'media', 'alta'];
export const LADOS = ['awakelab', 'cliente'];

const tarefaSchema = new mongoose.Schema(
  {
    projeto: { type: mongoose.Schema.Types.ObjectId, ref: 'Projeto', required: true },
    marco: { type: mongoose.Schema.Types.ObjectId, ref: 'Marco' },
    // De quem é a tarefa: da Awakelab ou do Cliente
    lado: { type: String, enum: LADOS, default: 'awakelab' },
    // Para tarefas do cliente: nome de quem faz do lado do cliente (opcional, texto livre)
    responsavelExterno: { type: String, trim: true, maxlength: 120, default: '' },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    descricao: { type: String, trim: true, maxlength: 5000, default: '' },
    responsavel: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    status: { type: String, enum: STATUS_TAREFA, default: 'a_fazer' },
    prioridade: { type: String, enum: PRIORIDADES, default: 'media' },
    prazo: { type: Date },
    horasEstimadas: { type: Number, min: 0, default: 0 },
    horasGastas: { type: Number, min: 0, default: 0 },
    concluidaEm: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// "Atrasada" não é gravada: é calculada (prazo vencido e não concluída).
tarefaSchema.virtual('atrasada').get(function atrasada() {
  return Boolean(this.prazo && this.status !== 'concluida' && this.prazo < new Date());
});

tarefaSchema.index({ projeto: 1, status: 1 });
tarefaSchema.index({ projeto: 1, responsavel: 1 });
tarefaSchema.index({ responsavel: 1, status: 1 });
tarefaSchema.index({ projeto: 1, prazo: 1 });
tarefaSchema.index({ projeto: 1, marco: 1 });

export const Tarefa = mongoose.model('Tarefa', tarefaSchema);

import mongoose from 'mongoose';

export const STATUS_PROJETO = ['planejamento', 'em_andamento', 'pausado', 'concluido'];

const integranteSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    funcao: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { _id: false }
);

const projetoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true, maxlength: 150 },
    descricao: { type: String, trim: true, maxlength: 5000, default: '' },
    cliente: { type: String, trim: true, maxlength: 150, default: '' },
    // Responsável do lado da empresa (Awakelab)
    responsavel: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Responsável do lado do cliente (não tem login; assina o acordo por e-mail)
    responsavelCliente: {
      nome: { type: String, trim: true, maxlength: 120, default: '' },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
        validate: { validator: (v) => !v || /^\S+@\S+\.\S+$/.test(v), message: 'E-mail do responsável do cliente inválido' },
      },
      cargo: { type: String, trim: true, maxlength: 120, default: '' },
    },
    integrantes: { type: [integranteSchema], default: [] },
    status: { type: String, enum: STATUS_PROJETO, default: 'planejamento' },
    dataInicio: { type: Date },
    prazo: { type: Date },
  },
  { timestamps: true }
);

projetoSchema.index({ 'integrantes.usuario': 1 });
projetoSchema.index({ responsavel: 1 });
projetoSchema.index({ status: 1, updatedAt: -1 });
projetoSchema.index({ nome: 'text', cliente: 'text' });

export const Projeto = mongoose.model('Projeto', projetoSchema);

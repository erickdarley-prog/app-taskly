import mongoose from 'mongoose';

// Acordo de especificações (escopo) do projeto, com versões.
// Cada alteração gera uma nova versão, que precisa das duas assinaturas:
//  - Awakelab: botão dentro do sistema (responsável do projeto)
//  - Cliente: botão "Concordo" no e-mail recebido
export const STATUS_ACORDO = ['rascunho', 'aguardando', 'assinado', 'substituido', 'cancelado'];

const itemSchema = new mongoose.Schema({ texto: { type: String, required: true, trim: true, maxlength: 500 } }, { _id: false });

const emailSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ['pedido', 'confirmacao'], required: true },
    modo: { type: String, enum: ['pessoal', 'geral', 'teste'], required: true },
    de: String,
    para: [String],
    assunto: String,
    html: String,
    enviadoEm: Date,
    idMensagem: String,
  },
  { _id: false }
);

const acordoSchema = new mongoose.Schema(
  {
    projeto: { type: mongoose.Schema.Types.ObjectId, ref: 'Projeto', required: true },
    versao: { type: Number, required: true },
    status: { type: String, enum: STATUS_ACORDO, default: 'rascunho' },
    incluidos: { type: [itemSchema], default: [] },
    naoIncluidos: { type: [itemSchema], default: [] },
    observacoes: { type: String, trim: true, maxlength: 3000, default: '' },
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },

    // Envio para assinatura
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    enviadoEm: Date,
    cliente: { nome: String, email: String, cargo: String }, // para quem foi enviado (cópia do momento)
    tokenHash: { type: String, select: false },
    tokenExpiraEm: Date,

    assinaturaEmpresa: {
      usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      nome: String,
      email: String,
      em: Date,
      ip: String,
    },
    assinaturaCliente: {
      nome: String,
      email: String,
      em: Date,
      ip: String,
      navegador: String,
    },
    assinadoEm: Date,
    emails: { type: [emailSchema], default: [] },
  },
  { timestamps: true }
);

acordoSchema.index({ projeto: 1, versao: -1 }, { unique: true });
acordoSchema.index({ tokenHash: 1 }, { sparse: true });

export const Acordo = mongoose.model('Acordo', acordoSchema);

import mongoose from 'mongoose';

// Anexo de um projeto. O arquivo em si fica no disco (pasta uploads); aqui ficam os dados dele.
export const TIPOS_ANEXO = ['video', 'imagem', 'documento', 'arquivo'];

const anexoSchema = new mongoose.Schema(
  {
    projeto: { type: mongoose.Schema.Types.ObjectId, ref: 'Projeto', required: true },
    nome: { type: String, required: true, trim: true, maxlength: 255 }, // nome original do arquivo
    tipo: { type: String, enum: TIPOS_ANEXO, required: true },
    extensao: { type: String, default: '' },
    mime: { type: String, default: 'application/octet-stream' },
    tamanho: { type: Number, required: true }, // em bytes
    arquivo: { type: String, required: true, select: false }, // nome do arquivo salvo no disco
    descricao: { type: String, trim: true, maxlength: 1000, default: '' },
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
);

anexoSchema.index({ projeto: 1, createdAt: -1 });
anexoSchema.index({ projeto: 1, tipo: 1 });

export const Anexo = mongoose.model('Anexo', anexoSchema);

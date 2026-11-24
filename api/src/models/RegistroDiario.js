import mongoose from 'mongoose';

export const CATEGORIAS_DIARIO = ['avanco', 'observacao', 'problema', 'reuniao', 'cliente'];

// Diário do projeto: o que aconteceu em cada dia, com observações.
// tipo "manual" = escrito por alguém; "sistema" = registrado automaticamente (ex.: acordo assinado).
const registroSchema = new mongoose.Schema(
  {
    projeto: { type: mongoose.Schema.Types.ObjectId, ref: 'Projeto', required: true },
    data: { type: Date, required: true }, // dia a que o registro se refere
    texto: { type: String, required: true, trim: true, maxlength: 5000 },
    categoria: { type: String, enum: CATEGORIAS_DIARIO, default: 'avanco' },
    marco: { type: mongoose.Schema.Types.ObjectId, ref: 'Marco' },
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    tipo: { type: String, enum: ['manual', 'sistema'], default: 'manual' },
  },
  { timestamps: true }
);

registroSchema.index({ projeto: 1, data: -1, createdAt: -1 });

export const RegistroDiario = mongoose.model('RegistroDiario', registroSchema);

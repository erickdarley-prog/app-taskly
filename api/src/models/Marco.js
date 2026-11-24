import mongoose from 'mongoose';

// Marco (hito): uma etapa do projeto, com datas aproximadas de início e entrega.
const marcoSchema = new mongoose.Schema(
  {
    projeto: { type: mongoose.Schema.Types.ObjectId, ref: 'Projeto', required: true },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    descricao: { type: String, trim: true, maxlength: 5000, default: '' },
    dataInicio: { type: Date },
    dataFim: { type: Date },
    ordem: { type: Number, default: 0 },
  },
  { timestamps: true }
);

marcoSchema.index({ projeto: 1, ordem: 1, dataInicio: 1 });

export const Marco = mongoose.model('Marco', marcoSchema);

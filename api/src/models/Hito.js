import mongoose from 'mongoose';

// Hito: una etapa del proyecto, con fechas aproximadas de inicio y entrega.
const hitoSchema = new mongoose.Schema(
  {
    proyecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    descripcion: { type: String, trim: true, maxlength: 5000, default: '' },
    fechaInicio: { type: Date },
    fechaFin: { type: Date },
    orden: { type: Number, default: 0 },
  },
  { timestamps: true }
);

hitoSchema.index({ proyecto: 1, orden: 1, fechaInicio: 1 });

export const Hito = mongoose.model('Hito', hitoSchema);

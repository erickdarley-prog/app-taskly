import mongoose from 'mongoose';

export const CATEGORIAS_DIARIO = ['avance', 'observacion', 'problema', 'reunion', 'cliente'];

// Diario del proyecto: lo que pasó cada día, con observaciones.
// tipo "manual" = escrito por alguien; "sistema" = registrado automáticamente (p. ej.: acuerdo firmado).
const registroSchema = new mongoose.Schema(
  {
    proyecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true },
    fecha: { type: Date, required: true }, // día al que se refiere el registro
    texto: { type: String, required: true, trim: true, maxlength: 5000 },
    categoria: { type: String, enum: CATEGORIAS_DIARIO, default: 'avance' },
    hito: { type: mongoose.Schema.Types.ObjectId, ref: 'Hito' },
    autor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    tipo: { type: String, enum: ['manual', 'sistema'], default: 'manual' },
  },
  { timestamps: true }
);

registroSchema.index({ proyecto: 1, fecha: -1, createdAt: -1 });

export const RegistroDiario = mongoose.model('RegistroDiario', registroSchema);

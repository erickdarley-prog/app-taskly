import mongoose from 'mongoose';

// Adjunto de un proyecto. El archivo en sí está en el disco (carpeta uploads); aquí se guardan sus datos.
export const TIPOS_ADJUNTO = ['video', 'imagen', 'documento', 'archivo'];

const adjuntoSchema = new mongoose.Schema(
  {
    proyecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 255 }, // nombre original del archivo
    tipo: { type: String, enum: TIPOS_ADJUNTO, required: true },
    extension: { type: String, default: '' },
    mime: { type: String, default: 'application/octet-stream' },
    tamano: { type: Number, required: true }, // en bytes
    archivo: { type: String, required: true, select: false }, // nombre del archivo guardado en el disco
    descripcion: { type: String, trim: true, maxlength: 1000, default: '' },
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  },
  { timestamps: true }
);

adjuntoSchema.index({ proyecto: 1, createdAt: -1 });
adjuntoSchema.index({ proyecto: 1, tipo: 1 });

export const Adjunto = mongoose.model('Adjunto', adjuntoSchema);

import mongoose from 'mongoose';

// Registro de quién cambió qué y cuándo en cada tarea.
const historialSchema = new mongoose.Schema(
  {
    tarea: { type: mongoose.Schema.Types.ObjectId, ref: 'Tarea', required: true },
    proyecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    accion: {
      type: String,
      enum: ['creo', 'edito', 'status', 'horas', 'elimino'],
      required: true,
    },
    detalles: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

historialSchema.index({ tarea: 1, createdAt: -1 });
historialSchema.index({ proyecto: 1, createdAt: -1 });

export const Historial = mongoose.model('Historial', historialSchema, 'historiales');

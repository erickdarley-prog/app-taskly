import mongoose from 'mongoose';

export const STATUS_TAREA = ['por_hacer', 'en_curso', 'completada'];
export const PRIORIDADES = ['baja', 'media', 'alta'];
export const LADOS = ['awakelab', 'cliente'];

const tareaSchema = new mongoose.Schema(
  {
    proyecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true },
    hito: { type: mongoose.Schema.Types.ObjectId, ref: 'Hito' },
    // De quién es la tarea: de Awakelab o del Cliente
    lado: { type: String, enum: LADOS, default: 'awakelab' },
    // Para tareas del cliente: nombre de quien la hace en el lado del cliente (opcional, texto libre)
    responsableExterno: { type: String, trim: true, maxlength: 120, default: '' },
    titulo: { type: String, required: true, trim: true, maxlength: 200 },
    descripcion: { type: String, trim: true, maxlength: 5000, default: '' },
    responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    status: { type: String, enum: STATUS_TAREA, default: 'por_hacer' },
    prioridad: { type: String, enum: PRIORIDADES, default: 'media' },
    plazo: { type: Date },
    horasEstimadas: { type: Number, min: 0, default: 0 },
    horasGastadas: { type: Number, min: 0, default: 0 },
    completadaEn: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// "Atrasada" no se guarda: se calcula (plazo vencido y no completada).
tareaSchema.virtual('atrasada').get(function atrasada() {
  return Boolean(this.plazo && this.status !== 'completada' && this.plazo < new Date());
});

tareaSchema.index({ proyecto: 1, status: 1 });
tareaSchema.index({ proyecto: 1, responsable: 1 });
tareaSchema.index({ responsable: 1, status: 1 });
tareaSchema.index({ proyecto: 1, plazo: 1 });
tareaSchema.index({ proyecto: 1, hito: 1 });

export const Tarea = mongoose.model('Tarea', tareaSchema);

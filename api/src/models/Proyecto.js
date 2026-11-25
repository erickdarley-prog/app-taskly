import mongoose from 'mongoose';

export const STATUS_PROYECTO = ['planificacion', 'en_curso', 'pausado', 'completado'];

const integranteSchema = new mongoose.Schema(
  {
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    funcion: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { _id: false }
);

const proyectoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 150 },
    descripcion: { type: String, trim: true, maxlength: 5000, default: '' },
    cliente: { type: String, trim: true, maxlength: 150, default: '' },
    // Responsable del lado de la empresa (Awakelab)
    responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Responsable del lado del cliente (no tiene login; firma el acuerdo por e-mail)
    responsableCliente: {
      nombre: { type: String, trim: true, maxlength: 120, default: '' },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: '',
        validate: { validator: (v) => !v || /^\S+@\S+\.\S+$/.test(v), message: 'E-mail del responsable del cliente no válido' },
      },
      cargo: { type: String, trim: true, maxlength: 120, default: '' },
    },
    integrantes: { type: [integranteSchema], default: [] },
    status: { type: String, enum: STATUS_PROYECTO, default: 'planificacion' },
    fechaInicio: { type: Date },
    plazo: { type: Date },
  },
  { timestamps: true }
);

proyectoSchema.index({ 'integrantes.usuario': 1 });
proyectoSchema.index({ responsable: 1 });
proyectoSchema.index({ status: 1, updatedAt: -1 });
proyectoSchema.index({ nombre: 'text', cliente: 'text' });

export const Proyecto = mongoose.model('Proyecto', proyectoSchema);

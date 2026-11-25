import mongoose from 'mongoose';

// Acuerdo de especificaciones (alcance) del proyecto, con versiones.
// Cada cambio genera una nueva versión, que necesita las dos firmas:
//  - Awakelab: botón dentro del sistema (responsable del proyecto)
//  - Cliente: botón "Acepto" en el e-mail recibido
export const STATUS_ACUERDO = ['borrador', 'esperando', 'firmado', 'sustituido', 'cancelado'];

const itemSchema = new mongoose.Schema({ texto: { type: String, required: true, trim: true, maxlength: 500 } }, { _id: false });

const emailSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ['pedido', 'confirmacion'], required: true },
    modo: { type: String, enum: ['personal', 'general', 'prueba'], required: true },
    de: String,
    para: [String],
    asunto: String,
    html: String,
    enviadoEn: Date,
    idMensaje: String,
  },
  { _id: false }
);

const acuerdoSchema = new mongoose.Schema(
  {
    proyecto: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true },
    version: { type: Number, required: true },
    status: { type: String, enum: STATUS_ACUERDO, default: 'borrador' },
    incluidos: { type: [itemSchema], default: [] },
    noIncluidos: { type: [itemSchema], default: [] },
    observaciones: { type: String, trim: true, maxlength: 3000, default: '' },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },

    // Envío a firma
    enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    enviadoEn: Date,
    cliente: { nombre: String, email: String, cargo: String }, // a quién se envió (copia del momento)
    tokenHash: { type: String, select: false },
    tokenExpiraEn: Date,

    firmaEmpresa: {
      usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
      nombre: String,
      email: String,
      fecha: Date,
      ip: String,
    },
    firmaCliente: {
      nombre: String,
      email: String,
      fecha: Date,
      ip: String,
      navegador: String,
    },
    firmadoEn: Date,
    emails: { type: [emailSchema], default: [] },
  },
  { timestamps: true }
);

acuerdoSchema.index({ proyecto: 1, version: -1 }, { unique: true });
acuerdoSchema.index({ tokenHash: 1 }, { sparse: true });

export const Acuerdo = mongoose.model('Acuerdo', acuerdoSchema);

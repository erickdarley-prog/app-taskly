import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['admin', 'equipo'];

const usuarioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'E-mail no válido'],
    },
    contrasena: { type: String, required: true, minlength: 6, select: false },
    rol: { type: String, enum: ROLES, default: 'equipo' },
    funcion: { type: String, trim: true, maxlength: 80, default: '' },
    activo: { type: Boolean, default: true },
    // Cuenta de e-mail usada para ENVIAR e-mails en nombre de este usuario (p. ej.: acuerdo para el cliente).
    emailEnvio: {
      host: { type: String, trim: true, default: '' },
      puerto: { type: Number, default: 587 },
      seguro: { type: Boolean, default: false }, // true = SSL directo (puerto 465)
      usuario: { type: String, trim: true, default: '' },
      contrasenaCifrada: { type: String, default: '', select: false },
      nombreRemitente: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

usuarioSchema.pre('save', async function cifrarContrasena(next) {
  if (!this.isModified('contrasena')) return next();
  this.contrasena = await bcrypt.hash(this.contrasena, 10);
  next();
});

usuarioSchema.methods.comprobarContrasena = function comprobarContrasena(contrasena) {
  return bcrypt.compare(contrasena, this.contrasena);
};

usuarioSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.contrasena;
    delete ret.__v;
    if (ret.emailEnvio) {
      delete ret.emailEnvio.contrasenaCifrada;
      ret.emailEnvio.configurado = Boolean(ret.emailEnvio.host && ret.emailEnvio.usuario);
    }
    return ret;
  },
});

export const Usuario = mongoose.model('Usuario', usuarioSchema);

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const PAPEIS = ['admin', 'equipe'];

const usuarioSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'E-mail inválido'],
    },
    senha: { type: String, required: true, minlength: 6, select: false },
    papel: { type: String, enum: PAPEIS, default: 'equipe' },
    funcao: { type: String, trim: true, maxlength: 80, default: '' },
    ativo: { type: Boolean, default: true },
    // Conta de e-mail usada para ENVIAR e-mails em nome deste usuário (ex.: acordo para o cliente).
    emailEnvio: {
      host: { type: String, trim: true, default: '' },
      porta: { type: Number, default: 587 },
      seguro: { type: Boolean, default: false }, // true = SSL direto (porta 465)
      usuario: { type: String, trim: true, default: '' },
      senhaCifrada: { type: String, default: '', select: false },
      nomeRemetente: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

usuarioSchema.pre('save', async function criptografarSenha(next) {
  if (!this.isModified('senha')) return next();
  this.senha = await bcrypt.hash(this.senha, 10);
  next();
});

usuarioSchema.methods.conferirSenha = function conferirSenha(senha) {
  return bcrypt.compare(senha, this.senha);
};

usuarioSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.senha;
    delete ret.__v;
    if (ret.emailEnvio) {
      delete ret.emailEnvio.senhaCifrada;
      ret.emailEnvio.configurado = Boolean(ret.emailEnvio.host && ret.emailEnvio.usuario);
    }
    return ret;
  },
});

export const Usuario = mongoose.model('Usuario', usuarioSchema);

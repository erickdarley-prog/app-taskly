import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taskly',
  jwtSecret: process.env.JWT_SECRET || 'dev-solo-local-cambiar-en-env',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Dirección del front, usada en los enlaces enviados por e-mail (p. ej.: botón "Acepto" del cliente).
  // Para que el cliente abra el enlace desde fuera, el sistema debe estar publicado en una dirección accesible.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  huso: process.env.APP_HUSO || 'America/Sao_Paulo',
  // Clave para cifrar las contraseñas de e-mail guardadas en la base de datos (si está vacía, usa JWT_SECRET).
  claveCifra: process.env.CLAVE_CIFRA || process.env.JWT_SECRET || 'dev-solo-local-cambiar-en-env',
  // E-mail general (opcional): lo usa quien no haya configurado su propio e-mail en "Mi cuenta".
  smtp: {
    host: process.env.SMTP_HOST || '',
    puerto: Number(process.env.SMTP_PUERTO) || 587,
    seguro: process.env.SMTP_SEGURO === 'true',
    usuario: process.env.SMTP_USUARIO || '',
    contrasena: process.env.SMTP_CONTRASENA || '',
    remitente: process.env.SMTP_REMITENTE || '',
  },

  // Adjuntos de los proyectos: carpeta donde se guardan los archivos y tamaño máximo por archivo (MB)
  carpetaUploads: process.env.CARPETA_UPLOADS || '',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 500,

  // Asistente de chat (OpenAI)
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-6.1-terra',
  // Déjalo vacío si el modelo elegido no es de razonamiento (p. ej.: gpt-4o).
  openaiReasoningEffort: process.env.OPENAI_REASONING_EFFORT ?? 'low',
};

import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taskly',
  jwtSecret: process.env.JWT_SECRET || 'dev-somente-local-troque-no-env',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Endereço do front, usado nos links enviados por e-mail (ex.: botão "Concordo" do cliente).
  // Para o cliente abrir o link de fora, o sistema precisa estar publicado num endereço acessível.
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  fuso: process.env.APP_FUSO || 'America/Sao_Paulo',
  // Chave para cifrar as senhas de e-mail guardadas no banco (se vazia, usa JWT_SECRET).
  chaveCifra: process.env.CHAVE_CIFRA || process.env.JWT_SECRET || 'dev-somente-local-troque-no-env',
  // E-mail geral (opcional): usado por quem não configurou o próprio e-mail em "Minha conta".
  smtp: {
    host: process.env.SMTP_HOST || '',
    porta: Number(process.env.SMTP_PORTA) || 587,
    seguro: process.env.SMTP_SEGURO === 'true',
    usuario: process.env.SMTP_USUARIO || '',
    senha: process.env.SMTP_SENHA || '',
    remetente: process.env.SMTP_REMETENTE || '',
  },

  // Anexos dos projetos: pasta onde os arquivos ficam e tamanho máximo por arquivo (MB)
  pastaUploads: process.env.PASTA_UPLOADS || '',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 500,

  // Assistente de chat (OpenAI)
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-6.1-terra',
  // Deixe vazio se o modelo escolhido não for de raciocínio (ex.: gpt-4o).
  openaiReasoningEffort: process.env.OPENAI_REASONING_EFFORT ?? 'low',
};

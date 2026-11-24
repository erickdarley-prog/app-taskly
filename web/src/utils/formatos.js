export const STATUS_PROJETO = {
  planejamento: 'Planejamento',
  em_andamento: 'Em andamento',
  pausado: 'Pausado',
  concluido: 'Concluído',
};

export const STATUS_TAREFA = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

export const PRIORIDADES = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const LADOS = {
  awakelab: 'Awakelab',
  cliente: 'Cliente',
};

export const STATUS_MARCO = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

export const STATUS_ACORDO = {
  rascunho: 'Rascunho',
  aguardando: 'Aguardando assinaturas',
  assinado: 'Assinado',
  substituido: 'Substituído',
  cancelado: 'Cancelado',
};

export const CATEGORIAS_DIARIO = {
  avanco: 'Avanço',
  observacao: 'Observação',
  problema: 'Problema',
  reuniao: 'Reunião',
  cliente: 'Cliente',
};

// "AAAA-MM-DD" -> "seg., 16/11/2026"
export function formatarDia(dia) {
  const d = new Date(`${dia}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// "01/11" (dia e mês, para datas de marcos)
export function formatarDiaMes(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function hojeISO() {
  const d = new Date();
  const fuso = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - fuso).toISOString().slice(0, 10);
}

export function formatarData(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatarDataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Converte data da API para o formato do <input type="date"> (AAAA-MM-DD).
export function paraInputData(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  const fuso = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - fuso).toISOString().slice(0, 10);
}

// Converte o valor do <input type="date"> para meio-dia local, evitando "voltar um dia" por fuso.
export function deInputData(valor) {
  if (!valor) return null;
  return new Date(`${valor}T12:00:00`).toISOString();
}

export function formatarHoras(h) {
  const n = Number(h) || 0;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

// "2,5/8 h" (gastas/estimadas)
export function formatarHorasPar(gastas, estimadas) {
  const f = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${f(gastas)}/${f(estimadas)} h`;
}

export function iniciais(nome = '') {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// 1536 -> "1,5 KB"
export function formatarTamanho(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[i]}`;
}

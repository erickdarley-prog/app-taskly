export const STATUS_PROYECTO = {
  planificacion: 'Planificación',
  en_curso: 'En curso',
  pausado: 'Pausado',
  completado: 'Completado',
};

export const STATUS_TAREA = {
  por_hacer: 'Por hacer',
  en_curso: 'En curso',
  completada: 'Completada',
};

export const PRIORIDADES = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

export const LADOS = {
  awakelab: 'Awakelab',
  cliente: 'Cliente',
};

export const STATUS_HITO = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completado: 'Completado',
};

export const STATUS_ACUERDO = {
  borrador: 'Borrador',
  esperando: 'Pendiente de firmas',
  firmado: 'Firmado',
  sustituido: 'Sustituido',
  cancelado: 'Cancelado',
};

export const CATEGORIAS_DIARIO = {
  avance: 'Avance',
  observacion: 'Observación',
  problema: 'Problema',
  reunion: 'Reunión',
  cliente: 'Cliente',
};

// "AAAA-MM-DD" -> "lun, 16/11/2026"
export function formatearDia(dia) {
  const d = new Date(`${dia}T12:00:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// "01/11" (día y mes, para las fechas de hitos)
export function formatearDiaMes(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

export function hoyISO() {
  const d = new Date();
  const huso = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - huso).toISOString().slice(0, 10);
}

export function formatearFecha(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatearFechaHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Convierte la fecha de la API al formato del <input type="date"> (AAAA-MM-DD).
export function paraInputFecha(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  const huso = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - huso).toISOString().slice(0, 10);
}

// Convierte el valor del <input type="date"> al mediodía local, para no "retroceder un día" por la zona horaria.
export function deInputFecha(valor) {
  if (!valor) return null;
  return new Date(`${valor}T12:00:00`).toISOString();
}

export function formatearHoras(h) {
  const n = Number(h) || 0;
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`;
}

// "2,5/8 h" (gastadas/estimadas)
export function formatearHorasPar(gastadas, estimadas) {
  const f = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${f(gastadas)}/${f(estimadas)} h`;
}

export function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// 1536 -> "1,5 KB"
export function formatearTamano(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString('es-ES', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[i]}`;
}

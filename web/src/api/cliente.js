const BASE = import.meta.env.VITE_API_URL || '/api';
const CLAVE_TOKEN = 'taskly_token';

export const token = {
  leer: () => {
    try {
      return localStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  },
  guardar: (valor) => {
    try {
      localStorage.setItem(CLAVE_TOKEN, valor);
    } catch {
      /* navegador sin almacenamiento: sigue solo en memoria */
    }
  },
  limpiar: () => {
    try {
      localStorage.removeItem(CLAVE_TOKEN);
    } catch {
      /* ignora */
    }
  },
};

export class ErrorApi extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

let alExpirarSesion = () => {};
export function definirAlExpirarSesion(fn) {
  alExpirarSesion = fn;
}

async function llamar(metodo, ruta, cuerpo) {
  const cabeceras = { 'Content-Type': 'application/json' };
  const t = token.leer();
  if (t) cabeceras.Authorization = `Bearer ${t}`;

  let respuesta;
  try {
    respuesta = await fetch(BASE + ruta, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'No se pudo conectar con la API. ¿Está en marcha?');
  }

  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    if (respuesta.status === 401 && t) alExpirarSesion();
    const detalles = datos?.detalles;
    let mensaje = datos?.error || `Erro ${respuesta.status}`;
    if (!datos && respuesta.status >= 500) {
      mensaje = 'La API no respondió. Comprueba que el terminal de la API está en marcha (npm run dev en la carpeta api) y si aparece algún error en él.';
    }
    if (detalles && typeof detalles === 'object') mensaje += `: ${Object.values(detalles).join(', ')}`;
    throw new ErrorApi(respuesta.status, mensaje, detalles);
  }
  return datos;
}

export function montarQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

// Dirección completa de una ruta de la API (p. ej.: enlaces temporales de adjuntos).
export function urlApi(ruta) {
  return BASE + ruta;
}

// Subida de archivos con barra de progreso (fetch no informa del progreso de la subida).
export function enviarArchivos(ruta, archivos, { descripcion, alProgreso } = {}) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    archivos.forEach((a) => fd.append('archivos', a, a.name));
    if (descripcion) fd.append('descripcion', descripcion);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + ruta);
    const t = token.leer();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && alProgreso?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let datos = null;
      try {
        datos = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta sin JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(datos);
      else {
        if (xhr.status === 401 && t) alExpirarSesion();
        reject(new ErrorApi(xhr.status, datos?.error || (xhr.status === 413 ? 'Archivo demasiado grande.' : `Erro ${xhr.status} en la subida`)));
      }
    };
    xhr.onerror = () => reject(new ErrorApi(0, 'No se pudo enviar. ¿Está en marcha la API?'));
    xhr.send(fd);
  });
}

export const api = {
  get: (c) => llamar('GET', c),
  post: (c, b) => llamar('POST', c, b ?? {}),
  patch: (c, b) => llamar('PATCH', c, b ?? {}),
  del: (c) => llamar('DELETE', c),
};

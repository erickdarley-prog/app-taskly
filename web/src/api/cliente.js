const BASE = import.meta.env.VITE_API_URL || '/api';
const CHAVE_TOKEN = 'taskly_token';

export const token = {
  ler: () => {
    try {
      return localStorage.getItem(CHAVE_TOKEN);
    } catch {
      return null;
    }
  },
  salvar: (valor) => {
    try {
      localStorage.setItem(CHAVE_TOKEN, valor);
    } catch {
      /* navegador sem armazenamento: segue só em memória */
    }
  },
  limpar: () => {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch {
      /* ignora */
    }
  },
};

export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

let aoExpirarSessao = () => {};
export function definirAoExpirarSessao(fn) {
  aoExpirarSessao = fn;
}

async function chamar(metodo, caminho, corpo) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  const t = token.ler();
  if (t) cabecalhos.Authorization = `Bearer ${t}`;

  let resposta;
  try {
    resposta = await fetch(BASE + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, 'Não foi possível falar com a API. Ela está rodando?');
  }

  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    if (resposta.status === 401 && t) aoExpirarSessao();
    const detalhes = dados?.detalhes;
    let mensagem = dados?.erro || `Erro ${resposta.status}`;
    if (!dados && resposta.status >= 500) {
      mensagem = 'A API não respondeu. Verifique se o terminal da API está rodando (npm run dev na pasta api) e se apareceu algum erro nele.';
    }
    if (detalhes && typeof detalhes === 'object') mensagem += `: ${Object.values(detalhes).join(', ')}`;
    throw new ErroApi(resposta.status, mensagem, detalhes);
  }
  return dados;
}

export function montarQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

// Endereço completo de um caminho da API (ex.: links temporários de anexos).
export function urlApi(caminho) {
  return BASE + caminho;
}

// Envio de arquivos com barra de progresso (fetch não informa o progresso do upload).
export function enviarArquivos(caminho, arquivos, { descricao, aoProgresso } = {}) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    arquivos.forEach((a) => fd.append('arquivos', a, a.name));
    if (descricao) fd.append('descricao', descricao);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + caminho);
    const t = token.ler();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgresso?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let dados = null;
      try {
        dados = JSON.parse(xhr.responseText);
      } catch {
        /* resposta sem JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(dados);
      else {
        if (xhr.status === 401 && t) aoExpirarSessao();
        reject(new ErroApi(xhr.status, dados?.erro || (xhr.status === 413 ? 'Arquivo muito grande.' : `Erro ${xhr.status} no envio`)));
      }
    };
    xhr.onerror = () => reject(new ErroApi(0, 'Não foi possível enviar. A API está rodando?'));
    xhr.send(fd);
  });
}

export const api = {
  get: (c) => chamar('GET', c),
  post: (c, b) => chamar('POST', c, b ?? {}),
  patch: (c, b) => chamar('PATCH', c, b ?? {}),
  del: (c) => chamar('DELETE', c),
};

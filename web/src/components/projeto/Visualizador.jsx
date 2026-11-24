// Visualizador de anexos: vídeo, imagem, PDF, Word (.docx), texto e Markdown.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { api, urlApi } from '../../api/cliente.js';
import { formatarDataHora, formatarTamanho } from '../../utils/formatos.js';

export async function baixarAnexo(anexo) {
  const link = await api.get(`/anexos/${anexo._id}/link`);
  const a = document.createElement('a');
  a.href = urlApi(link.baixar);
  a.download = anexo.nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ConteudoDocx({ url }) {
  const ref = useRef(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [{ renderAsync }, resposta] = await Promise.all([import('docx-preview'), fetch(url)]);
        const blob = await resposta.blob();
        if (!ativo || !ref.current) return;
        ref.current.innerHTML = '';
        await renderAsync(blob, ref.current, null, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true });
      } catch {
        if (ativo) setErro('Não foi possível mostrar este documento. Use o botão Baixar.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [url]);
  return (
    <div className="visor-docx">
      {erro && <p className="visor-aviso">{erro}</p>}
      <div ref={ref} />
    </div>
  );
}

function ConteudoTexto({ url, markdown }) {
  const [html, setHtml] = useState(null);
  const [texto, setTexto] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const conteudo = await (await fetch(url)).text();
        if (!ativo) return;
        if (markdown) {
          const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
          setHtml(DOMPurify.sanitize(marked.parse(conteudo)));
        } else setTexto(conteudo);
      } catch {
        if (ativo) setErro('Não foi possível ler este arquivo.');
      }
    })();
    return () => {
      ativo = false;
    };
  }, [url, markdown]);
  if (erro) return <p className="visor-aviso">{erro}</p>;
  if (markdown) {
    // HTML já limpo pelo DOMPurify (sem scripts nem atributos perigosos)
    return <article className="visor-markdown" dangerouslySetInnerHTML={{ __html: html ?? '' }} />;
  }
  return <pre className="visor-texto">{texto ?? 'Carregando…'}</pre>;
}

function ConteudoVideo({ url }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <p className="visor-aviso">O navegador não conseguiu reproduzir este vídeo (formato não suportado). Use o botão Baixar.</p>;
  return <video className="visor-video" src={url} controls preload="metadata" onError={() => setFalhou(true)} />;
}

export default function Visualizador({ anexo, lista = [], aoFechar, aoNavegar }) {
  const [link, setLink] = useState(null);
  const [erro, setErro] = useState(null);
  const indice = lista.findIndex((a) => a._id === anexo?._id);
  const anterior = indice > 0 ? lista[indice - 1] : null;
  const proximo = indice >= 0 && indice < lista.length - 1 ? lista[indice + 1] : null;

  useEffect(() => {
    if (!anexo) return;
    setLink(null);
    setErro(null);
    api.get(`/anexos/${anexo._id}/link`).then(setLink).catch(setErro);
  }, [anexo]);

  useEffect(() => {
    if (!anexo) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') aoFechar();
      if (e.key === 'ArrowLeft' && anterior) aoNavegar(anterior);
      if (e.key === 'ArrowRight' && proximo) aoNavegar(proximo);
    };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [anexo, anterior, proximo, aoFechar, aoNavegar]);

  if (!anexo) return null;
  const url = link ? urlApi(link.ver) : null;

  let conteudo = <p className="visor-aviso">Carregando…</p>;
  if (erro) conteudo = <p className="visor-aviso">{erro.message}</p>;
  else if (url) {
    switch (anexo.visualizador) {
      case 'imagem':
        conteudo = <img className="visor-imagem" src={url} alt={anexo.nome} />;
        break;
      case 'video':
        conteudo = <ConteudoVideo key={url} url={url} />;
        break;
      case 'pdf':
        conteudo = <iframe className="visor-pdf" src={url} title={anexo.nome} />;
        break;
      case 'docx':
        conteudo = <ConteudoDocx key={url} url={url} />;
        break;
      case 'texto':
      case 'markdown':
        conteudo = <ConteudoTexto key={url} url={url} markdown={anexo.visualizador === 'markdown'} />;
        break;
      default:
        conteudo = <p className="visor-aviso">Este tipo de arquivo não tem visualização. Use o botão Baixar.</p>;
    }
  }

  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label={`Visualizar ${anexo.nome}`}>
      <header className="visor-topo">
        <div className="visor-info">
          <strong title={anexo.nome}>{anexo.nome}</strong>
          <small>
            {formatarTamanho(anexo.tamanho)} · {anexo.enviadoPor?.nome || '—'} · {formatarDataHora(anexo.createdAt)}
            {lista.length > 1 && indice >= 0 && (
              <>
                {' '}
                · {indice + 1} de {lista.length}
              </>
            )}
          </small>
        </div>
        <div className="visor-acoes">
          <button type="button" className="botao botao-contorno-claro" onClick={() => baixarAnexo(anexo).catch(setErro)}>
            <Download size={16} /> Baixar
          </button>
          <button type="button" className="visor-botao" onClick={aoFechar} aria-label="Fechar">
            <X size={22} />
          </button>
        </div>
      </header>
      <div className="visor-corpo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
        {anterior && (
          <button type="button" className="visor-nav visor-nav-anterior" onClick={() => aoNavegar(anterior)} aria-label="Anterior">
            <ChevronLeft size={28} />
          </button>
        )}
        <div className={`visor-conteudo visor-modo-${anexo.visualizador}`}>{conteudo}</div>
        {proximo && (
          <button type="button" className="visor-nav visor-nav-proximo" onClick={() => aoNavegar(proximo)} aria-label="Próximo">
            <ChevronRight size={28} />
          </button>
        )}
      </div>
    </div>
  );
}

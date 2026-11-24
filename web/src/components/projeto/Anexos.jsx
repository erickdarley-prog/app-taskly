// Área de anexos do projeto: enviar e ver vídeos, imagens, documentos e outros arquivos.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, File, FileArchive, FileImage, FileText, FileVideo, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { api, enviarArquivos, montarQuery, urlApi } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { MensagemErro } from '../Elementos.jsx';
import Visualizador, { baixarAnexo } from './Visualizador.jsx';
import { formatarData, formatarTamanho } from '../../utils/formatos.js';

const TIPOS = [
  ['', 'Todos'],
  ['video', 'Vídeos'],
  ['imagem', 'Imagens'],
  ['documento', 'Documentos'],
  ['arquivo', 'Arquivos'],
];
const ICONES = { video: FileVideo, imagem: FileImage, documento: FileText, arquivo: File };

function IconeTipo({ anexo, tamanho = 34 }) {
  const Icone = anexo.tipo === 'arquivo' && ['zip', 'rar', '7z'].includes(anexo.extensao) ? FileArchive : ICONES[anexo.tipo] || File;
  return <Icone size={tamanho} strokeWidth={1.6} aria-hidden="true" />;
}

// Miniatura das imagens (pede o link temporário só quando aparece na tela)
function Miniatura({ anexo }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let ativo = true;
    api
      .get(`/anexos/${anexo._id}/link`)
      .then((l) => ativo && setUrl(urlApi(l.ver)))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [anexo._id]);
  return url ? <img src={url} alt="" loading="lazy" /> : <IconeTipo anexo={anexo} />;
}

export default function Anexos({ projeto, versao }) {
  const { usuario, ehAdmin } = useAuth();
  const [dados, setDados] = useState(null);
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState(null);
  const [fila, setFila] = useState([]); // arquivos escolhidos, ainda não enviados
  const [descricao, setDescricao] = useState('');
  const [progresso, setProgresso] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const [aberto, setAberto] = useState(null);
  const inputRef = useRef(null);

  const carregar = useCallback(() => {
    api
      .get(`/projetos/${projeto._id}/anexos${montarQuery({ tipo, busca })}`)
      .then(setDados)
      .catch(setErro);
  }, [projeto._id, tipo, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 250 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca, versao]);

  const adicionar = (lista) => {
    const novos = Array.from(lista || []);
    if (!novos.length) return;
    setErro(null);
    const limite = (dados?.maxUploadMb || 500) * 1024 * 1024;
    const grandes = novos.filter((f) => f.size > limite);
    if (grandes.length) setErro(new Error(`Arquivo muito grande (máximo ${dados?.maxUploadMb || 500} MB): ${grandes.map((f) => f.name).join(', ')}`));
    setFila((f) => [...f, ...novos.filter((x) => x.size <= limite)].slice(0, 10));
  };

  const enviar = async () => {
    if (!fila.length) return;
    setErro(null);
    setProgresso(0);
    try {
      await enviarArquivos(`/projetos/${projeto._id}/anexos`, fila, { descricao, aoProgresso: setProgresso });
      setFila([]);
      setDescricao('');
      carregar();
    } catch (e) {
      setErro(e);
    } finally {
      setProgresso(null);
    }
  };

  const excluir = async (anexo) => {
    if (!window.confirm(`Excluir o anexo "${anexo.nome}"? O arquivo será apagado.`)) return;
    try {
      await api.del(`/anexos/${anexo._id}`);
      carregar();
    } catch (e) {
      setErro(e);
    }
  };

  const soltar = (e) => {
    e.preventDefault();
    setArrastando(false);
    adicionar(e.dataTransfer.files);
  };

  const visualizaveis = (dados?.itens || []).filter((a) => a.visualizador);
  const podeExcluir = (a) => ehAdmin || a.enviadoPor?._id === usuario?._id;

  return (
    <div className="anexos">
      <section
        className={`cartao anexos-envio${arrastando ? ' arrastando' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
      >
        <div className="anexos-envio-zona">
          <UploadCloud size={36} aria-hidden="true" />
          <div>
            <strong>Arraste arquivos para cá ou</strong>{' '}
            <button type="button" className="link-botao" onClick={() => inputRef.current?.click()}>
              escolha no computador
            </button>
            <p className="texto-suave">
              Vídeos, imagens, documentos (Word, PDF, texto, Markdown) e outros arquivos · até {dados?.maxUploadMb || 500} MB cada · 10 por vez
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              adicionar(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {fila.length > 0 && (
          <div className="anexos-fila">
            <ul>
              {fila.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span className="anexos-fila-nome">{f.name}</span>
                  <span className="texto-suave">{formatarTamanho(f.size)}</span>
                  {progresso === null && (
                    <button type="button" className="botao-icone" aria-label={`Tirar ${f.name}`} onClick={() => setFila((l) => l.filter((_, j) => j !== i))}>
                      <X size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição (opcional) – ex.: gravação da reunião de kickoff"
              maxLength={1000}
              aria-label="Descrição dos arquivos"
              disabled={progresso !== null}
            />
            {progresso !== null && (
              <div className="progresso" aria-label="Progresso do envio">
                <div className="progresso-trilho">
                  <div className="progresso-barra" style={{ width: `${progresso}%` }} />
                </div>
                <span className="progresso-valor">{progresso}%</span>
              </div>
            )}
            <div className="acoes">
              <button type="button" className="botao botao-secundario" onClick={() => setFila([])} disabled={progresso !== null}>
                Cancelar
              </button>
              <button type="button" className="botao" onClick={enviar} disabled={progresso !== null}>
                <UploadCloud size={16} /> {progresso !== null ? 'Enviando…' : `Enviar ${fila.length} arquivo${fila.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </section>

      <MensagemErro erro={erro} />

      <div className="filtros anexos-filtros">
        <div className="chips-filtro" role="group" aria-label="Filtrar por tipo">
          {TIPOS.map(([v, r]) => (
            <button key={v || 'todos'} type="button" className={`chip-filtro${tipo === v ? ' ativo' : ''}`} aria-pressed={tipo === v} onClick={() => setTipo(v)}>
              {r}
              <span>{v ? dados?.porTipo?.[v] ?? 0 : dados?.total ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="busca-pilula">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Buscar arquivo…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar anexo" />
        </label>
      </div>

      {dados && dados.itens.length === 0 && (
        <div className="estado-vazio">{tipo || busca ? 'Nenhum anexo encontrado com esse filtro.' : 'Ainda não há anexos neste projeto. Envie o primeiro acima.'}</div>
      )}

      {dados && dados.itens.length > 0 && (
        <ul className="anexos-grade">
          {dados.itens.map((a) => (
            <li key={a._id} className={`cartao anexo anexo-${a.tipo}`}>
              <button
                type="button"
                className="anexo-previa"
                onClick={() => (a.visualizador ? setAberto(a) : baixarAnexo(a).catch(setErro))}
                aria-label={a.visualizador ? `Ver ${a.nome}` : `Baixar ${a.nome}`}
              >
                {a.tipo === 'imagem' && a.visualizador ? <Miniatura anexo={a} /> : <IconeTipo anexo={a} tamanho={44} />}
                <span className="anexo-extensao">{a.extensao || 'arquivo'}</span>
              </button>
              <div className="anexo-corpo">
                <strong className="anexo-nome" title={a.nome}>
                  {a.nome}
                </strong>
                <small className="texto-suave">
                  {formatarTamanho(a.tamanho)} · {formatarData(a.createdAt)} · {a.enviadoPor?.nome || '—'}
                </small>
                {a.descricao && <p className="anexo-descricao">{a.descricao}</p>}
              </div>
              <div className="anexo-acoes">
                {a.visualizador ? (
                  <button type="button" className="botao botao-secundario" onClick={() => setAberto(a)}>
                    <Eye size={15} /> Ver
                  </button>
                ) : (
                  <span className="anexo-so-baixar">Só para baixar</span>
                )}
                <button type="button" className="botao-icone" onClick={() => baixarAnexo(a).catch(setErro)} aria-label={`Baixar ${a.nome}`} title="Baixar">
                  <Download size={18} />
                </button>
                {podeExcluir(a) && (
                  <button type="button" className="botao-icone perigo" onClick={() => excluir(a)} aria-label={`Excluir ${a.nome}`} title="Excluir">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Visualizador anexo={aberto} lista={visualizaveis} aoFechar={() => setAberto(null)} aoNavegar={setAberto} />
    </div>
  );
}

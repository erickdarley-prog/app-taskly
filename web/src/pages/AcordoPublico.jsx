// Página que o CLIENTE abre pelo link do e-mail (sem login) para concordar com o acordo.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/cliente.js';
import { Logo } from '../components/Layout.jsx';
import { formatarDataHora } from '../utils/formatos.js';

export default function AcordoPublico() {
  const { token } = useParams();
  const [acordo, setAcordo] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ciente, setCiente] = useState(false);

  useEffect(() => {
    api.get(`/publico/acordos/${token}`).then(setAcordo).catch(setErro);
  }, [token]);

  const concordar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      setAcordo(await api.post(`/publico/acordos/${token}/concordar`));
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  };

  const jaConcordou = Boolean(acordo?.assinadoPeloCliente);

  return (
    <div className="publico-pagina">
      <div className="publico-caixa">
        <div className="publico-topo">
          <Logo />
        </div>

        {erro && !acordo && (
          <div className="publico-corpo">
            <h1>Link indisponível</h1>
            <p>{erro.message}</p>
          </div>
        )}

        {!acordo && !erro && <p className="publico-corpo texto-suave">Carregando…</p>}

        {acordo && (
          <div className="publico-corpo">
            <p className="texto-suave">Acordo de especificações · versão {acordo.versao}</p>
            <h1>{acordo.projeto}</h1>
            {acordo.cliente && <p className="texto-suave">{acordo.cliente}</p>}
            {acordo.destinatario && <p>Olá, {acordo.destinatario}. Revise abaixo o que está e o que não está incluído no projeto.</p>}

            <div className="escopo-colunas">
              <section className="escopo-lista escopo-incluido">
                <h3>
                  <span aria-hidden="true">✓</span> Vai no projeto
                </h3>
                <ul>
                  {acordo.incluidos.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
                {acordo.incluidos.length === 0 && <p className="texto-suave">Nenhum item.</p>}
              </section>
              <section className="escopo-lista escopo-nao-incluido">
                <h3>
                  <span aria-hidden="true">✕</span> Não vai no projeto
                </h3>
                <ul>
                  {acordo.naoIncluidos.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
                {acordo.naoIncluidos.length === 0 && <p className="texto-suave">Nenhum item.</p>}
              </section>
            </div>
            {acordo.observacoes && (
              <>
                <h3>Observações</h3>
                <p className="descricao">{acordo.observacoes}</p>
              </>
            )}

            {erro && <div className="alerta alerta-erro">{erro.message}</div>}

            {jaConcordou ? (
              <div className="alerta alerta-ok publico-resultado">
                <strong>✓ Concordância registrada em {formatarDataHora(acordo.assinadoPeloCliente)}.</strong>
                <br />
                {acordo.status === 'assinado'
                  ? 'O acordo está assinado pelas duas partes.'
                  : `Falta a assinatura de ${acordo.responsavelEmpresa || 'Awakelab'}.`}{' '}
                Você também recebe uma confirmação por e-mail.
              </div>
            ) : acordo.status === 'aguardando' ? (
              <div className="publico-acao">
                <label className="checkbox">
                  <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
                  Li e estou de acordo com o que está e o que não está incluído neste projeto.
                </label>
                <button type="button" className="botao botao-largo" disabled={!ciente || enviando} onClick={concordar}>
                  {enviando ? 'Registrando…' : 'Concordo com o acordo'}
                </button>
                <p className="texto-suave">
                  Não concorda com algum ponto? Responda o e-mail que você recebeu. Responsável na Awakelab: {acordo.responsavelEmpresa}.
                </p>
              </div>
            ) : (
              <div className="alerta alerta-aviso">
                {acordo.status === 'assinado' ? 'Este acordo já foi assinado.' : 'Esta versão do acordo não está mais disponível para assinatura.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

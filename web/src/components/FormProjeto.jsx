import { useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { STATUS_PROJETO, deInputData, paraInputData } from '../utils/formatos.js';
import { Campo, MensagemErro, Modal } from './Elementos.jsx';

function estadoInicial(projeto, usuarioLogado) {
  return {
    nome: projeto?.nome || '',
    cliente: projeto?.cliente || '',
    descricao: projeto?.descricao || '',
    status: projeto?.status || 'planejamento',
    dataInicio: paraInputData(projeto?.dataInicio),
    prazo: paraInputData(projeto?.prazo),
    responsavel: projeto?.responsavel?._id || projeto?.responsavel || usuarioLogado?._id || '',
    clienteNome: projeto?.responsavelCliente?.nome || '',
    clienteEmail: projeto?.responsavelCliente?.email || '',
    clienteCargo: projeto?.responsavelCliente?.cargo || '',
    integrantes: (projeto?.integrantes || []).map((i) => ({
      usuario: i.usuario?._id || i.usuario,
      funcao: i.funcao || '',
    })),
  };
}

export default function FormProjeto({ aberto, aoFechar, projeto, aoSalvar }) {
  const { usuario } = useAuth();
  const [form, setForm] = useState(() => estadoInicial(projeto, usuario));
  const [opcoes, setOpcoes] = useState([]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm(estadoInicial(projeto, usuario));
    setErro(null);
    api.get('/usuarios/opcoes').then(setOpcoes).catch(setErro);
  }, [aberto, projeto, usuario]);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const mudarIntegrante = (indice, campo, valor) =>
    setForm((f) => {
      const integrantes = [...f.integrantes];
      integrantes[indice] = { ...integrantes[indice], [campo]: valor };
      if (campo === 'usuario' && !integrantes[indice].funcao) {
        integrantes[indice].funcao = opcoes.find((o) => o._id === valor)?.funcao || '';
      }
      return { ...f, integrantes };
    });

  const adicionarIntegrante = () => setForm((f) => ({ ...f, integrantes: [...f.integrantes, { usuario: '', funcao: '' }] }));
  const removerIntegrante = (indice) =>
    setForm((f) => ({ ...f, integrantes: f.integrantes.filter((_, i) => i !== indice) }));

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const { clienteNome, clienteEmail, clienteCargo, ...resto } = form;
      const corpo = {
        ...resto,
        responsavelCliente: { nome: clienteNome, email: clienteEmail, cargo: clienteCargo },
        dataInicio: deInputData(form.dataInicio),
        prazo: deInputData(form.prazo),
        integrantes: form.integrantes.filter((i) => i.usuario),
      };
      const salvo = projeto?._id
        ? await api.patch(`/projetos/${projeto._id}`, corpo)
        : await api.post('/projetos', corpo);
      aoSalvar(salvo);
    } catch (err) {
      setErro(err);
    } finally {
      setSalvando(false);
    }
  };

  const escolhidos = new Set(form.integrantes.map((i) => i.usuario));

  return (
    <Modal titulo={projeto?._id ? 'Editar projeto' : 'Novo projeto'} aberto={aberto} aoFechar={aoFechar} largura={680}>
      <form onSubmit={enviar} className="formulario">
        <Campo rotulo="Nome do projeto / plataforma">
          <input value={form.nome} onChange={mudar('nome')} required maxLength={150} autoFocus />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Cliente / empresa">
            <input value={form.cliente} onChange={mudar('cliente')} maxLength={150} />
          </Campo>
          <Campo rotulo="Status">
            <select value={form.status} onChange={mudar('status')}>
              {Object.entries(STATUS_PROJETO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Descrição">
          <textarea rows={3} value={form.descricao} onChange={mudar('descricao')} maxLength={5000} />
        </Campo>
        <div className="grade-3">
          <Campo rotulo="Responsável Awakelab">
            <select value={form.responsavel} onChange={mudar('responsavel')} required>
              {opcoes.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Início">
            <input type="date" value={form.dataInicio} onChange={mudar('dataInicio')} />
          </Campo>
          <Campo rotulo="Prazo">
            <input type="date" value={form.prazo} onChange={mudar('prazo')} />
          </Campo>
        </div>

        <div className="secao-form">
          <h3>Responsável do lado do cliente</h3>
          <p className="texto-suave">Recebe o acordo de especificações por e-mail e concorda pelo botão "Concordo".</p>
          <div className="grade-3">
            <Campo rotulo="Nome">
              <input value={form.clienteNome} onChange={mudar('clienteNome')} maxLength={120} />
            </Campo>
            <Campo rotulo="E-mail">
              <input type="email" value={form.clienteEmail} onChange={mudar('clienteEmail')} />
            </Campo>
            <Campo rotulo="Cargo">
              <input value={form.clienteCargo} onChange={mudar('clienteCargo')} maxLength={120} />
            </Campo>
          </div>
        </div>

        <div className="secao-form">
          <div className="secao-form-topo">
            <h3>Integrantes da Awakelab</h3>
            <button type="button" className="botao botao-secundario" onClick={adicionarIntegrante}>
              + Adicionar
            </button>
          </div>
          {form.integrantes.length === 0 && <p className="texto-suave">Nenhum integrante ainda.</p>}
          {form.integrantes.map((i, indice) => (
            <div className="linha-integrante" key={indice}>
              <select value={i.usuario} onChange={(e) => mudarIntegrante(indice, 'usuario', e.target.value)} aria-label="Pessoa">
                <option value="">Escolha a pessoa…</option>
                {opcoes
                  .filter((o) => o._id === i.usuario || !escolhidos.has(o._id))
                  .map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.nome}
                    </option>
                  ))}
              </select>
              <input
                placeholder="Função no projeto"
                value={i.funcao}
                onChange={(e) => mudarIntegrante(indice, 'funcao', e.target.value)}
                aria-label="Função"
                maxLength={80}
              />
              <button type="button" className="botao-icone" onClick={() => removerIntegrante(indice)} aria-label="Remover integrante">
                ×
              </button>
            </div>
          ))}
        </div>

        <MensagemErro erro={erro} />
        <div className="acoes">
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={salvando || opcoes.length === 0}>
            {opcoes.length === 0 ? 'Carregando…' : salvando ? 'Salvando…' : 'Salvar projeto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

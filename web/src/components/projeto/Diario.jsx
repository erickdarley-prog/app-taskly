// Diário do projeto: o que aconteceu em cada dia, com observações.
import { useCallback, useEffect, useState } from 'react';
import { api, montarQuery } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Campo, MensagemErro, Modal } from '../Elementos.jsx';
import { CATEGORIAS_DIARIO, formatarDia, hojeISO } from '../../utils/formatos.js';

const ICONES = { avanco: '▲', observacao: '✎', problema: '!', reuniao: '◎', cliente: '✉', tarefa: '•' };
const VAZIO = () => ({ data: hojeISO(), texto: '', categoria: 'avanco', marco: '' });

function FormRegistro({ valor, marcos, aoMudar, aoEnviar, enviando, rotuloBotao }) {
  const mudar = (c) => (e) => aoMudar({ ...valor, [c]: e.target.value });
  return (
    <form className="formulario" onSubmit={aoEnviar}>
      <Campo rotulo="O que aconteceu? (com observações)">
        <textarea
          rows={3}
          value={valor.texto}
          onChange={mudar('texto')}
          maxLength={5000}
          required
          placeholder="Ex.: Moodle 4.5 instalado. Obs.: faltou o certificado SSL, resolvido à tarde."
        />
      </Campo>
      <div className="grade-3">
        <Campo rotulo="Dia">
          <input type="date" value={valor.data} max={hojeISO()} onChange={mudar('data')} required />
        </Campo>
        <Campo rotulo="Tipo">
          <select value={valor.categoria} onChange={mudar('categoria')}>
            {Object.entries(CATEGORIAS_DIARIO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Marco (opcional)">
          <select value={valor.marco} onChange={mudar('marco')}>
            <option value="">—</option>
            {marcos.map((m) => (
              <option key={m._id} value={m._id}>
                {m.titulo}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="acoes">
        <button type="submit" className="botao" disabled={enviando || !valor.texto.trim()}>
          {enviando ? 'Salvando…' : rotuloBotao}
        </button>
      </div>
    </form>
  );
}

export default function Diario({ projeto, versao }) {
  const { usuario, ehAdmin } = useAuth();
  const [marcos, setMarcos] = useState([]);
  const [dias, setDias] = useState([]);
  const [anterior, setAnterior] = useState(null);
  const [automaticos, setAutomaticos] = useState(true);
  const [novo, setNovo] = useState(VAZIO);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(
    (ate) => api.get(`/projetos/${projeto._id}/diario${montarQuery({ ate, dias: 30, automaticos: automaticos ? undefined : 'false' })}`),
    [projeto._id, automaticos]
  );

  const carregar = useCallback(() => {
    setCarregando(true);
    buscar()
      .then((d) => {
        setDias(d.dias);
        setAnterior(d.anterior);
      })
      .catch(setErro)
      .finally(() => setCarregando(false));
  }, [buscar]);

  useEffect(carregar, [carregar, versao]);
  useEffect(() => {
    api
      .get(`/projetos/${projeto._id}/marcos`)
      .then((d) => setMarcos(d.marcos))
      .catch(() => {});
  }, [projeto._id, versao]);

  const carregarAnteriores = async () => {
    setCarregando(true);
    try {
      const d = await buscar(anterior);
      setDias((atuais) => [...atuais, ...d.dias]);
      setAnterior(d.anterior);
    } catch (e) {
      setErro(e);
    } finally {
      setCarregando(false);
    }
  };

  const registrar = async (e) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      await api.post(`/projetos/${projeto._id}/diario`, { ...novo, marco: novo.marco || null });
      setNovo(VAZIO());
      carregar();
    } catch (err) {
      setErro(err);
    } finally {
      setOcupado(false);
    }
  };

  const salvarEdicao = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      await api.patch(`/diario/${editando.id}`, { texto: editando.texto, data: editando.data, categoria: editando.categoria, marco: editando.marco || null });
      setEditando(null);
      carregar();
    } catch (err) {
      setErro(err);
    } finally {
      setOcupado(false);
    }
  };

  const excluir = async (item) => {
    if (!window.confirm('Excluir este registro do diário?')) return;
    try {
      await api.del(`/diario/${item.id}`);
      carregar();
    } catch (err) {
      setErro(err);
    }
  };

  const podeAlterar = (item) => item.tipo === 'manual' && (ehAdmin || item.autorId === usuario?._id);

  return (
    <div className="diario">
      <section className="cartao diario-novo">
        <h2>Registrar no diário</h2>
        <FormRegistro valor={novo} marcos={marcos} aoMudar={setNovo} aoEnviar={registrar} enviando={ocupado} rotuloBotao="Registrar" />
      </section>

      <MensagemErro erro={erro} />

      <div className="filtros diario-filtros">
        <label className="checkbox">
          <input type="checkbox" checked={automaticos} onChange={(e) => setAutomaticos(e.target.checked)} />
          Mostrar também as mudanças nas tarefas e os eventos automáticos
        </label>
      </div>

      {!carregando && dias.length === 0 && <div className="estado-vazio">Nenhum registro nos últimos 30 dias.</div>}

      <ol className="diario-dias">
        {dias.map((d) => (
          <li key={d.dia} className="diario-dia">
            <h3 className="diario-data">{formatarDia(d.dia)}</h3>
            <ul className="diario-itens">
              {d.itens.map((item) => (
                <li key={item.id} className={`diario-item diario-${item.tipo} categoria-${item.categoria}`}>
                  <span className="diario-icone" aria-hidden="true">
                    {item.tipo === 'tarefa' ? ICONES.tarefa : ICONES[item.categoria] || '•'}
                  </span>
                  <div className="diario-conteudo">
                    <p>
                      {item.tipo === 'tarefa' && <strong>{item.autor} </strong>}
                      {item.texto}
                    </p>
                    <small className="texto-suave">
                      {item.tipo !== 'tarefa' && <>{CATEGORIAS_DIARIO[item.categoria]} · </>}
                      {item.tipo === 'manual' && item.autor && <>{item.autor} · </>}
                      {item.tipo === 'sistema' && <>automático · </>}
                      {item.marco && <>{item.marco} · </>}
                      registrado {new Date(item.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </div>
                  {podeAlterar(item) && (
                    <div className="diario-acoes">
                      <button
                        type="button"
                        className="botao botao-fantasma"
                        onClick={() => setEditando({ id: item.id, texto: item.texto, data: d.dia, categoria: item.categoria, marco: item.marcoId || '' })}
                      >
                        Editar
                      </button>
                      <button type="button" className="botao botao-perigo-fantasma" onClick={() => excluir(item)}>
                        Excluir
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {anterior && (
        <div className="paginacao">
          <button type="button" className="botao botao-secundario" onClick={carregarAnteriores} disabled={carregando}>
            {carregando ? 'Carregando…' : 'Carregar os 30 dias anteriores'}
          </button>
        </div>
      )}

      <Modal titulo="Editar registro" aberto={Boolean(editando)} aoFechar={() => setEditando(null)} largura={620}>
        {editando && (
          <FormRegistro valor={editando} marcos={marcos} aoMudar={setEditando} aoEnviar={salvarEdicao} enviando={ocupado} rotuloBotao="Salvar" />
        )}
      </Modal>
    </div>
  );
}

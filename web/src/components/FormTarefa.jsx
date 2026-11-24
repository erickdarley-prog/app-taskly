import { useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { LADOS, PRIORIDADES, STATUS_TAREFA, deInputData, paraInputData } from '../utils/formatos.js';
import { Campo, MensagemErro, Modal } from './Elementos.jsx';

// Pessoas que podem receber tarefas: integrantes + responsável do projeto.
export function pessoasDoProjeto(projeto) {
  if (!projeto) return [];
  const mapa = new Map();
  if (projeto.responsavel?._id) mapa.set(projeto.responsavel._id, projeto.responsavel.nome);
  projeto.integrantes.forEach((i) => i.usuario?._id && mapa.set(i.usuario._id, i.usuario.nome));
  return [...mapa.entries()].map(([_id, nome]) => ({ _id, nome }));
}

function estadoInicial(tarefa, statusInicial, marcoInicial) {
  return {
    titulo: tarefa?.titulo || '',
    lado: tarefa?.lado || 'awakelab',
    marco: tarefa?.marco?._id || tarefa?.marco || marcoInicial || '',
    responsavelExterno: tarefa?.responsavelExterno || '',
    descricao: tarefa?.descricao || '',
    responsavel: tarefa?.responsavel?._id || tarefa?.responsavel || '',
    prioridade: tarefa?.prioridade || 'media',
    status: tarefa?.status || statusInicial || 'a_fazer',
    prazo: paraInputData(tarefa?.prazo),
    horasEstimadas: tarefa?.horasEstimadas ?? '',
  };
}

export default function FormTarefa({ aberto, aoFechar, projeto, tarefa, statusInicial, marcoInicial, marcos = [], aoSalvar }) {
  const [form, setForm] = useState(() => estadoInicial(tarefa, statusInicial, marcoInicial));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm(estadoInicial(tarefa, statusInicial, marcoInicial));
    setErro(null);
  }, [aberto, tarefa, statusInicial, marcoInicial]);

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const pessoas = pessoasDoProjeto(projeto);

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const doCliente = form.lado === 'cliente';
      const corpo = {
        ...form,
        prazo: deInputData(form.prazo),
        marco: form.marco || null,
        responsavel: doCliente ? null : form.responsavel || null,
        responsavelExterno: doCliente ? form.responsavelExterno : '',
        horasEstimadas: form.horasEstimadas === '' ? 0 : Number(form.horasEstimadas),
      };
      const salva = tarefa?._id
        ? await api.patch(`/tarefas/${tarefa._id}`, corpo)
        : await api.post(`/projetos/${projeto._id}/tarefas`, corpo);
      aoSalvar(salva);
    } catch (err) {
      setErro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={tarefa?._id ? 'Editar tarefa' : 'Nova tarefa'} aberto={aberto} aoFechar={aoFechar} largura={620}>
      <form onSubmit={enviar} className="formulario">
        <Campo rotulo="Título">
          <input value={form.titulo} onChange={mudar('titulo')} required maxLength={200} autoFocus />
        </Campo>
        <Campo rotulo="Descrição">
          <textarea rows={3} value={form.descricao} onChange={mudar('descricao')} maxLength={5000} />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Marco">
            <select value={form.marco} onChange={mudar('marco')}>
              <option value="">Sem marco</option>
              {marcos.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.titulo}
                </option>
              ))}
            </select>
          </Campo>
          <fieldset className="campo escolha-lado">
            <legend className="campo-rotulo">De quem é a tarefa</legend>
            <div className="grupo-botoes">
              {Object.entries(LADOS).map(([v, r]) => (
                <label key={v} className={`opcao-lado${form.lado === v ? ' ativa' : ''}`}>
                  <input type="radio" name="lado" value={v} checked={form.lado === v} onChange={mudar('lado')} />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="grade-2">
          {form.lado === 'cliente' ? (
            <Campo rotulo="Responsável no cliente (opcional)">
              <input
                value={form.responsavelExterno}
                onChange={mudar('responsavelExterno')}
                placeholder={projeto?.responsavelCliente?.nome || 'Nome da pessoa do cliente'}
                maxLength={120}
              />
            </Campo>
          ) : (
            <Campo rotulo="Responsável (opcional)">
              <select value={form.responsavel} onChange={mudar('responsavel')}>
                <option value="">Sem responsável</option>
                {pessoas.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Prioridade">
            <select value={form.prioridade} onChange={mudar('prioridade')}>
              {Object.entries(PRIORIDADES).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="grade-3">
          <Campo rotulo="Status">
            <select value={form.status} onChange={mudar('status')}>
              {Object.entries(STATUS_TAREFA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Prazo">
            <input type="date" value={form.prazo} onChange={mudar('prazo')} />
          </Campo>
          <Campo rotulo="Horas estimadas">
            <input type="number" min="0" step="0.5" value={form.horasEstimadas} onChange={mudar('horasEstimadas')} />
          </Campo>
        </div>
        <MensagemErro erro={erro} />
        <div className="acoes">
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

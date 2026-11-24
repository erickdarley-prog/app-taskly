import { useEffect, useState } from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Campo, MensagemErro, Modal } from './Elementos.jsx';

// Configurações comuns de servidores de e-mail.
const PRESETS = {
  gmail: { rotulo: 'Gmail / Google Workspace', host: 'smtp.gmail.com', porta: 465, seguro: true },
  outlook: { rotulo: 'Outlook / Microsoft 365', host: 'smtp.office365.com', porta: 587, seguro: false },
  outro: { rotulo: 'Outro servidor', host: '', porta: 587, seguro: false },
};

function EmailDeEnvio({ aberto }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ host: '', porta: 587, seguro: false, usuario: '', senha: '', nomeRemetente: '' });
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    setMsg(null);
    api
      .get('/auth/me/email')
      .then((c) => {
        setCfg(c);
        setForm({ host: c.host, porta: c.porta, seguro: c.seguro, usuario: c.usuario, senha: '', nomeRemetente: c.nomeRemetente });
      })
      .catch(setErro);
  }, [aberto]);

  const mudar = (c) => (e) => setForm((f) => ({ ...f, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const aplicarPreset = (chave) => {
    const p = PRESETS[chave];
    if (p) setForm((f) => ({ ...f, host: p.host, porta: p.porta, seguro: p.seguro }));
  };

  const executar = async (fn, sucesso) => {
    setErro(null);
    setMsg(null);
    setOcupado(true);
    try {
      const r = await fn();
      setMsg(typeof sucesso === 'function' ? sucesso(r) : sucesso);
      return r;
    } catch (e) {
      setErro(e);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const salvar = (e) => {
    e.preventDefault();
    executar(() => api.put('/auth/me/email', form), 'E-mail de envio salvo.').then((c) => {
      if (c) {
        setCfg(c);
        setForm((f) => ({ ...f, senha: '' }));
      }
    });
  };
  const testar = () =>
    executar(
      () => api.post('/auth/me/email/teste'),
      (r) => (r.modo === 'teste' ? 'Modo teste: nada foi enviado. Configure e salve o seu e-mail primeiro.' : `E-mail de teste enviado para ${r.para.join(', ')}.`)
    );
  const remover = () => {
    if (!window.confirm('Remover o e-mail de envio configurado?')) return;
    executar(() => api.put('/auth/me/email', { remover: true }), 'Configuração removida.').then((c) => c && setCfg(c));
  };

  return (
    <form onSubmit={salvar} className="formulario">
      <h3>E-mail de envio</h3>
      <p className="texto-suave">
        É por este e-mail que o Taskly manda o acordo de especificações para o cliente.{' '}
        {cfg?.configurado
          ? 'Configurado.'
          : cfg?.emailGeralDisponivel
            ? 'Enquanto não configurar, será usado o e-mail geral do sistema.'
            : 'Enquanto não configurar, o sistema fica em modo teste (gera o e-mail, mas não envia).'}
      </p>
      <Campo rotulo="Seu provedor">
        <select defaultValue="" onChange={(e) => aplicarPreset(e.target.value)}>
          <option value="" disabled>
            Escolha para preencher o servidor…
          </option>
          {Object.entries(PRESETS).map(([v, p]) => (
            <option key={v} value={v}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grade-2">
        <Campo rotulo="Servidor (SMTP)">
          <input value={form.host} onChange={mudar('host')} placeholder="smtp.gmail.com" />
        </Campo>
        <Campo rotulo="Porta">
          <input type="number" value={form.porta} onChange={mudar('porta')} min={1} max={65535} />
        </Campo>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={form.seguro} onChange={mudar('seguro')} />
        Conexão SSL direta (porta 465)
      </label>
      <Campo rotulo="Seu e-mail (login)">
        <input type="email" value={form.usuario} onChange={mudar('usuario')} autoComplete="off" />
      </Campo>
      <Campo
        rotulo="Senha de app"
        dica={cfg?.configurado ? 'Deixe em branco para manter a atual.' : 'No Gmail/Outlook, gere uma "senha de app" nas configurações de segurança da conta.'}
      >
        <input type="password" value={form.senha} onChange={mudar('senha')} autoComplete="new-password" />
      </Campo>
      <Campo rotulo="Nome do remetente (opcional)">
        <input value={form.nomeRemetente} onChange={mudar('nomeRemetente')} placeholder="Ex.: Erick – Awakelab" />
      </Campo>
      <MensagemErro erro={erro} />
      {msg && <div className="alerta alerta-ok">{msg}</div>}
      <div className="acoes">
        {cfg?.configurado && (
          <button type="button" className="botao botao-perigo-fantasma" onClick={remover} disabled={ocupado}>
            Remover
          </button>
        )}
        <button type="button" className="botao botao-secundario" onClick={testar} disabled={ocupado}>
          Enviar teste
        </button>
        <button type="submit" className="botao" disabled={ocupado}>
          Salvar e-mail
        </button>
      </div>
    </form>
  );
}

export default function MinhaConta({ aberto, aoFechar }) {
  const { usuario } = useAuth();
  const [form, setForm] = useState({ senhaAtual: '', novaSenha: '' });
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const fechar = () => {
    setForm({ senhaAtual: '', novaSenha: '' });
    setErro(null);
    setSucesso(false);
    aoFechar();
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api.patch('/auth/me/senha', form);
      setSucesso(true);
      setForm({ senhaAtual: '', novaSenha: '' });
    } catch (err) {
      setErro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Minha conta" aberto={aberto} aoFechar={fechar} largura={560}>
      <p className="texto-suave">
        {usuario?.nome} · {usuario?.email}
      </p>
      <form onSubmit={enviar} className="formulario">
        <h3>Trocar senha</h3>
        <Campo rotulo="Senha atual">
          <input type="password" value={form.senhaAtual} onChange={(e) => setForm({ ...form, senhaAtual: e.target.value })} required />
        </Campo>
        <Campo rotulo="Nova senha" dica="Mínimo de 6 caracteres">
          <input type="password" minLength={6} value={form.novaSenha} onChange={(e) => setForm({ ...form, novaSenha: e.target.value })} required />
        </Campo>
        <MensagemErro erro={erro} />
        {sucesso && <div className="alerta alerta-ok">Senha alterada.</div>}
        <div className="acoes">
          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </div>
      </form>
      <div className="secao-form" style={{ marginTop: 20 }}>
        <EmailDeEnvio aberto={aberto} />
      </div>
    </Modal>
  );
}

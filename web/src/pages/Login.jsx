import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSignature, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { MensagemErro } from '../components/Elementos.jsx';
import { MarcaAwakelab } from '../components/Layout.jsx';

const PARTES = ['Marcos', 'Tarefas', 'Escopo e acordo', 'Diário', 'Assistente'];

// Aceita o link inteiro do e-mail ou só o código do acordo.
function extrairCodigo(texto) {
  const valor = String(texto || '').trim();
  const doLink = valor.match(/\/acordo\/([A-Za-z0-9_-]+)/);
  return doLink ? doLink[1] : valor;
}

export default function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
      navegar('/projetos', { replace: true });
    } catch (err) {
      setErro(err);
    } finally {
      setEnviando(false);
    }
  };

  const abrirAcordo = (e) => {
    e.preventDefault();
    const c = extrairCodigo(codigo);
    if (c) navegar(`/acordo/${c}`);
  };

  return (
    <div className="login">
      <section className="login-apresentacao">
        <MarcaAwakelab altura={38} />
        <p className="etiqueta-capa">Gestão de projetos · Awakelab</p>
        <h1>
          Projetos de clientes, <span className="destaque">do escopo à entrega</span>
        </h1>
        <p className="login-texto">
          Marcos com datas, tarefas da Awakelab e do cliente, escopo assinado pelas duas partes e um diário do que acontece em cada dia.
        </p>
        <ol className="login-partes">
          {PARTES.map((p, i) => (
            <li key={p}>
              <span>{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
        <p className="login-rodape">
          <strong>Taskly</strong> · plataforma de uso interno da equipe Awakelab
        </p>
      </section>

      <section className="login-lado">
        <div className="login-cartoes">
          <form className="cartao login-cartao" onSubmit={enviar}>
            <h2>Entrar no Taskly</h2>
            <p className="texto-suave">Equipe e administradores da Awakelab. Use o e-mail e a senha que o administrador te passou.</p>
            <label className="campo">
              <span className="campo-rotulo">E-mail</span>
              <span className="campo-com-icone">
                <Mail size={18} aria-hidden="true" />
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </span>
            </label>
            <label className="campo">
              <span className="campo-rotulo">Senha</span>
              <span className="campo-com-icone">
                <Lock size={18} aria-hidden="true" />
                <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
              </span>
            </label>
            <MensagemErro erro={erro} />
            <button type="submit" className="botao botao-largo botao-grande" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <form className="cartao login-cartao login-cliente" onSubmit={abrirAcordo}>
            <h3>
              <FileSignature size={18} aria-hidden="true" /> É cliente e recebeu um acordo para assinar?
            </h3>
            <p className="texto-suave">Cole o link do e-mail ou o código do acordo. Não precisa de conta.</p>
            <div className="login-codigo">
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Link ou código do acordo" aria-label="Link ou código do acordo" />
              <button type="submit" className="botao botao-contorno" disabled={!codigo.trim()}>
                Abrir <ArrowRight size={16} />
              </button>
            </div>
          </form>

          <p className="login-aviso">Uso interno da Awakelab · O cliente acessa apenas o acordo enviado a ele.</p>
        </div>
      </section>
    </div>
  );
}

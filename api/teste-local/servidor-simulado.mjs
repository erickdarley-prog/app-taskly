// Sobe a API com uma OpenAI SIMULADA, para testar a tela do chat sem gastar créditos.
// Uso: node teste-local/servidor-simulado.mjs
import { criarApp } from '../src/app.js';
import { conectarBanco } from '../src/config/db.js';
import { definirClienteOpenAI } from '../src/chat/assistente.js';

const msg = (t) => ({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] }], output_text: t });
const fn = (name, args) => ({ output: [{ type: 'function_call', call_id: 'c' + Date.now(), name, arguments: JSON.stringify(args) }] });

definirClienteOpenAI({
  responses: {
    create: async ({ input }) => {
      const ultimo = input.at(-1);
      if (ultimo.type === 'function_call_output') {
        const r = JSON.parse(ultimo.output);
        if (r.erro) return msg(`Não consegui: ${r.erro}`);
        if (r.projeto?.nome) return msg(`✅ Projeto **${r.projeto.nome}** criado com ${r.projeto.integrantes} integrantes.\n- Prazo: 20/12/2026\n\nQuer que eu já crie as tarefas?`);
        if (r.usuario) return msg(`✅ Usuário **${r.usuario.nome}** criado. A senha temporária está logo abaixo.`);
        if (r.tarefas) return msg(`Você tem **${r.total}** tarefas abertas:\n${r.tarefas.slice(0, 4).map((t) => `- ${t.titulo} (${t.projeto})`).join('\n')}`);
        return msg('Feito!');
      }
      const t = String(ultimo.content).toLowerCase();
      if (t.includes('padaria')) return fn('criar_projeto', { nome: 'Site institucional', cliente: 'Padaria Sol', prazo: '2026-12-20', integrantes: [{ pessoa: 'Ana', funcao: 'Front-end' }, { pessoa: 'João', funcao: 'Back-end' }] });
      if (t.includes('projeto')) return msg('Claro! Qual o **nome** do projeto e para qual **cliente**?');
      if (t.includes('usuário') || t.includes('usuario')) return fn('criar_usuario', { nome: 'Bruno Reis', email: 'bruno@taskly.local', funcao: 'Dados' });
      if (t.includes('pra fazer')) return fn('minhas_tarefas', {});
      return msg('Posso ajudar com projetos, tarefas e usuários.');
    },
  },
});

await conectarBanco();
criarApp().listen(4000, () => console.log('API (OpenAI simulada) em http://localhost:4000/api'));

// Levanta la API con una OpenAI SIMULADA, para probar la pantalla del chat sin gastar créditos.
// Uso: node prueba-local/servidor-simulado.mjs
import { crearApp } from '../src/app.js';
import { conectarBd } from '../src/config/db.js';
import { definirClienteOpenAI } from '../src/chat/asistente.js';

const msg = (t) => ({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] }], output_text: t });
const fn = (name, args) => ({ output: [{ type: 'function_call', call_id: 'c' + Date.now(), name, arguments: JSON.stringify(args) }] });

definirClienteOpenAI({
  responses: {
    create: async ({ input }) => {
      const ultimo = input.at(-1);
      if (ultimo.type === 'function_call_output') {
        const r = JSON.parse(ultimo.output);
        if (r.error) return msg(`No he podido: ${r.error}`);
        if (r.proyecto?.nombre) return msg(`✅ Proyecto **${r.proyecto.nombre}** creado con ${r.proyecto.integrantes} integrantes.\n- Plazo: 20/12/2026\n\n¿Quieres que cree ya las tareas?`);
        if (r.usuario) return msg(`✅ Usuario **${r.usuario.nombre}** creado. La contraseña temporal está justo debajo.`);
        if (r.tareas) return msg(`Tienes **${r.total}** tareas abiertas:\n${r.tareas.slice(0, 4).map((t) => `- ${t.titulo} (${t.proyecto})`).join('\n')}`);
        return msg('¡Hecho!');
      }
      const t = String(ultimo.content).toLowerCase();
      if (t.includes('padaria')) return fn('crear_proyecto', { nombre: 'Web corporativa', cliente: 'Panadería Sol', plazo: '2026-12-20', integrantes: [{ persona: 'Ana', funcion: 'Front-end' }, { persona: 'João', funcion: 'Back-end' }] });
      if (t.includes('proyecto')) return msg('¡Claro! ¿Cuál es el **nombre** del proyecto y para qué **cliente**?');
      if (t.includes('usuario') || t.includes('usuario')) return fn('crear_usuario', { nombre: 'Bruno Reis', email: 'bruno@taskly.local', funcion: 'Datos' });
      if (t.includes('por hacer')) return fn('mis_tareas', {});
      return msg('Puedo ayudarte con proyectos, tareas y usuarios.');
    },
  },
});

await conectarBd();
crearApp().listen(4000, () => console.log('API (OpenAI simulada) en http://localhost:4000/api'));

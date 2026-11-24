// Testes de marcos, escopo/acordo (assinaturas) e diário. Rode com a API ligada e depois de "npm run seed".
const B = 'http://localhost:4000/api';
let ok = 0, falhas = 0;
const chk = (n, c, x = '') => { if (c) ok++; else { falhas++; console.log('FALHOU:', n, typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)); } };
async function req(m, u, t, b) {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const login = async (e, s) => (await req('POST', '/auth/login', null, { email: e, senha: s })).j.token;
const adm = await login('admin@taskly.local', 'admin123');
const ana = await login('ana@taskly.local', '123456');
const joao = await login('joao@taskly.local', '123456');
const pedro = await login('pedro@taskly.local', '123456');

const ahk = (await req('GET', '/projetos?busca=AHK', adm)).j.itens[0];
chk('AHK existe', ahk?.nome === 'Plataforma AHK');
const det = (await req('GET', '/projetos/' + ahk._id, adm)).j;
chk('responsável do cliente', det.responsavelCliente?.email === 'laura.mendez@example.com');

// ---------- Marcos / visão linear ----------
let r = await req('GET', `/projetos/${ahk._id}/marcos?comTarefas=true`, ana);
chk('equipe vê marcos', r.s === 200 && r.j.marcos.length === 7, r.j);
const [m1, , , m4, m5] = r.j.marcos;
chk('ordem dos marcos', m1.titulo === 'Recopilar informação' && m5.titulo === 'Informes e dashboard SEPE');
chk('marco 1 concluído', m1.status === 'concluido' && m1.percentual === 100 && !m1.atrasado, m1);
chk('marco 4 atrasado em andamento', m4.status === 'em_andamento' && m4.atrasado === true, m4);
chk('tarefas por lado', m1.doCliente === 2 && m1.daAwakelab === 2 && m1.tarefas.length === 4);
chk('tarefa do cliente tem nome externo', m1.tarefas.find((t) => t.lado === 'cliente')?.responsavelExterno === 'Laura Méndez');
r = await req('POST', `/projetos/${ahk._id}/marcos`, ana, { titulo: 'X' });
chk('equipe não cria marco', r.s === 403);
r = await req('POST', `/projetos/${ahk._id}/marcos`, adm, { titulo: 'Suporte pós-entrega', dataInicio: '2026-12-10', dataFim: '2026-12-01' });
chk('datas invertidas recusadas', r.s === 400);
r = await req('POST', `/projetos/${ahk._id}/marcos`, adm, { titulo: 'Suporte pós-entrega', dataInicio: '2026-12-10', dataFim: '2026-12-20' });
chk('cria marco', r.s === 201 && r.j.ordem === 8, r.j);
const novoMarco = r.j._id;
r = await req('PATCH', '/marcos/' + novoMarco, adm, { titulo: 'Suporte (30 dias)', dataFim: null });
chk('edita marco', r.s === 200 && r.j.titulo === 'Suporte (30 dias)' && !r.j.dataFim, r.j);

// tarefa do cliente no marco
r = await req('POST', `/projetos/${ahk._id}/tarefas`, adm, { titulo: 'Aprovar plano de suporte', marco: novoMarco, lado: 'cliente', responsavelExterno: 'Laura Méndez' });
chk('cria tarefa do cliente', r.s === 201 && r.j.lado === 'cliente' && !r.j.responsavel && r.j.marco?.titulo === 'Suporte (30 dias)', r.j);
const tCli = r.j._id;
const anaId = (await req('GET', '/auth/me', ana)).j.usuario._id;
r = await req('POST', `/projetos/${ahk._id}/tarefas`, adm, { titulo: 'Y', lado: 'cliente', responsavel: anaId });
chk('tarefa do cliente não aceita usuário', r.s === 400);
r = await req('PATCH', `/tarefas/${tCli}/status`, ana, { status: 'concluida' });
chk('equipe não muda tarefa do cliente', r.s === 403);
r = await req('PATCH', `/tarefas/${tCli}/status`, adm, { status: 'em_andamento' });
chk('admin muda tarefa do cliente', r.s === 200);
r = await req('PATCH', `/tarefas/${tCli}`, adm, { lado: 'awakelab', responsavel: anaId });
chk('troca para awakelab', r.s === 200 && r.j.lado === 'awakelab' && r.j.responsavel?._id === anaId && r.j.responsavelExterno === '', r.j);
r = await req('PATCH', `/tarefas/${tCli}`, adm, { lado: 'cliente' });
chk('volta para cliente limpa usuário', r.s === 200 && !r.j.responsavel, r.j);
const outro = (await req('GET', '/projetos?busca=Portal', adm)).j.itens[0];
const marcoOutro = (await req('GET', `/projetos/${outro._id}/marcos`, adm)).j.marcos[0]._id;
r = await req('PATCH', `/tarefas/${tCli}`, adm, { marco: marcoOutro });
chk('marco de outro projeto recusado', r.s === 400);
r = await req('GET', `/projetos/${ahk._id}/tarefas?lado=cliente&marco=${novoMarco}`, adm);
chk('filtro lado+marco', r.j.total === 1);
r = await req('DELETE', '/marcos/' + novoMarco, adm);
chk('exclui marco mantendo tarefa', r.s === 200 && r.j.tarefasSemMarco === 1);
r = await req('GET', `/projetos/${ahk._id}/marcos?comTarefas=true`, adm);
chk('tarefa ficou sem marco', r.j.semMarco?.total === 1 && r.j.semMarco.tarefas[0].titulo === 'Aprovar plano de suporte');

// ---------- Escopo / acordo ----------
r = await req('GET', `/projetos/${ahk._id}/acordos`, ana);
chk('equipe vê acordo', r.s === 200 && r.j.vigente?.versao === 1 && r.j.vigente.status === 'assinado', r.j);
chk('v1 assinado pelas duas partes', r.j.vigente.assinaturaCliente?.em && r.j.vigente.assinaturaEmpresa?.em);
chk('lista não traz html', r.j.versoes[0].emails.every((e) => !e.html) && r.j.versoes[0].emails.length === 2);
r = await req('GET', `/acordos/${r.j.vigente._id}/comprovante`, ana);
chk('comprovante com e-mails', r.s === 200 && r.j.emails[0].html.includes('Concordo') && !r.j.emails[0].html.includes('/acordo/'), r.j.emails?.[0]?.html?.slice(0, 80));
chk('confirmação enviada a cliente e remetente', r.j.emails[1].tipo === 'confirmacao' && r.j.emails[1].para.length === 2);

r = await req('POST', `/projetos/${ahk._id}/acordos/rascunho`, ana);
chk('equipe não edita escopo', r.s === 403);
r = await req('POST', `/projetos/${ahk._id}/acordos/rascunho`, adm);
chk('abre rascunho v2 copiando v1', r.s === 200 && r.j.versao === 2 && r.j.status === 'rascunho' && r.j.incluidos.length === 6, r.j);
const v2 = r.j._id;
r = await req('POST', `/projetos/${ahk._id}/acordos/rascunho`, adm);
chk('reabre o mesmo rascunho', r.j._id === v2);
r = await req('PATCH', '/acordos/' + v2, adm, { incluidos: [...r.j.incluidos.map((i) => i.texto), 'Integração com videoconferência'], naoIncluidos: ['Compra do domínio', '  ', 'Gestão de certificado SEPE'] });
chk('edita listas', r.s === 200 && r.j.incluidos.length === 7 && r.j.naoIncluidos.length === 2, r.j);
r = await req('POST', `/acordos/${v2}/assinar`, adm);
chk('não assina rascunho', r.s === 409);
r = await req('POST', `/acordos/${v2}/enviar`, adm);
chk('envia (modo teste)', r.s === 200 && r.j.modoEmail === 'teste' && r.j.linkTeste?.includes('/acordo/') && r.j.acordo.status === 'aguardando', r.j);
const token = r.j.linkTeste.split('/').pop();
r = await req('PATCH', '/acordos/' + v2, adm, { incluidos: ['x'] });
chk('não edita após envio', r.s === 409);
r = await req('POST', `/projetos/${ahk._id}/acordos/rascunho`, adm);
chk('não abre outro rascunho com envio pendente', r.s === 409);
r = await req('POST', `/acordos/${v2}/assinar`, joao);
chk('só o responsável assina pela empresa', r.s === 403);

// Página pública do cliente
r = await req('GET', '/publico/acordos/' + token);
chk('cliente vê o acordo sem login', r.s === 200 && r.j.versao === 2 && r.j.incluidos.includes('Integração com videoconferência') && r.j.destinatario === 'Laura Méndez', r.j);
r = await req('GET', '/publico/acordos/tokeninvalido1234567890');
chk('token inválido', r.s === 404);
r = await req('POST', `/publico/acordos/${token}/concordar`);
chk('cliente concorda', r.s === 200 && r.j.assinadoPeloCliente && !r.j.assinadoPelaEmpresa && r.j.status === 'aguardando', r.j);
r = await req('POST', `/publico/acordos/${token}/concordar`);
chk('clique repetido não duplica', r.s === 200);
r = await req('POST', `/acordos/${v2}/assinar`, adm);
chk('empresa assina e conclui', r.s === 200 && r.j.status === 'assinado', r.j);
r = await req('POST', `/acordos/${v2}/assinar`, adm);
chk('não assina duas vezes', r.s === 409);
r = await req('GET', `/projetos/${ahk._id}/acordos`, adm);
chk('v2 vigente e v1 substituída', r.j.vigente.versao === 2 && r.j.versoes.find((v) => v.versao === 1).status === 'substituido', r.j.versoes.map((v) => [v.versao, v.status]));
r = await req('GET', '/publico/acordos/' + token);
chk('link mostra assinado', r.j.status === 'assinado');

// v3 cancelada e reaproveitada
let v3 = (await req('POST', `/projetos/${ahk._id}/acordos/rascunho`, adm)).j;
await req('PATCH', '/acordos/' + v3._id, adm, { naoIncluidos: [...v3.naoIncluidos.map((i) => i.texto), 'Aplicativo móvel'] });
const env3 = (await req('POST', `/acordos/${v3._id}/enviar`, adm)).j;
r = await req('POST', `/acordos/${v3._id}/cancelar`, adm);
chk('cancela envio', r.j.status === 'cancelado');
r = await req('POST', `/publico/acordos/${env3.linkTeste.split('/').pop()}/concordar`);
chk('link cancelado não aceita', r.s === 409);
const v4 = (await req('POST', `/projetos/${ahk._id}/acordos/rascunho`, adm)).j;
chk('v4 parte da v3 cancelada', v4.versao === 4 && v4.naoIncluidos.some((i) => i.texto === 'Aplicativo móvel'));

// sem e-mail do cliente
const semContato = (await req('POST', '/projetos', adm, { nome: 'Sem contato' })).j;
const rs = (await req('POST', `/projetos/${semContato._id}/acordos/rascunho`, adm)).j;
await req('PATCH', '/acordos/' + rs._id, adm, { incluidos: ['Algo'] });
r = await req('POST', `/acordos/${rs._id}/enviar`, adm);
chk('exige e-mail do cliente', r.s === 400 && /e-mail do responsável do cliente/.test(r.j.erro), r.j);
r = await req('PATCH', '/projetos/' + semContato._id, adm, { responsavelCliente: { nome: 'Z', email: 'invalido' } });
chk('e-mail do cliente inválido', r.s === 400);

// ---------- Configuração de e-mail ----------
r = await req('GET', '/auth/me/email', adm);
chk('config vazia', r.s === 200 && r.j.configurado === false);
r = await req('PUT', '/auth/me/email', adm, { host: 'smtp.exemplo.com', usuario: 'admin@exemplo.com' });
chk('exige senha', r.s === 400);
r = await req('PUT', '/auth/me/email', adm, { host: 'smtp.exemplo.com', porta: 587, usuario: 'admin@exemplo.com', senha: 'segredo-app', nomeRemetente: 'Admin' });
chk('salva config sem devolver senha', r.s === 200 && r.j.configurado && !JSON.stringify(r.j).includes('segredo'), r.j);
r = await req('GET', '/auth/me', adm);
chk('/me não vaza senha cifrada', !JSON.stringify(r.j).includes('senhaCifrada') && r.j.usuario.emailEnvio.configurado === true, r.j);
r = await req('POST', '/auth/me/email/teste', adm);
chk('falha de SMTP vira mensagem clara', r.s === 502 && /Minha conta/.test(r.j.erro), r.j);
r = await req('PUT', '/auth/me/email', adm, { remover: true });
chk('remove config', r.j.configurado === false);

// ---------- Diário ----------
r = await req('GET', `/projetos/${ahk._id}/diario?dias=30`, ana);
chk('diário por dia', r.s === 200 && r.j.dias.length >= 8, r.j.dias?.length);
const todos = r.j.dias.flatMap((d) => d.itens);
chk('tem manual, sistema e tarefa', ['manual', 'sistema', 'tarefa'].every((t) => todos.some((i) => i.tipo === t)), [...new Set(todos.map((i) => i.tipo))]);
chk('dias em ordem decrescente', r.j.dias.every((d, i, a) => i === 0 || a[i - 1].dia > d.dia));
const kickoff = todos.find((i) => i.texto.startsWith('Reunião de kickoff'));
chk('kickoff com marco e autor', kickoff?.marco === 'Recopilar informação' && kickoff.autor === 'Admin Taskly' && kickoff.categoria === 'reuniao', kickoff);
r = await req('POST', `/projetos/${ahk._id}/diario`, ana, { texto: 'Layout do dashboard iniciado. Obs.: faltam os campos exigidos pelo SEPE.', marco: m5._id, categoria: 'avanco' });
chk('equipe registra no diário', r.s === 201);
const meu = r.j._id;
r = await req('POST', `/projetos/${ahk._id}/diario`, ana, { texto: '   ' });
chk('texto obrigatório', r.s === 400);
r = await req('POST', `/projetos/${ahk._id}/diario`, ana, { texto: 'x', categoria: 'festa' });
chk('categoria inválida', r.s === 400);
r = await req('POST', `/projetos/${ahk._id}/diario`, ana, { texto: 'Registro retroativo', data: '2026-11-10' });
chk('data retroativa', r.s === 201);
r = await req('PATCH', '/diario/' + meu, joao, { texto: 'hack' });
chk('não edita registro de outro', r.s === 403);
r = await req('PATCH', '/diario/' + meu, ana, { texto: 'Layout do dashboard iniciado (editado).' });
chk('edita o próprio', r.s === 200);
r = await req('PATCH', '/diario/' + meu, adm, { categoria: 'problema' });
chk('admin edita qualquer um', r.s === 200 && r.j.categoria === 'problema');
const sistema = todos.find((i) => i.tipo === 'sistema');
r = await req('DELETE', '/diario/' + sistema.id, adm);
chk('registro automático é protegido', r.s === 400);
r = await req('GET', `/projetos/${ahk._id}/diario?dias=7&automaticos=false`, ana);
chk('filtro sem automáticos', r.j.dias.flatMap((d) => d.itens).every((i) => i.tipo === 'manual'));
r = await req('GET', `/projetos/${ahk._id}/diario`, pedro);
chk('pedro (integrante) vê diário', r.s === 200);
const carla = await login('carla@taskly.local', '123456');
const inventario = (await req('GET', '/projetos?busca=Invent', adm)).j.itens[0];
r = await req('GET', `/projetos/${inventario._id}/diario`, carla);
chk('não-participante não vê diário', r.s === 403);
r = await req('DELETE', '/diario/' + meu, ana);
chk('exclui o próprio', r.s === 200);

// ---------- Excluir projeto apaga tudo junto ----------
r = await req('DELETE', '/projetos/' + semContato._id, adm);
chk('exclui projeto', r.s === 204);
r = await req('GET', `/acordos/${rs._id}/comprovante`, adm);
chk('acordos apagados junto', r.s === 404);

console.log(`\n${ok} verificações OK, ${falhas} falhas`);

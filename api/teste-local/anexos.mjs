// Testes da área de Anexos. Rode com a API ligada e depois de "npm run seed".
const BASE = process.env.API || 'http://localhost:4000';
const B = BASE + '/api';
let ok = 0, falhas = 0;
const chk = (n, c, x = '') => { if (c) ok++; else { falhas++; console.log('FALHOU:', n, typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)); } };
async function req(m, u, t, b) {
  const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
async function enviar(t, idProjeto, arquivos, descricao) {
  const fd = new FormData();
  for (const [nome, conteudo, tipo] of arquivos) fd.append('arquivos', new Blob([conteudo], { type: tipo || 'application/octet-stream' }), nome);
  if (descricao) fd.append('descricao', descricao);
  const r = await fetch(`${B}/projetos/${idProjeto}/anexos`, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
const login = async (e, s) => (await req('POST', '/auth/login', null, { email: e, senha: s })).j.token;
const adm = await login('admin@taskly.local', 'admin123');
const ana = await login('ana@taskly.local', '123456');
const joao = await login('joao@taskly.local', '123456');
const ahk = (await req('GET', '/projetos?busca=AHK', adm)).j.itens[0];
const inventario = (await req('GET', '/projetos?busca=Invent', adm)).j.itens[0];

let r = await req('GET', `/projetos/${ahk._id}/anexos`, ana);
chk('lista do seed', r.s === 200 && r.j.total === 6 && r.j.porTipo.documento === 4 && r.j.porTipo.imagem === 1 && r.j.porTipo.arquivo === 1, r.j?.porTipo);
const porNome = Object.fromEntries(r.j.itens.map((a) => [a.nome, a]));
chk('visualizadores', porNome['ata-kickoff-AHK.pdf'].visualizador === 'pdf' && porNome['especificacao-dashboard-SEPE.docx'].visualizador === 'docx'
  && porNome['checklist-implantacao.md'].visualizador === 'markdown' && porNome['notas-reuniao-laura.txt'].visualizador === 'texto'
  && porNome['proposta-grafica-v1.png'].visualizador === 'imagem' && porNome['planilha-alunos-modelo.csv'].visualizador === null);
chk('não expõe nome no disco', r.j.itens.every((a) => !('arquivo' in a)));
r = await req('GET', `/projetos/${ahk._id}/anexos?tipo=documento&busca=reuniao`, ana);
chk('filtro tipo + busca', r.j.itens.length === 1 && r.j.itens[0].nome === 'notas-reuniao-laura.txt');

// Envio
const video = Buffer.alloc(300 * 1024, 7);
r = await enviar(ana, ahk._id, [['Apresentação do tema.mp4', video, 'video/mp4'], ['diagrama.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml'], ['backup.zip', 'PK', 'application/zip']], 'Material da reunião');
chk('equipe envia 3 arquivos', r.s === 201 && r.j.length === 3, r.j);
const [mp4, svg, zip] = r.j;
chk('nome com acento preservado', mp4.nome === 'Apresentação do tema.mp4', mp4.nome);
chk('tipos classificados', mp4.tipo === 'video' && svg.tipo === 'imagem' && zip.tipo === 'arquivo' && zip.visualizador === null);
chk('descrição', mp4.descricao === 'Material da reunião');
r = await enviar(await login('carla@taskly.local', '123456'), inventario._id, [['x.txt', 'x']]);
chk('não-participante não envia', r.s === 403);
r = await enviar(ana, ahk._id, []);
chk('envio vazio', r.s === 400);
r = await fetch(`${B}/projetos/${ahk._id}/anexos`, { method: 'POST', body: new FormData() });
chk('sem login', r.status === 401);
const muitos = Array.from({ length: 11 }, (_, i) => [`a${i}.txt`, 'x']);
r = await enviar(ana, ahk._id, muitos);
chk('limite de 10 por vez', r.s === 400 && /10 arquivos/.test(r.j.erro), r.j);

// Ver / baixar
r = await req('GET', `/anexos/${mp4._id}/link`, joao);
chk('link para participante', r.s === 200 && r.j.ver.startsWith('/arquivos/') && r.j.visualizador === 'video');
const link = r.j;
let f = await fetch(B + link.ver);
chk('vídeo inline', f.status === 200 && f.headers.get('content-type') === 'video/mp4' && f.headers.get('content-disposition').startsWith('inline'), [f.status, f.headers.get('content-type')]);
chk('filename utf-8', f.headers.get('content-disposition').includes("filename*=UTF-8''Apresenta%C3%A7%C3%A3o"));
f = await fetch(B + link.ver, { headers: { Range: 'bytes=1000-1999' } });
chk('vídeo com Range (206)', f.status === 206 && (await f.arrayBuffer()).byteLength === 1000);
f = await fetch(B + link.baixar);
chk('baixar = attachment', f.headers.get('content-disposition').startsWith('attachment') && f.headers.get('content-type') === 'application/octet-stream');
f = await fetch(B + link.ver.replace(/t=[^&]+/, 't=invalido'));
chk('token inválido', f.status === 401);
const outro = (await req('GET', `/anexos/${zip._id}/link`, ana)).j;
f = await fetch(B + `/arquivos/${mp4._id}?` + outro.ver.split('?')[1]);
chk('token de outro anexo não serve', f.status === 401);
f = await fetch(B + outro.ver);
chk('arquivo sem visualizador sempre baixa', f.headers.get('content-disposition').startsWith('attachment'));
const svgLink = (await req('GET', `/anexos/${svg._id}/link`, ana)).j;
f = await fetch(B + svgLink.ver);
chk('svg isolado (CSP sandbox)', /sandbox/.test(f.headers.get('content-security-policy') || '') && f.headers.get('x-content-type-options') === 'nosniff');
const md = (await req('GET', `/anexos/${porNome['checklist-implantacao.md']._id}/link`, ana)).j;
f = await fetch(B + md.ver);
chk('markdown servido como texto', f.headers.get('content-type').startsWith('text/plain') && (await f.text()).startsWith('# Checklist'));
const carla = await login('carla@taskly.local', '123456');
r = await req('GET', `/anexos/${mp4._id}/link`, carla);
chk('carla participa do AHK e pode ver', r.s === 200);
const pedro = await login('pedro@taskly.local', '123456');
const invAnexo = await enviar(adm, inventario._id, [['interno.pdf', '%PDF-1.4', 'application/pdf']]);
r = await req('GET', `/anexos/${invAnexo.j[0]._id}/link`, ana);
chk('não-participante não vê link', r.s === 403);

// Excluir
r = await req('DELETE', `/anexos/${mp4._id}`, joao);
chk('não exclui anexo de outro', r.s === 403);
r = await req('DELETE', `/anexos/${mp4._id}`, ana);
chk('exclui o próprio', r.s === 200);
f = await fetch(B + link.ver);
chk('arquivo some depois de excluir', f.status === 404);
r = await req('DELETE', `/anexos/${zip._id}`, adm);
chk('admin exclui qualquer um', r.s === 200);

// Diário registra o envio
r = await req('GET', `/projetos/${ahk._id}/diario?dias=1`, ana);
chk('diário registra o envio', r.j.dias[0].itens.some((i) => /enviou 3 anexos/.test(i.texto)));

// Excluir projeto apaga os anexos
r = await req('DELETE', `/projetos/${inventario._id}`, adm);
r = await req('GET', `/anexos/${invAnexo.j[0]._id}/link`, adm);
chk('anexos apagados com o projeto', r.s === 404);

console.log(`\n${ok} verificações OK, ${falhas} falhas`);

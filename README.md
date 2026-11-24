# Taskly

Sistema para cadastrar projetos e **acompanhar o andamento** das tarefas de cada integrante da equipe.

- **API:** Node.js + Express + MongoDB (Mongoose), login com JWT
- **Front:** React + Vite
- **Banco:** MongoDB local

```
app-taskly/
 ├─ api/   → API (porta 4000)
 └─ web/   → Front em React (porta 5173)
```

---

## 1. O que você precisa ter instalado

| Programa | Versão | Como verificar |
|---|---|---|
| Node.js | 20 ou mais novo | `node -v` |
| MongoDB Community Server | 6 ou mais novo | serviço "MongoDB" rodando no Windows |

**MongoDB no Windows:** baixe o *MongoDB Community Server* (MSI) em mongodb.com/try/download/community e, na instalação, deixe marcado **"Install MongoD as a Service"**. Assim ele já fica rodando em `mongodb://127.0.0.1:27017`.

> Alternativa com Docker: na pasta `app-taskly`, rode `docker compose up -d`.

---

## 2. Primeira vez: instalar e criar dados de teste

Abra um terminal na pasta `app-taskly`:

```bash
# API
cd api
npm install
copy .env.example .env      # no Windows (no Mac/Linux: cp .env.example .env)
npm run seed                # cria usuários, projetos e tarefas FAKE
```

```bash
# Front (em outro terminal)
cd web
npm install
```

> ⚠️ `npm run seed` **apaga tudo** que estiver no banco `taskly` e recria os dados de teste.

---

## 3. Rodar no dia a dia

Dois terminais:

```bash
# Terminal 1
cd api
npm run dev        # API em http://localhost:4000/api
```

```bash
# Terminal 2
cd web
npm run dev        # abra http://localhost:5173
```

### Logins de teste (criados pelo seed)

| Perfil | E-mail | Senha |
|---|---|---|
| Admin | admin@taskly.local | admin123 |

> O seed cria o projeto **Plataforma AHK**, um exemplo completo: 7 marcos (Recopilar informação, Criar domínios, Moodle 4.5, Proposta gráfica…), tarefas da Awakelab e do cliente, escopo v1 assinado pelas duas partes e diário preenchido.

| Equipe | ana@taskly.local | 123456 |
| Equipe | joao@taskly.local | 123456 |
| Equipe | maria@taskly.local | 123456 |
| Equipe | pedro@taskly.local | 123456 |
| Equipe | carla@taskly.local | 123456 |

---

## 4. Regras de acesso

| Ação | Admin | Equipe |
|---|---|---|
| Criar, editar e excluir projetos | ✅ | ❌ |
| Criar, editar, excluir e atribuir tarefas | ✅ | ❌ |
| Ver projetos e andamento | ✅ todos | ✅ só os que participa |
| Mudar status das **próprias** tarefas | ✅ | ✅ |
| Lançar horas nas **próprias** tarefas | ✅ | ✅ |
| Cadastrar usuários | ✅ | ❌ |

Toda mudança em tarefa (criação, edição, status, horas) fica registrada no **histórico** da tarefa.

**Atrasada** = prazo vencido e tarefa ainda não concluída (calculado na hora, não é gravado).

---

## 5. Telas

1. **Login**
2. **Projetos**: cartões com status, % concluído, atrasadas e prazo; busca e filtro por status.
3. **Projeto**, com 6 abas:
   - **Marcos** (visão linear): marco por marco (hitos), com datas aproximadas, status calculado pelas tarefas, entrega vencida, e as tarefas de cada um com o lado (**Awakelab** ou **Cliente**), o responsável e o status. Filtro Todas / Awakelab / Cliente.
   - **Escopo e acordo**: o que **vai** e o que **não vai** no projeto, com versões e assinaturas (veja a seção 5.1).
   - **Diário**: o que aconteceu em cada dia, com observações (veja a seção 5.3).
   - **Anexos**: vídeos, imagens, documentos e arquivos do projeto, com visualizador (veja a seção 5.2).
   - **Quadro de tarefas**: colunas A fazer / Em andamento / Concluída.
   - **Andamento da equipe**: tarefas e horas por integrante e por prioridade (não é ranking).
4. **Minhas tarefas**: tudo que está com o usuário logado, em todos os projetos.
5. **Usuários** (só admin).
6. **Minha conta** (clique no seu nome no menu): trocar a senha e configurar o **e-mail de envio**.
7. **Página do cliente** (`/acordo/<código>`): aberta pelo link do e-mail, sem login.

### 5.1 Escopo e acordo (assinatura das duas partes)

```
Rascunho  →  "Enviar para assinatura"  →  Aguardando  →  as duas assinaturas  →  Assinado (vigente)
 (admin edita     (e-mail ao cliente,        ├─ Awakelab: botão "Assinar pela Awakelab"
  as 2 listas)     pela conta de quem         │   (só o responsável do projeto)
                   está logado)               └─ Cliente: botão "Concordo" no e-mail
```

- Cada projeto tem **responsável Awakelab** e **responsável do cliente** (nome, e-mail e cargo, em "Editar projeto").
- Qualquer alteração depois de assinado: **"Alterar escopo (nova versão)"**. A versão anterior fica no histórico como *Substituída*.
- **Comprovante** de cada versão: conteúdo, quem assinou e quando, IP do cliente, e os **e-mails anexados** (o pedido e a confirmação de concordância, enviada ao cliente e a quem enviou).
- O link do cliente vale 30 dias. Clicar duas vezes não duplica nada. Se o envio for cancelado, o link deixa de aceitar.

**E-mail de envio.** O acordo sai pela conta de e-mail **de quem está logado**, configurada em *Minha conta → E-mail de envio* (Gmail/Google Workspace, Outlook/Microsoft 365 ou outro servidor SMTP, usando uma **senha de app**). A senha fica cifrada no banco.
Enquanto ninguém configurar, o sistema fica em **modo teste**: o e-mail é gerado e anexado, mas não sai do computador, e a tela mostra o link para você simular o clique do cliente.

> **Importante:** para um cliente de verdade abrir o link, o Taskly precisa estar publicado num endereço acessível pela internet. Ajuste `APP_URL` no `.env` para esse endereço. Rodando só local, o link `http://localhost:5173/...` funciona apenas no seu computador.

### 5.2 Anexos

Aba **Anexos** em cada projeto. Qualquer participante envia e vê; cada um exclui o que enviou (admin exclui tudo).

| Tipo | Extensões | Como abre |
|---|---|---|
| **Vídeos** | mp4, webm, mov, m4v, ogv (avi e mkv só baixar) | Player no próprio Taskly, com avanço para qualquer ponto |
| **Imagens** | png, jpg, gif, webp, bmp, svg | Visualizador em tela cheia (miniatura na lista) |
| **Documentos** | pdf, docx (Word), txt, md (Markdown) · doc, odt e rtf só baixar | PDF no leitor do navegador, Word e Markdown formatados, texto simples |
| **Arquivos** | qualquer outro (zip, xlsx, csv…) | Só para baixar |

- Envio arrastando ou escolhendo no computador, até **10 arquivos por vez** e **500 MB cada** (`MAX_UPLOAD_MB` no `.env`), com barra de progresso e descrição opcional.
- No visualizador: setas ← → passam para o próximo anexo, Esc fecha, botão **Baixar**.
- Os arquivos ficam na pasta `api/uploads/<id do projeto>/` (fora do Git). Para guardar em outro lugar, use `PASTA_UPLOADS` no `.env`. Ao excluir um projeto, os anexos dele são apagados.
- Os links de ver/baixar são **temporários (30 min)** e só são gerados para quem participa do projeto.
- Cada envio aparece no **diário** do projeto.

### 5.3 Diário

- Qualquer participante registra o que aconteceu num dia: texto com observações, **tipo** (Avanço, Observação, Problema, Reunião, Cliente), **dia** (pode ser retroativo) e **marco** opcional.
- Junto aparecem, se marcado, os **eventos automáticos**: mudanças de status e horas nas tarefas, e os passos do acordo (enviado, assinado etc.).
- Cada um edita/exclui só o que escreveu (admin edita tudo). Eventos automáticos não podem ser alterados.

---

## 6. Rotas da API

Todas começam com `/api` e, exceto o login, exigem o cabeçalho `Authorization: Bearer <token>`.

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| POST | `/auth/login` | todos | Login (`email`, `senha`) |
| GET | `/auth/me` | logado | Dados do usuário logado |
| PATCH | `/auth/me/senha` | logado | Trocar a própria senha |
| GET | `/usuarios` | admin | Lista paginada (`busca`, `pagina`, `limite`) |
| GET | `/usuarios/opcoes` | admin | Lista curta para seletores |
| POST | `/usuarios` | admin | Criar usuário |
| PATCH | `/usuarios/:id` | admin | Editar / desativar usuário |
| GET | `/projetos` | logado | Lista paginada com resumo (`busca`, `status`, `pagina`) |
| POST | `/projetos` | admin | Criar projeto |
| GET | `/projetos/:id` | participante | Detalhe do projeto |
| PATCH | `/projetos/:id` | admin | Editar projeto e integrantes |
| DELETE | `/projetos/:id` | admin | Excluir projeto e suas tarefas |
| GET | `/projetos/:id/andamento` | participante | Andamento geral, por prioridade e por integrante |
| GET | `/projetos/:id/tarefas` | participante | Tarefas (`status`, `responsavel`, `prioridade`, `atrasadas`, `busca`, `pagina`) |
| POST | `/projetos/:id/tarefas` | admin | Criar tarefa |
| GET | `/tarefas/minhas` | logado | Tarefas do usuário logado (`status=abertas` etc.) |
| GET | `/tarefas/:id` | participante | Detalhe da tarefa |
| PATCH | `/tarefas/:id` | admin | Editar tarefa |
| PATCH | `/tarefas/:id/status` | admin ou responsável | Mudar status |
| POST | `/tarefas/:id/horas` | admin ou responsável | Lançar horas (`horas`, `nota`) |
| DELETE | `/tarefas/:id` | admin | Excluir tarefa |
| GET | `/tarefas/:id/historico` | participante | Histórico da tarefa |
| GET | `/projetos/:id/marcos` | participante | Marcos (`comTarefas=true` traz a visão linear) |
| POST | `/projetos/:id/marcos` | admin | Criar marco |
| PATCH / DELETE | `/marcos/:id` | admin | Editar / excluir marco (as tarefas ficam "sem marco") |
| GET | `/projetos/:id/acordos` | participante | Escopo: versão vigente, em andamento e histórico |
| POST | `/projetos/:id/acordos/rascunho` | admin | Abrir (ou criar) a versão em rascunho |
| PATCH | `/acordos/:id` | admin | Editar listas do rascunho (`incluidos`, `naoIncluidos`, `observacoes`) |
| POST | `/acordos/:id/enviar` | admin | Enviar ao cliente por e-mail |
| POST | `/acordos/:id/assinar` | responsável Awakelab | Assinar pela Awakelab |
| POST | `/acordos/:id/cancelar` | admin | Cancelar o envio |
| GET | `/acordos/:id/comprovante` | participante | Comprovante com os e-mails anexados |
| GET / POST | `/publico/acordos/:token` (`/concordar`) | cliente, sem login | Ver e concordar com o acordo |
| GET / POST | `/projetos/:id/diario` | participante | Diário por dia (`ate`, `dias`, `automaticos`) / novo registro |
| GET | `/projetos/:id/anexos` | participante | Anexos (`tipo`, `busca`) com contagem por tipo |
| POST | `/projetos/:id/anexos` | participante | Enviar arquivos (multipart, campo `arquivos`, até 10) |
| GET | `/anexos/:id/link` | participante | Link temporário para ver/baixar |
| DELETE | `/anexos/:id` | quem enviou ou admin | Excluir anexo |
| GET | `/arquivos/:id?t=…` | link temporário | Entrega o arquivo (com `&baixar=1` força o download) |
| PATCH / DELETE | `/diario/:id` | autor ou admin | Editar / excluir registro |
| GET / PUT | `/auth/me/email` | logado | Ver / salvar o e-mail de envio |
| POST | `/auth/me/email/teste` | logado | Enviar e-mail de teste |
| GET | `/chat` | logado | Mensagens da conversa com o assistente |
| POST | `/chat` | logado | Enviar mensagem ao assistente (`mensagem`) |
| DELETE | `/chat` | logado | Começar uma nova conversa |

---

## 7. Banco de dados (coleções)

- **usuarios** – nome, email, senha (criptografada), papel (`admin`/`equipe`), funcao, ativo
- **projetos** – nome, descricao, cliente, responsavel, integrantes[{usuario, funcao}], status, dataInicio, prazo
- **tarefas** – projeto, titulo, descricao, responsavel, status, prioridade, prazo, horasEstimadas, horasGastas, concluidaEm
- **historicos** – tarefa, projeto, usuario, acao, detalhes, data
- **conversas** – histórico do assistente de chat, uma por usuário
- **marcos** – projeto, titulo, descricao, dataInicio, dataFim, ordem (status calculado pelas tarefas)
- **acordos** – versões do escopo: incluidos, naoIncluidos, status, assinaturas (Awakelab e cliente), e-mails anexados
- **registrodiarios** – diário: projeto, data, texto, categoria, marco, autor, tipo (manual/sistema)
- **anexos** – projeto, nome, tipo (video/imagem/documento/arquivo), extensão, tamanho, quem enviou; o arquivo fica em `api/uploads`

Nas **tarefas**, além dos campos acima: `marco`, `lado` (`awakelab`/`cliente`) e `responsavelExterno` (nome da pessoa do cliente). Nos **projetos**: `responsavelCliente` (nome, email, cargo).

As tarefas ficam numa coleção separada (não dentro do projeto) e as listas são paginadas, com índices no MongoDB. Os totais de andamento são calculados pelo próprio banco (aggregation), então o sistema não tem limite de tamanho de projeto.

---

## 8. Assistente de chat (OpenAI)

Botão **Assistente** no canto inferior direito. Você escreve em linguagem normal ("quero criar um projeto", "terminei a tarefa de login", "como está o Portal do Aluno?") e ele pergunta o que falta e executa sozinho.

### Configurar

1. No arquivo `api/.env`, preencha:
   ```
   OPENAI_API_KEY=sua-chave-aqui
   OPENAI_MODEL=gpt-6.1-terra
   OPENAI_REASONING_EFFORT=low
   ```
2. Na pasta `api`, rode `npm install` (instala a biblioteca `openai`) e reinicie a API (`npm run dev`).

> Nunca coloque a chave no código, no front ou em mensagens. Ela fica só no `.env`, que não vai para o Git.

### Como funciona

```
Front (Chat.jsx) → POST /api/chat → OpenAI escolhe a função → a API executa
                                       com as permissões do usuário → OpenAI responde
```

- A IA **não acessa o banco**: ela só escolhe qual função usar. Quem executa é a API, com as **mesmas regras dos botões** (pasta `api/src/servicos`).
- **Equipe** recebe só as funções permitidas a ela: consultar projetos de que participa, ver tarefas, mudar status e lançar horas nas **próprias** tarefas.
- **Exclusões** só acontecem se o assistente perguntou "Confirma…?" na resposta anterior **e** o usuário respondeu "sim".
- **Criar usuário:** a senha é gerada automaticamente e aparece só na tela do admin (não é enviada à OpenAI).
- A conversa fica salva por usuário (coleção `conversas`). "Nova conversa" apaga o histórico.
- Quando o assistente altera algo, as telas abertas se atualizam sozinhas.

| Função | Quem |
|---|---|
| listar_projetos, ver_projeto, listar_tarefas, minhas_tarefas, ver_tarefa | todos |
| mudar_status_tarefa, lancar_horas | todos (equipe: só as próprias) |
| criar_projeto, editar_projeto, adicionar_integrante, remover_integrante, excluir_projeto | admin |
| criar_tarefa, editar_tarefa, excluir_tarefa | admin |
| listar_usuarios, criar_usuario, editar_usuario | admin |
| ver_marcos, ver_escopo, registrar_diario, ver_diario, listar_anexos | todos |
| criar_marco, editar_marco, excluir_marco, alterar_escopo | admin |

O assistente **não envia o acordo nem assina**: isso é feito pelos botões da aba *Escopo e acordo*.

### Arquivos do assistente

| Arquivo | O que faz |
|---|---|
| `api/src/chat/assistente.js` | Conversa com a OpenAI e roda o ciclo de funções |
| `api/src/chat/ferramentas.js` | As funções disponíveis e quem pode usar cada uma |
| `api/src/chat/referencias.js` | Encontra projetos, tarefas e pessoas pelo nome |
| `api/src/routes/chat.js` | Rotas `GET/POST/DELETE /api/chat` |
| `api/src/models/Conversa.js` | Histórico das conversas |
| `web/src/components/Chat.jsx` | Janela do chat |

Para **remover** o assistente: apague esses arquivos, a linha `app.use('/api/chat', …)` em `api/src/app.js` e a linha `<Chat />` em `web/src/components/Layout.jsx`. O resto do sistema continua igual.

### Testes automáticos

Com a API ligada e depois de `npm run seed`:

```bash
node teste-local/api.mjs                  # login, permissões, projetos e tarefas
node teste-local/marcos-acordo-diario.mjs # marcos, escopo/assinaturas e diário
node teste-local/anexos.mjs               # anexos: envio, links, vídeo, permissões
```

### Testar sem gastar créditos

```bash
cd api
node teste-local/chat.mjs              # testes do assistente com OpenAI simulada
node teste-local/servidor-simulado.mjs # sobe a API com respostas simuladas para testar a tela
```

### Erros comuns

| Mensagem | O que fazer |
|---|---|
| "assistente ainda não está configurado" | Preencha `OPENAI_API_KEY` no `.env` e reinicie a API |
| "chave … foi recusada" | Chave errada ou revogada; gere outra no painel da OpenAI |
| "limite de uso ou falta de créditos" | Adicione créditos na conta OpenAI |
| "modelo … não foi encontrado" | Troque `OPENAI_MODEL` (ex.: `gpt-6-luna`) |
| erro mencionando "reasoning" | Deixe `OPENAI_REASONING_EFFORT=` vazio |

---

## 9. Próximos passos sugeridos

- Comentários nas tarefas
- Gráfico de evolução do andamento ao longo do tempo
- Notificações (tarefa atribuída, prazo chegando)
- Arrastar tarefas entre colunas no quadro

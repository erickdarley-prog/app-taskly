import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as anexos from '../servicos/anexos.js';

// /api/projetos/:id/anexos — lista e envio (qualquer participante do projeto)
export const rotasAnexosDoProjeto = Router({ mergeParams: true });
rotasAnexosDoProjeto.use(autenticar);
rotasAnexosDoProjeto.get('/', rota(async (req, res) => res.json(await anexos.listarAnexos(req.usuario, req.params.id, req.query))));
rotasAnexosDoProjeto.post(
  '/',
  anexos.prepararEnvio,
  anexos.receber,
  rota(async (req, res) => res.status(201).json(await anexos.registrarEnvio(req.usuario, req.projeto, req.files, req.body?.descricao)))
);

// /api/anexos/:id — link para ver/baixar e exclusão
export const rotasAnexos = Router();
rotasAnexos.use(autenticar);
rotasAnexos.get('/:id/link', rota(async (req, res) => res.json(await anexos.linkTemporario(req.usuario, req.params.id))));
rotasAnexos.delete('/:id', rota(async (req, res) => res.json(await anexos.excluirAnexo(req.usuario, req.params.id))));

// /api/arquivos/:id?t=... — entrega o arquivo (o link temporário substitui o login)
export const rotasArquivos = Router();
rotasArquivos.get('/:id', anexos.servirArquivo);

import { Router } from 'express';
import { autenticar, somenteAdmin } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as marcos from '../servicos/marcos.js';

// Rotas /api/projetos/:id/marcos (lista e criação) e /api/marcos/:id (edição e exclusão)
export const rotasMarcosDoProjeto = Router({ mergeParams: true });
rotasMarcosDoProjeto.use(autenticar);
rotasMarcosDoProjeto.get(
  '/',
  rota(async (req, res) =>
    res.json(await marcos.listarMarcos(req.usuario, req.params.id, { comTarefas: req.query.comTarefas === 'true' }))
  )
);
rotasMarcosDoProjeto.post(
  '/',
  somenteAdmin,
  rota(async (req, res) => res.status(201).json(await marcos.criarMarco(req.usuario, req.params.id, req.body)))
);

export const rotasMarcos = Router();
rotasMarcos.use(autenticar, somenteAdmin);
rotasMarcos.patch('/:id', rota(async (req, res) => res.json(await marcos.atualizarMarco(req.usuario, req.params.id, req.body))));
rotasMarcos.delete('/:id', rota(async (req, res) => res.json(await marcos.excluirMarco(req.usuario, req.params.id))));

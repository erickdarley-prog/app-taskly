import { Router } from 'express';
import { autenticar } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as diario from '../servicos/diario.js';

// /api/projetos/:id/diario
export const rotasDiarioDoProjeto = Router({ mergeParams: true });
rotasDiarioDoProjeto.use(autenticar);
rotasDiarioDoProjeto.get('/', rota(async (req, res) => res.json(await diario.obterDiario(req.usuario, req.params.id, req.query))));
rotasDiarioDoProjeto.post(
  '/',
  rota(async (req, res) => res.status(201).json(await diario.criarRegistro(req.usuario, req.params.id, req.body)))
);

// /api/diario/:id
export const rotasDiario = Router();
rotasDiario.use(autenticar);
rotasDiario.patch('/:id', rota(async (req, res) => res.json(await diario.atualizarRegistro(req.usuario, req.params.id, req.body))));
rotasDiario.delete('/:id', rota(async (req, res) => res.json(await diario.excluirRegistro(req.usuario, req.params.id))));

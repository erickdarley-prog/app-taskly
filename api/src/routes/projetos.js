import { Router } from 'express';
import { autenticar, somenteAdmin } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as projetos from '../servicos/projetos.js';

const router = Router();
router.use(autenticar);

router.get('/', rota(async (req, res) => res.json(await projetos.listarProjetos(req.usuario, req.query))));

router.post(
  '/',
  somenteAdmin,
  rota(async (req, res) => res.status(201).json(await projetos.criarProjeto(req.usuario, req.body)))
);

router.get('/:id', rota(async (req, res) => res.json(await projetos.obterProjeto(req.usuario, req.params.id))));

router.patch(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => res.json(await projetos.atualizarProjeto(req.usuario, req.params.id, req.body)))
);

router.delete(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => {
    await projetos.excluirProjeto(req.usuario, req.params.id);
    res.status(204).end();
  })
);

router.get('/:id/andamento', rota(async (req, res) => res.json(await projetos.obterAndamento(req.usuario, req.params.id))));

router.get(
  '/:id/tarefas',
  rota(async (req, res) => res.json(await projetos.listarTarefasDoProjeto(req.usuario, req.params.id, req.query)))
);

router.post(
  '/:id/tarefas',
  somenteAdmin,
  rota(async (req, res) => res.status(201).json(await projetos.criarTarefa(req.usuario, req.params.id, req.body)))
);

export default router;

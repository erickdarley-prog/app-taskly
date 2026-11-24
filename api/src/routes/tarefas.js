import { Router } from 'express';
import { autenticar, somenteAdmin } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as tarefas from '../servicos/tarefas.js';

const router = Router();
router.use(autenticar);

// Tarefas do usuário logado, em todos os projetos
router.get('/minhas', rota(async (req, res) => res.json(await tarefas.minhasTarefas(req.usuario, req.query))));

router.get('/:id', rota(async (req, res) => res.json(await tarefas.obterTarefa(req.usuario, req.params.id))));

// Edição completa: somente admin
router.patch(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => res.json(await tarefas.atualizarTarefa(req.usuario, req.params.id, req.body)))
);

// Status: admin ou o responsável pela tarefa
router.patch(
  '/:id/status',
  rota(async (req, res) => res.json(await tarefas.mudarStatus(req.usuario, req.params.id, req.body?.status)))
);

// Lançar horas: admin ou o responsável pela tarefa
router.post(
  '/:id/horas',
  rota(async (req, res) => res.json(await tarefas.lancarHoras(req.usuario, req.params.id, req.body?.horas, req.body?.nota)))
);

router.delete(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => {
    await tarefas.excluirTarefa(req.usuario, req.params.id);
    res.status(204).end();
  })
);

router.get(
  '/:id/historico',
  rota(async (req, res) => res.json(await tarefas.historicoDaTarefa(req.usuario, req.params.id, req.query)))
);

export default router;

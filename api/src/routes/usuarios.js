import { Router } from 'express';
import { autenticar, somenteAdmin } from '../middlewares/auth.js';
import { rota } from '../utils/http.js';
import * as usuarios from '../servicos/usuarios.js';

const router = Router();
router.use(autenticar, somenteAdmin);

// Lista paginada (tela de Usuários)
router.get('/', rota(async (req, res) => res.json(await usuarios.listarUsuarios(req.usuario, req.query))));

// Lista curta de usuários ativos, para preencher seletores (integrantes, responsável)
router.get('/opcoes', rota(async (req, res) => res.json(await usuarios.opcoesDeUsuarios(req.usuario, req.query))));

router.post('/', rota(async (req, res) => res.status(201).json(await usuarios.criarUsuario(req.usuario, req.body))));

router.patch('/:id', rota(async (req, res) => res.json(await usuarios.atualizarUsuario(req.usuario, req.params.id, req.body))));

export default router;

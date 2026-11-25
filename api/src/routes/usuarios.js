import { Router } from 'express';
import { autenticar, soloAdmin } from '../middlewares/auth.js';
import { ruta } from '../utils/http.js';
import * as usuarios from '../servicios/usuarios.js';

const router = Router();
router.use(autenticar, soloAdmin);

// Lista paginada (pantalla de Usuarios)
router.get('/', ruta(async (req, res) => res.json(await usuarios.listarUsuarios(req.usuario, req.query))));

// Lista corta de usuarios activos, para rellenar selectores (integrantes, responsable)
router.get('/opciones', ruta(async (req, res) => res.json(await usuarios.opcionesDeUsuarios(req.usuario, req.query))));

router.post('/', ruta(async (req, res) => res.status(201).json(await usuarios.crearUsuario(req.usuario, req.body))));

router.patch('/:id', ruta(async (req, res) => res.json(await usuarios.actualizarUsuario(req.usuario, req.params.id, req.body))));

export default router;

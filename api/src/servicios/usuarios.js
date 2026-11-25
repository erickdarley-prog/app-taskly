// Reglas de negocio de usuarios (las usan las rutas y el asistente de chat).
import { Usuario } from '../models/Usuario.js';
import { ErrorHttp, elegir, exigirId, paginacion, respuestaPaginada } from '../utils/http.js';
import { escaparRegex } from '../utils/texto.js';
import { exigirAdmin } from './proyectos.js';

export async function listarUsuarios(usuario, query = {}) {
  exigirAdmin(usuario, 'Solo los administradores pueden ver la lista de usuarios');
  const pag = paginacion(query);
  const filtro = {};
  if (query.busqueda) {
    const termino = new RegExp(escaparRegex(String(query.busqueda)), 'i');
    filtro.$or = [{ nombre: termino }, { email: termino }];
  }
  if (query.rol) filtro.rol = query.rol;
  if (query.activo !== undefined) filtro.activo = query.activo === 'true' || query.activo === true;

  const [items, total] = await Promise.all([
    Usuario.find(filtro).sort({ nombre: 1 }).skip(pag.saltar).limit(pag.limite),
    Usuario.countDocuments(filtro),
  ]);
  return respuestaPaginada(items, total, pag);
}

export async function opcionesDeUsuarios(usuario, query = {}) {
  exigirAdmin(usuario);
  const filtro = { activo: true };
  if (query.busqueda) {
    const termino = new RegExp(escaparRegex(String(query.busqueda)), 'i');
    filtro.$or = [{ nombre: termino }, { email: termino }];
  }
  return Usuario.find(filtro).select('nombre email funcion rol').sort({ nombre: 1 }).limit(200);
}

export async function crearUsuario(usuario, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden crear usuarios');
  const datos = elegir(cuerpo || {}, ['nombre', 'email', 'contrasena', 'rol', 'funcion']);
  if (!datos.contrasena || String(datos.contrasena).length < 6) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 6 caracteres');
  }
  return Usuario.create(datos);
}

export async function actualizarUsuario(usuario, id, cuerpo) {
  exigirAdmin(usuario, 'Solo los administradores pueden editar usuarios');
  const objetivo = await Usuario.findById(exigirId(id));
  if (!objetivo) throw new ErrorHttp(404, 'Usuario no encontrado');

  const datos = elegir(cuerpo || {}, ['nombre', 'email', 'rol', 'funcion', 'activo', 'contrasena']);
  const esEleMismo = String(objetivo._id) === String(usuario._id);
  if (esEleMismo && (datos.rol === 'equipo' || datos.activo === false)) {
    throw new ErrorHttp(400, 'No puedes quitar tu propio acceso de administrador');
  }
  if (datos.contrasena === '' || datos.contrasena === null) delete datos.contrasena;
  if (datos.contrasena !== undefined && String(datos.contrasena).length < 6) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 6 caracteres');
  }

  Object.assign(objetivo, datos);
  await objetivo.save();
  return objetivo;
}

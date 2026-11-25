import { Tarea } from '../models/Tarea.js';

// Cálculos de avance hechos en el propio MongoDB (aggregation),
// para que siga siendo rápido incluso con miles de tareas.

function camposConteo(ahora) {
  const atrasada = {
    $and: [
      { $ne: ['$status', 'completada'] },
      { $ne: [{ $ifNull: ['$plazo', null] }, null] },
      { $lt: ['$plazo', ahora] },
    ],
  };
  return {
    total: { $sum: 1 },
    porHacer: { $sum: { $cond: [{ $eq: ['$status', 'por_hacer'] }, 1, 0] } },
    enCurso: { $sum: { $cond: [{ $eq: ['$status', 'en_curso'] }, 1, 0] } },
    completadas: { $sum: { $cond: [{ $eq: ['$status', 'completada'] }, 1, 0] } },
    atrasadas: { $sum: { $cond: [atrasada, 1, 0] } },
    horasEstimadas: { $sum: '$horasEstimadas' },
    horasGastadas: { $sum: '$horasGastadas' },
  };
}

const VACIO = {
  total: 0,
  porHacer: 0,
  enCurso: 0,
  completadas: 0,
  atrasadas: 0,
  horasEstimadas: 0,
  horasGastadas: 0,
};

function finalizar(datos = {}) {
  const r = { ...VACIO, ...datos };
  delete r._id;
  r.porcentaje = r.total ? Math.round((r.completadas / r.total) * 100) : 0;
  r.horasEstimadas = Math.round(r.horasEstimadas * 10) / 10;
  r.horasGastadas = Math.round(r.horasGastadas * 10) / 10;
  return r;
}

// Resumen de varios proyectos a la vez (se usa en la lista de proyectos).
export async function resumenDeProyectos(idsProyectos) {
  if (!idsProyectos.length) return new Map();
  const lineas = await Tarea.aggregate([
    { $match: { proyecto: { $in: idsProyectos } } },
    { $group: { _id: '$proyecto', ...camposConteo(new Date()) } },
  ]);
  const mapa = new Map(lineas.map((l) => [String(l._id), finalizar(l)]));
  return new Map(idsProyectos.map((id) => [String(id), mapa.get(String(id)) || finalizar()]));
}

// Avance completo de un proyecto: general, por prioridad y por integrante.
export async function avanceDelProyecto(proyecto) {
  const ahora = new Date();
  const [resultado] = await Tarea.aggregate([
    { $match: { proyecto: proyecto._id } },
    {
      $facet: {
        general: [{ $group: { _id: null, ...camposConteo(ahora) } }],
        porPrioridad: [{ $group: { _id: '$prioridad', ...camposConteo(ahora) } }],
        porIntegrante: [{ $group: { _id: '$responsable', ...camposConteo(ahora) } }],
      },
    },
  ]);

  const general = finalizar(resultado.general[0]);

  const porPrioridad = {};
  for (const p of ['alta', 'media', 'baja']) {
    const linea = resultado.porPrioridad.find((l) => l._id === p);
    porPrioridad[p] = finalizar(linea);
  }

  const conteoPorUsuario = new Map(
    resultado.porIntegrante.map((l) => [l._id ? String(l._id) : 'sin_responsable', l])
  );

  const porIntegrante = proyecto.integrantes.map((i) => {
    const usuario = i.usuario;
    const id = String(usuario?._id || usuario);
    return {
      usuario: usuario?._id ? { _id: usuario._id, nombre: usuario.nombre, email: usuario.email } : { _id: id },
      funcion: i.funcion || usuario?.funcion || '',
      ...finalizar(conteoPorUsuario.get(id)),
    };
  });

  const sinResponsable = conteoPorUsuario.get('sin_responsable');

  return {
    general,
    porPrioridad,
    porIntegrante,
    sinResponsable: sinResponsable ? finalizar(sinResponsable) : null,
  };
}

// Proyecto de ejemplo completo, siguiendo el modelo pedido:
// hitos con tareas de Awakelab y del Cliente, alcance firmado por las dos partes y diario.
import { Proyecto } from './models/Proyecto.js';
import { Hito } from './models/Hito.js';
import { Tarea } from './models/Tarea.js';
import { Historial } from './models/Historial.js';
import { Acuerdo } from './models/Acuerdo.js';
import { RegistroDiario } from './models/RegistroDiario.js';
import { abrirBorrador, actualizarBorrador, firmarPorEmpresa, aceptarPublico, enviarParaFirma } from './servicios/acuerdos.js';

const A = 'awakelab';
const C = 'cliente';

// [título del hito, inicio, fin, tareas: [título, lado, responsable (e-mail o nombre del cliente), estado, plazo]]
const HITOS = [
  ['Recopilar información', -16, -13, [
    ['Facilitar datos de la empresa, logos y colores', C, 'Laura Méndez', 'completada', -14],
    ['Enviar lista de cursos que desea ofrecer', C, 'Laura Méndez', 'completada', -13],
    ['Enviar catálogo de cursos y planes', A, 'carla@taskly.local', 'completada', -15],
    ['Reunión de kickoff con el cliente', A, 'admin@taskly.local', 'completada', -16],
  ]],
  ['Crear dominios', -14, -13, [
    ['Aprobar el nombre del dominio', C, 'Laura Méndez', 'completada', -14],
    ['Configurar DNS y subdominios', A, 'joao@taskly.local', 'completada', -13],
    ['Instalar certificado SSL', A, 'joao@taskly.local', 'completada', -13],
  ]],
  ['Desplegar la plataforma base con Moodle 4.5', -13, -12, [
    ['Instalar Moodle 4.5', A, 'joao@taskly.local', 'completada', -12],
    ['Configurar idiomas, zona horaria y e-mails del sistema', A, 'joao@taskly.local', 'completada', -12],
    ['Validar el acceso de administrador', C, 'Laura Méndez', 'completada', -12],
  ]],
  ['Propuesta gráfica', -10, -3, [
    ['Crear dos propuestas de diseño', A, 'maria@taskly.local', 'completada', -6],
    ['Elegir la propuesta y enviar comentarios', C, 'Laura Méndez', 'en_curso', -2],
    ['Aplicar el tema elegido en Moodle', A, 'maria@taskly.local', 'por_hacer', 2],
  ]],
  ['Informes y dashboard SEPE', -2, 8, [
    ['Informes detallados de avance de alumnos', A, 'joao@taskly.local', 'en_curso', 5],
    ['Dashboard administrativo para enviar al SEPE', A, 'ana@taskly.local', 'por_hacer', 8],
    ['Enviar plantilla de informe exigida por el SEPE', C, 'Laura Méndez', 'por_hacer', 1],
  ]],
  ['Carga de cursos y usuarios', 6, 12, [
    ['Enviar hoja de cálculo de alumnos y tutores', C, 'Laura Méndez', 'por_hacer', 7],
    ['Importar cursos del catálogo', A, 'carla@taskly.local', 'por_hacer', 10],
    ['Importar usuarios y matrículas', A, 'joao@taskly.local', 'por_hacer', 12],
  ]],
  ['Pruebas, formación y entrega', 12, 16, [
    ['Pruebas completas de la plataforma', A, 'pedro@taskly.local', 'por_hacer', 14],
    ['Validación por el cliente', C, 'Laura Méndez', 'por_hacer', 15],
    ['Formación de administradores (2 h)', A, 'admin@taskly.local', 'por_hacer', 16],
  ]],
];

const ALCANCE = {
  incluidos: [
    'Plataforma Moodle 4.5 con dominio propio y certificado SSL',
    'Tema gráfico personalizado con la identidad del cliente',
    'Informes detallados de avance de alumnos',
    'Dashboard administrativo para enviar al SEPE',
    'Carga inicial de hasta 20 cursos y de los usuarios',
    'Formación de 2 horas para administradores',
  ],
  noIncluidos: [
    'Compra del dominio',
    'Gestión del certificado SEPE',
    'Producción del contenido de los cursos',
    'Alojamiento después de los primeros 12 meses',
  ],
};

// [día relativo, autor (e-mail), categoría, hito (índice), texto]
const DIARIO = [
  [-16, 'admin@taskly.local', 'reunion', 0, 'Reunión de kickoff con Laura (AHK). Objetivo alineado: plataforma lista para los grupos de enero. El cliente pidió informes para el SEPE.'],
  [-15, 'carla@taskly.local', 'avance', 0, 'Catálogo de cursos y planes enviado por e-mail a Laura.'],
  [-14, 'joao@taskly.local', 'cliente', 1, 'El cliente aprobó el dominio "formacion-ahk". La compra del dominio queda a cargo del cliente (fuera del alcance).'],
  [-13, 'joao@taskly.local', 'avance', 1, 'DNS propagado y SSL instalado. El dominio responde con normalidad.'],
  [-12, 'joao@taskly.local', 'avance', 2, 'Moodle 4.5 instalado y configurado (idioma español, zona horaria de Madrid). Acceso de administrador entregado al cliente.'],
  [-12, 'admin@taskly.local', 'cliente', null, 'Acuerdo de especificaciones v1 revisado con Laura por teléfono antes del envío.'],
  [-9, 'maria@taskly.local', 'avance', 3, 'Primera propuesta de diseño lista (azul corporativo).'],
  [-6, 'maria@taskly.local', 'avance', 3, 'Segunda propuesta lista y las dos enviadas al cliente.'],
  [-4, 'admin@taskly.local', 'problema', 3, 'El cliente aún no ha elegido la propuesta gráfica. Enviado recordatorio; esto puede retrasar la aplicación del tema.'],
  [-2, 'joao@taskly.local', 'avance', 4, 'Empezamos los informes de avance de alumnos. A la espera de la plantilla de informe del SEPE (tarea del cliente).'],
  [-1, 'admin@taskly.local', 'observacion', 3, 'Laura respondió que decide la propuesta antes del viernes. Se mantiene el plazo del tema.'],
];

export async function crearProyectoAHK({ porEmail, admin, enDias }) {
  const equipo = [
    ['joao@taskly.local', 'Back-end / Infraestructura'],
    ['maria@taskly.local', 'Diseño'],
    ['ana@taskly.local', 'Front-end'],
    ['carla@taskly.local', 'Contenido'],
    ['pedro@taskly.local', 'QA / Pruebas'],
  ];
  const proyecto = await Proyecto.create({
    nombre: 'Plataforma AHK',
    cliente: 'AHK (cliente de ejemplo)',
    descripcion: 'Plataforma completa de formación en Moodle 4.5: dominio, tema gráfico, informes de alumnos y dashboard para el SEPE.',
    status: 'en_curso',
    responsable: admin._id,
    responsableCliente: { nombre: 'Laura Méndez', email: 'laura.mendez@example.com', cargo: 'Coordinadora de formación' },
    integrantes: equipo.map(([email, funcion]) => ({ usuario: porEmail[email]._id, funcion })),
    fechaInicio: enDias(-16),
    plazo: enDias(16),
  });

  const hitos = [];
  let totalTareas = 0;
  for (const [i, [titulo, inicio, fin, tareas]] of HITOS.entries()) {
    const hito = await Hito.create({ proyecto: proyecto._id, titulo, orden: i + 1, fechaInicio: enDias(inicio), fechaFin: enDias(fin) });
    hitos.push(hito);
    const docs = tareas.map(([t, lado, resp, status, plazo]) => ({
      proyecto: proyecto._id,
      hito: hito._id,
      titulo: t,
      lado,
      responsable: lado === A ? porEmail[resp]._id : undefined,
      responsableExterno: lado === C ? resp : '',
      status,
      prioridad: lado === C && status !== 'completada' ? 'alta' : 'media',
      plazo: enDias(plazo),
      horasEstimadas: lado === A ? 4 : 0,
      horasGastadas: lado === A && status === 'completada' ? 4 : lado === A && status === 'en_curso' ? 2 : 0,
      completadaEn: status === 'completada' ? enDias(plazo) : undefined,
    }));
    const creadas = await Tarea.insertMany(docs);
    // Historial con fechas pasadas, para que el diario muestre cada cosa el día en que ocurrió.
    const historiales = creadas.map((t) => ({
      tarea: t._id,
      proyecto: proyecto._id,
      usuario: admin._id,
      accion: 'creo',
      detalles: { titulo: t.titulo },
      createdAt: enDias(inicio - 1),
    }));
    for (const t of creadas) {
      if (t.status === 'por_hacer') continue;
      const quien = t.responsable || admin._id;
      historiales.push({ tarea: t._id, proyecto: proyecto._id, usuario: quien, accion: 'status', detalles: { de: 'por_hacer', para: 'en_curso' }, createdAt: enDias(Math.max(inicio, -16)) });
      if (t.status === 'completada') {
        historiales.push({ tarea: t._id, proyecto: proyecto._id, usuario: quien, accion: 'status', detalles: { de: 'en_curso', para: 'completada' }, createdAt: t.completadaEn });
      }
    }
    await Historial.insertMany(historiales, { timestamps: false });
    totalTareas += creadas.length;
  }

  // Alcance v1 enviado, firmado por Awakelab y aceptado por el cliente (flujo real, e-mail en modo prueba).
  const borrador = await abrirBorrador(admin, proyecto._id);
  await actualizarBorrador(admin, borrador._id, ALCANCE);
  const { linkPrueba } = await enviarParaFirma(admin, borrador._id);
  await firmarPorEmpresa(admin, borrador._id, '127.0.0.1');
  if (linkPrueba) await aceptarPublico(linkPrueba.split('/').pop(), { ip: '203.0.113.10', navegador: 'Seed (ejemplo)' });
  // Ajusta las fechas para que parezca que ocurrió al inicio del proyecto.
  await Acuerdo.updateOne(
    { _id: borrador._id },
    {
      enviadoEn: enDias(-12),
      'firmaEmpresa.en': enDias(-12),
      'firmaCliente.en': enDias(-11),
      firmadoEn: enDias(-11),
      'emails.0.enviadoEn': enDias(-12),
      'emails.1.enviadoEn': enDias(-11),
    }
  );
  await RegistroDiario.deleteMany({ proyecto: proyecto._id, tipo: 'sistema' });
  await RegistroDiario.insertMany([
    { proyecto: proyecto._id, fecha: enDias(-12), tipo: 'sistema', categoria: 'cliente', texto: 'Acuerdo versión 1 enviado a Laura Méndez (laura.mendez@example.com) para que lo firme.' },
    { proyecto: proyecto._id, fecha: enDias(-12), tipo: 'sistema', categoria: 'cliente', texto: 'Admin Taskly firmó el acuerdo versión 1 por Awakelab.' },
    { proyecto: proyecto._id, fecha: enDias(-11), tipo: 'sistema', categoria: 'cliente', texto: 'Laura Méndez (cliente) aceptó el acuerdo versión 1 por e-mail.' },
    { proyecto: proyecto._id, fecha: enDias(-11), tipo: 'sistema', categoria: 'cliente', texto: 'Acuerdo de especificaciones versión 1 firmado por las dos partes.' },
  ]);

  await RegistroDiario.insertMany(
    DIARIO.map(([dia, autor, categoria, iHito, texto]) => ({
      proyecto: proyecto._id,
      fecha: enDias(dia),
      autor: porEmail[autor]._id,
      categoria,
      hito: iHito === null ? undefined : hitos[iHito]._id,
      texto,
      tipo: 'manual',
    }))
  );

  return { proyecto, tareas: totalTareas };
}

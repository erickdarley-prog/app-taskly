// Crea datos FALSOS de prueba. ¡Borra todo lo que haya en la base de datos "taskly"!
// Uso: npm run seed
import mongoose from 'mongoose';
import { conectarBd, desconectarBd } from './config/db.js';
import { Usuario } from './models/Usuario.js';
import { Proyecto } from './models/Proyecto.js';
import { Tarea } from './models/Tarea.js';
import { Historial } from './models/Historial.js';
import { Conversacion } from './models/Conversacion.js';
import { Hito } from './models/Hito.js';
import { Acuerdo } from './models/Acuerdo.js';
import { RegistroDiario } from './models/RegistroDiario.js';
import { crearProyectoAHK } from './seed-ahk.js';
import { Adjunto } from './models/Adjunto.js';
import { crearAdjuntosDeEjemplo, limpiarUploads } from './seed-adjuntos.js';

const DIA = 24 * 60 * 60 * 1000;
const hoy = new Date();
hoy.setHours(12, 0, 0, 0);
const enDias = (n) => new Date(hoy.getTime() + n * DIA);

// Generador pseudoaleatorio fijo, para que el seed genere siempre los mismos datos.
let semilla = 42;
const aleatorio = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
const elegirUno = (lista) => lista[Math.floor(aleatorio() * lista.length)];

const personas = [
  { nombre: 'Admin Taskly', email: 'admin@taskly.local', contrasena: 'admin123', rol: 'admin', funcion: 'Gestor de proyectos' },
  { nombre: 'Ana Souza', email: 'ana@taskly.local', contrasena: '123456', rol: 'equipo', funcion: 'Front-end' },
  { nombre: 'João Lima', email: 'joao@taskly.local', contrasena: '123456', rol: 'equipo', funcion: 'Back-end' },
  { nombre: 'Maria Costa', email: 'maria@taskly.local', contrasena: '123456', rol: 'equipo', funcion: 'Diseño' },
  { nombre: 'Pedro Alves', email: 'pedro@taskly.local', contrasena: '123456', rol: 'equipo', funcion: 'QA / Pruebas' },
  { nombre: 'Carla Mendes', email: 'carla@taskly.local', contrasena: '123456', rol: 'equipo', funcion: 'Contenido' },
];

const proyectosFake = [
  {
    nombre: 'Portal del Alumno',
    cliente: 'Colegio Horizonte',
    descripcion: 'Nuevo portal para que los alumnos accedan a cursos, notas y certificados.',
    status: 'en_curso',
    contactoCliente: { nombre: 'Rafael Torres', email: 'rafael.torres@example.com', cargo: 'Director pedagógico' },
    inicio: -30,
    plazo: 25,
    equipo: ['ana@taskly.local', 'joao@taskly.local', 'maria@taskly.local', 'pedro@taskly.local'],
    tareas: [
      'Definir la arquitectura de la API', 'Modelar la base de datos', 'Crear pantalla de login', 'Diseño de la home',
      'Prototipo en Figma', 'Endpoint de cursos', 'Endpoint de notas', 'Pantalla de certificados',
      'Pruebas de login', 'Pruebas de responsive', 'Integración con e-mail', 'Página de perfil',
      'Iconos e ilustraciones', 'Revisar accesibilidad', 'Despliegue en preproducción',
    ],
  },
  {
    nombre: 'Curso Seguridad en el Trabajo',
    cliente: 'Industria Atlas',
    descripcion: 'Curso e-learning de 20 horas en 4 módulos, con evaluaciones.',
    status: 'en_curso',
    contactoCliente: { nombre: 'Sônia Prado', email: 'sonia.prado@example.com', cargo: 'RH' },
    inicio: -14,
    plazo: 10,
    equipo: ['carla@taskly.local', 'maria@taskly.local', 'ana@taskly.local'],
    tareas: [
      'Guion del módulo 1', 'Guion del módulo 2', 'Guion del módulo 3', 'Guion del módulo 4',
      'Diseño de las diapositivas', 'Grabación de la locución', 'Montaje SCORM', 'Cuestionarios de evaluación',
      'Revisión pedagógica', 'Revisión ortográfica',
    ],
  },
  {
    nombre: 'App de Inventario',
    cliente: 'Logística Rápida',
    descripcion: 'Aplicación interna para el control de stock mediante lectura de códigos de barras.',
    status: 'planificacion',
    contactoCliente: { nombre: 'Marcos Lima', email: 'marcos.lima@example.com', cargo: 'Gerente de operaciones' },
    inicio: 3,
    plazo: 60,
    equipo: ['joao@taskly.local', 'pedro@taskly.local'],
    tareas: ['Toma de requisitos', 'Elegir lector de código de barras', 'Modelo de datos', 'Plan de pruebas'],
  },
];

async function main() {
  await conectarBd();

  await Promise.all([
    Historial.deleteMany({}),
    Tarea.deleteMany({}),
    Proyecto.deleteMany({}),
    Usuario.deleteMany({}),
    Conversacion.deleteMany({}),
    Hito.deleteMany({}),
    Acuerdo.deleteMany({}),
    RegistroDiario.deleteMany({}),
    Adjunto.deleteMany({}),
    limpiarUploads(),
  ]);
  // Colecciones de la versión anterior del proyecto (en portugués), que ya no se usan
  for (const nombre of ['projetos', 'tarefas', 'historicos', 'conversas', 'marcos', 'acordos', 'anexos']) {
    await mongoose.connection.db.dropCollection(nombre).catch(() => {});
  }

  const usuarios = [];
  for (const p of personas) usuarios.push(await Usuario.create(p));
  const porEmail = Object.fromEntries(usuarios.map((u) => [u.email, u]));
  const admin = porEmail['admin@taskly.local'];

  let totalTareas = 0;
  for (const pf of proyectosFake) {
    const integrantes = pf.equipo.map((email) => ({ usuario: porEmail[email]._id, funcion: porEmail[email].funcion }));
    const proyecto = await Proyecto.create({
      nombre: pf.nombre,
      cliente: pf.cliente,
      descripcion: pf.descripcion,
      status: pf.status,
      responsable: admin._id,
      integrantes,
      fechaInicio: enDias(pf.inicio),
      plazo: enDias(pf.plazo),
      responsableCliente: pf.contactoCliente,
    });

    // Divide el proyecto en 3 hitos, con las tareas repartidas entre ellos.
    const duracion = pf.plazo - pf.inicio;
    const fases = ['Planificación', 'Ejecución', 'Entrega y validación'];
    const hitos = await Hito.insertMany(
      fases.map((titulo, i) => ({
        proyecto: proyecto._id,
        titulo,
        orden: i + 1,
        fechaInicio: enDias(pf.inicio + Math.round((duracion * i) / 3)),
        fechaFin: enDias(pf.inicio + Math.round((duracion * (i + 1)) / 3)),
      }))
    );

    const tareas = pf.tareas.map((titulo, i) => {
      const progreso = pf.status === 'planificacion' ? 0 : aleatorio();
      const status = progreso > 0.55 ? 'completada' : progreso > 0.3 ? 'en_curso' : 'por_hacer';
      const horasEstimadas = elegirUno([2, 4, 6, 8, 12, 16]);
      const factor = status === 'completada' ? 0.7 + aleatorio() * 0.6 : status === 'en_curso' ? aleatorio() * 0.8 : 0;
      // Algunas tareas abiertas quedan con el plazo vencido, para que aparezcan como atrasadas.
      const atrasar = pf.status !== 'planificacion' && status !== 'completada' && aleatorio() < 0.3;
      let plazo;
      if (status === 'completada') plazo = enDias(pf.inicio + 3 + i);
      else if (atrasar) plazo = enDias(-1 - Math.floor(aleatorio() * 5));
      else plazo = enDias(Math.max(pf.inicio, 0) + 2 + i * 2);
      return {
        proyecto: proyecto._id,
        titulo,
        hito: hitos[Math.min(2, Math.floor((i * 3) / pf.tareas.length))]._id,
        lado: 'awakelab',
        descripcion: `Tarea de prueba del proyecto ${pf.nombre}.`,
        responsable: integrantes[i % integrantes.length].usuario,
        status,
        prioridad: elegirUno(['baja', 'media', 'media', 'alta']),
        plazo,
        horasEstimadas,
        horasGastadas: Math.round(horasEstimadas * factor * 10) / 10,
        completadaEn: status === 'completada' ? enDias(-Math.floor(aleatorio() * 10)) : undefined,
      };
    });
    const creadas = await Tarea.insertMany(tareas);
    await Historial.insertMany(
      creadas.map((t) => ({
        tarea: t._id,
        proyecto: proyecto._id,
        usuario: admin._id,
        accion: 'creo',
        detalles: { titulo: t.titulo },
        createdAt: enDias(Math.min(pf.inicio, 0)),
      })),
      { timestamps: false }
    );
    totalTareas += creadas.length;
  }

  const ahk = await crearProyectoAHK({ porEmail, admin, enDias });
  totalTareas += ahk.tareas;
  const totalAdjuntos = await crearAdjuntosDeEjemplo(ahk.proyecto, porEmail, enDias);

  console.log(`\nSeed completado: ${usuarios.length} usuarios, ${proyectosFake.length + 1} proyectos, ${totalTareas} tareas.`);
  console.log(`Proyecto de ejemplo completo (hitos, alcance firmado, diario y ${totalAdjuntos} adjuntos): Plataforma AHK\n`);
  console.log('Logins de prueba:');
  for (const p of personas) console.log(`  ${p.rol.padEnd(6)}  ${p.email.padEnd(22)} contraseña: ${p.contrasena}`);
  await desconectarBd();
}

main().catch(async (error) => {
  console.error('Error en el seed:', error.message);
  await desconectarBd();
  process.exit(1);
});

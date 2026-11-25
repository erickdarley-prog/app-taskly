// Cronograma del proyecto: los hitos en una línea de tiempo horizontal (vista rápida).
import { Check } from 'lucide-react';
import { SelloAtrasada, SelloStatusHito } from '../Elementos.jsx';
import { formatearDiaMes } from '../../utils/formatos.js';

export default function Cronograma({ hitos, alElegir }) {
  if (!hitos?.length) return null;
  const completados = hitos.filter((m) => m.status === 'completado').length;
  const total = hitos.reduce((s, m) => s + m.total, 0);
  const hechas = hitos.reduce((s, m) => s + m.completadas, 0);

  return (
    <section className="tarjeta cronograma">
      <header className="cronograma-cabecera">
        <div>
          <p className="etiqueta-seccion">Entregas por hito</p>
          <h2>Cronograma del proyecto</h2>
        </div>
        <p className="texto-suave">
          {completados} de {hitos.length} hitos completados · {hechas}/{total} tareas
        </p>
      </header>
      <ol className="cronograma-linea">
        {hitos.map((m, i) => {
          const siguiente = hitos[i + 1];
          const tramoHecho = m.status === 'completado' && siguiente && siguiente.status !== 'pendiente';
          return (
            <li key={m._id} className={`cronograma-etapa etapa-${m.status}${m.atrasado ? ' etapa-atrasada' : ''}`}>
              <div className="cronograma-marcador">
                <button type="button" className="cronograma-numero" onClick={() => alElegir?.(m._id)} aria-label={`Ver el hito ${m.titulo}`}>
                  {m.status === 'completado' ? <Check size={18} strokeWidth={3} /> : i + 1}
                </button>
                {siguiente && <span className={`cronograma-tramo${tramoHecho ? ' hecho' : ''}`} aria-hidden="true" />}
              </div>
              <h3>{m.titulo}</h3>
              <p className="cronograma-fechas">
                {formatearDiaMes(m.fechaInicio)} → {formatearDiaMes(m.fechaFin)}
              </p>
              <div className="cronograma-sellos">
                <SelloStatusHito status={m.status} />
                {m.atrasado && <SelloAtrasada texto="Vencido" />}
              </div>
              <ul className="cronograma-cuentas">
                <li>
                  {m.completadas}/{m.total} tareas completadas
                </li>
                {m.delCliente > 0 && <li>{m.delCliente} con el cliente</li>}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

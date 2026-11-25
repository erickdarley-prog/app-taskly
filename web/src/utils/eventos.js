import { useEffect, useRef } from 'react';

// Avisa a las pantallas abiertas de que algo cambió (p. ej.: el asistente creó un proyecto).
const EVENTO = 'taskly:datos-modificados';

export function avisarDatosModificados() {
  window.dispatchEvent(new Event(EVENTO));
}

export function useAlModificarDatos(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const escuchar = () => ref.current?.();
    window.addEventListener(EVENTO, escuchar);
    return () => window.removeEventListener(EVENTO, escuchar);
  }, []);
}

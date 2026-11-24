import { useEffect, useRef } from 'react';

// Avisa as telas abertas que algo mudou (ex.: o assistente criou um projeto).
const EVENTO = 'taskly:dados-alterados';

export function avisarDadosAlterados() {
  window.dispatchEvent(new Event(EVENTO));
}

export function useAoAlterarDados(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const ouvir = () => ref.current?.();
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);
}

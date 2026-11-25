// Página que abre el CLIENTE desde el enlace del e-mail (sin login) para aceptar el acuerdo.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/cliente.js';
import { Logo } from '../components/Layout.jsx';
import { formatearFechaHora } from '../utils/formatos.js';

export default function AcuerdoPublico() {
  const { token } = useParams();
  const [acuerdo, setAcuerdo] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [consciente, setConsciente] = useState(false);

  useEffect(() => {
    api.get(`/publico/acuerdos/${token}`).then(setAcuerdo).catch(setError);
  }, [token]);

  const aceptar = async () => {
    setEnviando(true);
    setError(null);
    try {
      setAcuerdo(await api.post(`/publico/acuerdos/${token}/aceptar`));
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  };

  const jaAcepto = Boolean(acuerdo?.firmadoPorCliente);

  return (
    <div className="publico-pagina">
      <div className="publico-caja">
        <div className="publico-cabecera">
          <Logo />
        </div>

        {error && !acuerdo && (
          <div className="publico-cuerpo">
            <h1>Enlace no disponible</h1>
            <p>{error.message}</p>
          </div>
        )}

        {!acuerdo && !error && <p className="publico-cuerpo texto-suave">Cargando…</p>}

        {acuerdo && (
          <div className="publico-cuerpo">
            <p className="texto-suave">Acuerdo de especificaciones · versión {acuerdo.version}</p>
            <h1>{acuerdo.proyecto}</h1>
            {acuerdo.cliente && <p className="texto-suave">{acuerdo.cliente}</p>}
            {acuerdo.destinatario && <p>Hola, {acuerdo.destinatario}. Revisa abajo lo que está y lo que no está incluido en el proyecto.</p>}

            <div className="alcance-columnas">
              <section className="alcance-lista alcance-incluido">
                <h3>
                  <span aria-hidden="true">✓</span> Entra en el proyecto
                </h3>
                <ul>
                  {acuerdo.incluidos.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
                {acuerdo.incluidos.length === 0 && <p className="texto-suave">Ningún elemento.</p>}
              </section>
              <section className="alcance-lista alcance-no-incluido">
                <h3>
                  <span aria-hidden="true">✕</span> No entra en el proyecto
                </h3>
                <ul>
                  {acuerdo.noIncluidos.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
                {acuerdo.noIncluidos.length === 0 && <p className="texto-suave">Ningún elemento.</p>}
              </section>
            </div>
            {acuerdo.observaciones && (
              <>
                <h3>Observaciones</h3>
                <p className="descripcion">{acuerdo.observaciones}</p>
              </>
            )}

            {error && <div className="alerta alerta-error">{error.message}</div>}

            {jaAcepto ? (
              <div className="alerta alerta-ok publico-resultado">
                <strong>✓ Aceptación registrada el {formatearFechaHora(acuerdo.firmadoPorCliente)}.</strong>
                <br />
                {acuerdo.status === 'firmado'
                  ? 'El acuerdo está firmado por las dos partes.'
                  : `Falta la firma de ${acuerdo.responsableEmpresa || 'Awakelab'}.`}{' '}
                También recibirás una confirmación por e-mail.
              </div>
            ) : acuerdo.status === 'esperando' ? (
              <div className="publico-accion">
                <label className="checkbox">
                  <input type="checkbox" checked={consciente} onChange={(e) => setConsciente(e.target.checked)} />
                  He leído y estoy de acuerdo con lo que está y lo que no está incluido en este proyecto.
                </label>
                <button type="button" className="boton boton-ancho" disabled={!consciente || enviando} onClick={aceptar}>
                  {enviando ? 'Registrando…' : 'Acepto el acuerdo'}
                </button>
                <p className="texto-suave">
                  ¿No estás de acuerdo con algún punto? Responde al e-mail que recibiste. Responsable en Awakelab: {acuerdo.responsableEmpresa}.
                </p>
              </div>
            ) : (
              <div className="alerta alerta-aviso">
                {acuerdo.status === 'firmado' ? 'Este acuerdo ya está firmado.' : 'Esta versión del acuerdo ya no está disponible para firmar.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Alcance del proyecto (lo que entra / lo que no entra) y el acuerdo firmado por las dos partes.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/cliente.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { MensajeError, Modal, SelloStatusAcuerdo } from '../Elementos.jsx';
import { formatearFechaHora } from '../../utils/formatos.js';

function ListaEditable({ titulo, tipo, items, alCambiar, editable }) {
  const [nuevo, setNuevo] = useState('');
  const anadir = (e) => {
    e.preventDefault();
    const texto = nuevo.trim();
    if (!texto) return;
    alCambiar([...items, texto]);
    setNuevo('');
  };
  return (
    <section className={`alcance-lista alcance-${tipo}`}>
      <h3>
        <span aria-hidden="true">{tipo === 'incluido' ? '✓' : '✕'}</span> {titulo}
        <span className="contador">{items.length}</span>
      </h3>
      {items.length === 0 && <p className="texto-suave">Ningún elemento.</p>}
      <ul>
        {items.map((texto, i) => (
          <li key={`${i}-${texto}`}>
            <span>{texto}</span>
            {editable && (
              <button type="button" className="boton-icono" aria-label={`Quitar "${texto}"`} onClick={() => alCambiar(items.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form className="alcance-anadir" onSubmit={anadir}>
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder={tipo === 'incluido' ? 'P. ej.: Dashboard administrativo para el SEPE' : 'P. ej.: Compra del dominio'}
            maxLength={500}
            aria-label={`Nuevo elemento en ${titulo}`}
          />
          <button type="submit" className="boton boton-secundario">
            Añadir
          </button>
        </form>
      )}
    </section>
  );
}

function Firmas({ acuerdo }) {
  const e = acuerdo.firmaEmpresa;
  const c = acuerdo.firmaCliente;
  return (
    <div className="firmas">
      <div className={`firma${e?.fecha ? ' hecha' : ''}`}>
        <span className="firma-rotulo">Awakelab</span>
        {e?.fecha ? (
          <>
            <strong>✓ {e.nombre}</strong>
            <small>firmó el {formatearFechaHora(e.fecha)}</small>
          </>
        ) : (
          <small>Pendiente de la firma del responsable</small>
        )}
      </div>
      <div className={`firma${c?.fecha ? ' hecha' : ''}`}>
        <span className="firma-rotulo">Cliente</span>
        {c?.fecha ? (
          <>
            <strong>✓ {c.nombre || c.email}</strong>
            <small>aceptó por e-mail el {formatearFechaHora(c.fecha)}</small>
          </>
        ) : (
          <small>
            {acuerdo.cliente?.email ? `Pendiente ${acuerdo.cliente.nombre || acuerdo.cliente.email} hacer clic en "Acepto" en el e-mail` : 'Aún no enviado'}
          </small>
        )}
      </div>
    </div>
  );
}

function Comprobante({ id, alCerrar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!id) return;
    setDatos(null);
    api.get(`/acuerdos/${id}/comprobante`).then(setDatos).catch(setError);
  }, [id]);

  return (
    <Modal titulo={datos ? `Comprobante – versión ${datos.version}` : 'Comprobante'} abierto={Boolean(id)} alCerrar={alCerrar} anchura={760}>
      <MensajeError error={error} />
      {!datos && !error && <p className="texto-suave">Cargando…</p>}
      {datos && (
        <div className="comprobante">
          <dl className="lista-datos">
            <div>
              <dt>Proyecto</dt>
              <dd>{datos.proyecto?.nombre}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <SelloStatusAcuerdo status={datos.status} />
              </dd>
            </div>
            <div>
              <dt>Enviado por</dt>
              <dd>{datos.enviadoPor?.nombre || '—'}</dd>
            </div>
            <div>
              <dt>Enviado el</dt>
              <dd>{formatearFechaHora(datos.enviadoEn)}</dd>
            </div>
          </dl>
          <Firmas acuerdo={datos} />
          {datos.firmaCliente?.fecha && (
            <p className="texto-suave">
              Registro de la aceptación del cliente: IP {datos.firmaCliente.ip || '—'} · {datos.firmaCliente.navegador || '—'}
            </p>
          )}
          <h3>E-mails adjuntos</h3>
          {datos.emails.length === 0 && <p className="texto-suave">Ningún e-mail.</p>}
          {datos.emails.map((e, i) => (
            <details key={i} className="email-adjunto" open={i === datos.emails.length - 1}>
              <summary>
                <strong>{e.tipo === 'pedido' ? 'Solicitud de aceptación' : 'Confirmación de aceptación'}</strong> · {formatearFechaHora(e.enviadoEn)}
                {e.modo === 'prueba' && <span className="sello sello-acuerdo-borrador">modo prueba</span>}
              </summary>
              <p className="texto-suave">
                De: {e.de}
                <br />
                Para: {e.para.join(', ')}
                <br />
                Asunto: {e.asunto}
              </p>
              <iframe title={`E-mail ${i + 1}`} sandbox="" srcDoc={e.html} className="email-previa" />
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function AlcanceAcuerdo({ proyecto, version, alCambiar }) {
  const { usuario, esAdmin } = useAuth();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [edicion, setEdicion] = useState(null); // { incluidos: [], naoIncluidos: [], observacoes }
  const [modificado, setModificado] = useState(false);
  const [aviso, setAviso] = useState(null); // { modo, linkTeste }
  const [comprobante, setComprobante] = useState(null);

  const cargar = useCallback(() => {
    api
      .get(`/proyectos/${proyecto._id}/acuerdos`)
      .then((d) => {
        setDatos(d);
        const r = d.enCurso?.status === 'borrador' ? d.enCurso : null;
        setEdicion(r ? { incluidos: r.incluidos.map((i) => i.texto), noIncluidos: r.noIncluidos.map((i) => i.texto), observaciones: r.observaciones || '' } : null);
        setModificado(false);
      })
      .catch(setError);
  }, [proyecto._id]);

  useEffect(cargar, [cargar, version]);

  const ejecutar = async (fn) => {
    setError(null);
    setOcupado(true);
    try {
      const r = await fn();
      cargar();
      alCambiar?.();
      return r;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const abrirBorrador = () => ejecutar(() => api.post(`/proyectos/${proyecto._id}/acuerdos/borrador`));
  const guardar = () => ejecutar(() => api.patch(`/acuerdos/${datos.enCurso._id}`, edicion));
  const enviar = async () => {
    const rc = proyecto.responsableCliente;
    if (!rc?.email) {
      setError(new Error('Registra el e-mail del responsable del cliente en "Editar proyecto" antes de enviarlo.'));
      return;
    }
    if (!window.confirm(`¿Enviar la versión ${datos.enCurso.version} del acuerdo a ${rc.nombre || rc.email} (${rc.email})?`)) return;
    const r = await ejecutar(async () => {
      if (modificado) await api.patch(`/acuerdos/${datos.enCurso._id}`, edicion);
      return api.post(`/acuerdos/${datos.enCurso._id}/enviar`);
    });
    if (r) setAviso({ modo: r.modoEmail, linkPrueba: r.linkPrueba });
  };
  const firmar = () => {
    if (!window.confirm('¿Confirmar tu firma por Awakelab en este acuerdo?')) return;
    ejecutar(() => api.post(`/acuerdos/${datos.enCurso._id}/firmar`));
  };
  const cancelar = () => {
    if (!window.confirm('¿Cancelar esta versión? El enlace enviado al cliente dejará de funcionar.')) return;
    setAviso(null);
    ejecutar(() => api.post(`/acuerdos/${datos.enCurso._id}/cancelar`));
  };

  if (!datos) return error ? <MensajeError error={error} /> : <p className="texto-suave">Cargando alcance…</p>;

  const actual = datos.enCurso || datos.vigente;
  const esResponsable = String(datos.responsableEmpresa?._id) === String(usuario?._id);
  const enEdicion = Boolean(edicion) && esAdmin;
  const listas = edicion || {
    incluidos: actual?.incluidos.map((i) => i.texto) || [],
    noIncluidos: actual?.noIncluidos.map((i) => i.texto) || [],
    observaciones: actual?.observaciones || '',
  };
  const cambiarLista = (campo) => (items) => {
    setEdicion((e) => ({ ...e, [campo]: items }));
    setModificado(true);
  };
  const rc = datos.responsableCliente;

  return (
    <div className="alcance">
      <div className="partes">
        <div>
          <span className="firma-rotulo">Responsable Awakelab</span>
          <strong>{datos.responsableEmpresa?.nombre || '—'}</strong>
        </div>
        <div>
          <span className="firma-rotulo">Responsable del cliente</span>
          <strong>{rc?.nombre || '—'}</strong>
          <small>{rc?.email || 'sin e-mail registrado'}</small>
        </div>
      </div>

      <MensajeError error={error} />

      {aviso && (
        <div className={`alerta ${aviso.modo === 'prueba' ? 'alerta-aviso' : 'alerta-ok'}`}>
          {aviso.modo === 'prueba' ? (
            <>
              <strong>Modo prueba:</strong> el e-mail se generó y se adjuntó, pero no se envió de verdad (configura tu e-mail en "Mi cuenta").{' '}
              <a href={aviso.linkPrueba} target="_blank" rel="noreferrer">
                Abrir la página del cliente
              </a>{' '}
              para simular el clic en "Acepto".
            </>
          ) : (
            <>E-mail enviado a {rc?.email}. Cuando el cliente haga clic en "Acepto", la firma aparecerá aquí.</>
          )}
        </div>
      )}

      {!actual && (
        <div className="estado-vacio">
          Aún no hay alcance definido para este proyecto.
          {esAdmin && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="boton" onClick={abrirBorrador} disabled={ocupado}>
                Definir el alcance
              </button>
            </div>
          )}
        </div>
      )}

      {actual && (
        <section className="alcance-version">
          <header className="alcance-cabecera">
            <div className="titulo-linea">
              <h2>Versión {actual.version}</h2>
              <SelloStatusAcuerdo status={actual.status} />
              {actual.status === 'firmado' && <span className="texto-suave">vigente desde {formatearFechaHora(actual.firmadoEn)}</span>}
            </div>
            <div className="grupo-botones">
              {actual.status === 'borrador' && esAdmin && (
                <>
                  <button type="button" className="boton boton-secundario" onClick={guardar} disabled={ocupado || !modificado}>
                    {modificado ? 'Guardar borrador' : 'Guardado'}
                  </button>
                  <button type="button" className="boton" onClick={enviar} disabled={ocupado}>
                    Enviar a firma
                  </button>
                </>
              )}
              {actual.status === 'esperando' && esResponsable && !actual.firmaEmpresa?.fecha && (
                <button type="button" className="boton" onClick={firmar} disabled={ocupado}>
                  Firmar por Awakelab
                </button>
              )}
              {actual.status === 'esperando' && esAdmin && (
                <button type="button" className="boton boton-peligro-fantasma" onClick={cancelar} disabled={ocupado}>
                  Cancelar envío
                </button>
              )}
              {actual.status === 'firmado' && esAdmin && (
                <button type="button" className="boton boton-secundario" onClick={abrirBorrador} disabled={ocupado}>
                  Modificar alcance (nueva versión)
                </button>
              )}
            </div>
          </header>

          {actual.status === 'borrador' && (
            <p className="nota">
              Borrador: modifica las listas y haz clic en <strong>Enviar a firma</strong>. El cliente recibe un e-mail con el botón "Acepto", y el
              responsable de Awakelab firma aquí. Cualquier cambio posterior genera una nueva versión.
            </p>
          )}
          {actual.status === 'esperando' && <Firmas acuerdo={actual} />}
          {actual.status === 'esperando' && !esResponsable && !actual.firmaEmpresa?.fecha && (
            <p className="texto-suave">Solo {datos.responsableEmpresa?.nombre} (responsable del proyecto) puede firmar por Awakelab.</p>
          )}

          <div className="alcance-columnas">
            <ListaEditable titulo="Entra en el proyecto" tipo="incluido" items={listas.incluidos} editable={enEdicion} alCambiar={cambiarLista('incluidos')} />
            <ListaEditable titulo="No entra en el proyecto" tipo="no-incluido" items={listas.noIncluidos} editable={enEdicion} alCambiar={cambiarLista('noIncluidos')} />
          </div>

          {(enEdicion || listas.observaciones) && (
            <label className="campo">
              <span className="campo-rotulo">Observaciones del acuerdo</span>
              {enEdicion ? (
                <textarea
                  rows={3}
                  value={listas.observaciones}
                  maxLength={3000}
                  onChange={(e) => {
                    setEdicion((ed) => ({ ...ed, observaciones: e.target.value }));
                    setModificado(true);
                  }}
                />
              ) : (
                <p className="descripcion">{listas.observaciones}</p>
              )}
            </label>
          )}

          {actual.status === 'firmado' && <Firmas acuerdo={actual} />}
        </section>
      )}

      {datos.versiones.length > 0 && (
        <>
          <h2 className="subtitulo">Historial de versiones</h2>
          <div className="tabla-desplazamiento">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th>Elementos</th>
                  <th>Enviado</th>
                  <th>Awakelab</th>
                  <th>Cliente</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.versiones.map((v) => (
                  <tr key={v._id}>
                    <td>v{v.version}</td>
                    <td>
                      <SelloStatusAcuerdo status={v.status} />
                    </td>
                    <td>
                      {v.incluidos.length} entran · {v.noIncluidos.length} no entran
                    </td>
                    <td>{v.enviadoEn ? formatearFechaHora(v.enviadoEn) : '—'}</td>
                    <td>{v.firmaEmpresa?.fecha ? `✓ ${formatearFechaHora(v.firmaEmpresa.fecha)}` : '—'}</td>
                    <td>{v.firmaCliente?.fecha ? `✓ ${formatearFechaHora(v.firmaCliente.fecha)}` : '—'}</td>
                    <td>
                      {v.enviadoEn && (
                        <button type="button" className="boton boton-fantasma" onClick={() => setComprobante(v._id)}>
                          Comprobante
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Comprobante id={comprobante} alCerrar={() => setComprobante(null)} />
    </div>
  );
}

import { ArrowLeft, CalendarClock, Clock, History, Pencil, Printer, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { VistaFoto } from '../componentes/campos/basicos';
import { Boton, Cargando, ChipEstadoRegistro, cx, IconoFormato, MensajeError, Panel, SEVERIDAD, TONO_ESTADO, useAvisar, Vacio } from '../componentes/ui';
import { formato } from '../formatos';
import { useCierre, useEliminarRegistro, useHistorial, useOperarios, useProductos, useRegistro } from '../datos/hooks';
import type { Registro } from '../datos/repositorio';
import { fechaLimite, pendientesDeRegistro, puedeCompletar } from '../lib/dia-siguiente';
import { fechaCorta, fechaLarga, horaLegible, hoyPanama, momentoLegible } from '../lib/fechas';
import { textoCampo } from '../lib/mostrar';
import { camposVisibles, dentroDeVentana, estadoCampo, etapasVisibles, fmt, limitePeso, resumenMuestras } from '../motor/evaluar';
import type { CampoChecklist, CampoMuestras, Contexto, DefinicionFormato, FilaMuestras } from '../motor/tipos';
import type { ValorChecklist } from '../motor/materializar';
import { puedeEditar } from './Captura';

export function DetalleRegistro() {
  const { id } = useParams();
  const { data: registro, isLoading, error } = useRegistro(id);
  if (isLoading) return <Cargando />;
  if (error) return <MensajeError error={error} />;
  if (!registro) return <Vacio titulo="Este registro no existe" accion={<Link to="/historial" className="font-bold text-vino underline">Ir al historial</Link>} />;
  const def = formato(registro.formato);
  if (!def) return <Vacio titulo={`Formato desconocido: ${registro.formato}`} />;
  return <Detalle registro={registro} def={def} />;
}

function Detalle({ registro, def }: { registro: Registro; def: DefinicionFormato }) {
  const { usuario } = useSesion();
  const productos = useProductos();
  const operarios = useOperarios();
  const historial = useHistorial(registro.id);
  const cierre = useCierre(registro.fecha);
  const eliminar = useEliminarRegistro();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const producto = productos.data?.find((p) => p.id === registro.productoId);
  const ctx: Contexto = {
    valores: registro.datos, producto, productos: productos.data, operarios: operarios.data, fecha: registro.fecha, area: registro.area,
  };
  const reales = registro.desviaciones.filter((d) => d.severidad !== 'por-confirmar');
  const pendientes = pendientesDeRegistro(registro, productos.data);
  const enPlazo = dentroDeVentana(registro.fecha, hoyPanama());
  // pasado el plazo, lo que no se llenó ya no está "pendiente": queda sin registrar
  const pendiente = new Set(enPlazo ? pendientes.map((f) => f.campoId) : []);
  const completable = pendientes.length > 0 && puedeCompletar(registro, usuario);

  const borrar = async () => {
    if (!window.confirm('¿Eliminar este registro? Queda guardado en el historial de cambios, pero deja de aparecer en el sistema.')) return;
    await eliminar.mutateAsync(registro.id);
    avisar('Registro eliminado');
    navegar('/historial');
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="no-imprimir flex flex-wrap items-center gap-3">
        <Link to="/historial" className="inline-flex items-center gap-1.5 font-bold text-tinta-suave hover:text-vino">
          <ArrowLeft size={18} aria-hidden /> Historial
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          {cierre.data && <span className="h-12 px-4 rounded-campo bg-tinta text-white font-bold flex items-center">Día cerrado</span>}
          {completable && (
            <Link to={`/registro/${registro.id}/completar`}><Boton variante="primario" icono={CalendarClock}>Completar datos del día siguiente</Boton></Link>
          )}
          {puedeEditar(registro, usuario, !!cierre.data) && (
            <Link to={`/registro/${registro.id}/editar`}><Boton variante="vino" icono={Pencil}>Editar</Boton></Link>
          )}
          <Boton icono={Printer} onClick={() => window.print()}>Imprimir</Boton>
          {usuario.rol === 'admin' && <Boton variante="peligro" icono={Trash2} onClick={borrar} cargando={eliminar.isPending}>Eliminar</Boton>}
        </div>
      </div>

      {pendientes.length > 0 && (
        <section className="no-imprimir rounded-panel border-2 border-linea bg-white px-5 py-4 flex flex-wrap items-center gap-4">
          <span className="size-12 rounded-full bg-dorado-claro text-vino-oscuro grid place-items-center shrink-0"><Clock size={22} aria-hidden /></span>
          <div className="flex-1 min-w-60">
            <p className="text-lg font-bold">
              {pendientes.length === 1 ? 'Falta 1 dato del día siguiente' : `Faltan ${pendientes.length} datos del día siguiente`}
            </p>
            <p className="text-tinta-suave">
              {pendientes.map((f) => f.etiqueta).join(', ')}.{' '}
              {completable
                ? `Se pueden completar hasta el ${fechaCorta(fechaLimite(registro.fecha))}, aunque el día esté cerrado.`
                : enPlazo
                  ? `Los completa quien hizo el registro (${registro.realizadoPor || 'Calidad'}) o un administrador, hasta el ${fechaCorta(fechaLimite(registro.fecha))}.`
                  : 'Ya pasó el plazo para completarlos: solo un administrador puede corregir el registro.'}
            </p>
          </div>
        </section>
      )}

      <article className="hoja-impresion rounded-panel bg-white border border-linea p-6 lg:p-8 flex flex-col gap-6">
        <header className="flex flex-wrap items-start gap-5 border-b border-linea pb-5">
          <img src="logo.png" alt="Teque Chévere" className="size-16 hidden print:block" />
          <div className="size-16 shrink-0 rounded-2xl bg-vino text-dorado grid place-items-center print:hidden">
            {def.rotulo ? <span className="font-display text-2xl font-extrabold">{def.rotulo}</span> : <IconoFormato nombre={def.icono} size={30} />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl lg:text-3xl font-extrabold leading-tight">{def.nombre}</h1>
            <p className="text-tinta-suave mt-1 first-letter:uppercase">
              {fechaLarga(registro.fecha)}{registro.hora ? `, ${horaLegible(registro.hora)}` : ''}
              {def.codigoSQF ? `. ${def.codigoSQF}` : ''}
            </p>
          </div>
          <ChipEstadoRegistro desviaciones={reales.length} pcc={registro.tieneDesviacionPcc} />
        </header>

        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {producto && <Dato etiqueta="Producto" valor={`${producto.codigo ? `${producto.codigo} ` : ''}${producto.nombre}`} />}
          {registro.area && <Dato etiqueta="Área" valor={registro.area} />}
          {registro.lote && <Dato etiqueta="Lote" valor={registro.lote} />}
          <Dato etiqueta="Realizado por" valor={registro.realizadoPor || '—'} />
          <Dato etiqueta="Guardado" valor={`${momentoLegible(registro.creadoEn)}${registro.origen === 'importado' ? ' (importado del Excel)' : ''}`} />
          {registro.actualizadoEn && <Dato etiqueta="Última edición" valor={momentoLegible(registro.actualizadoEn)} />}
        </dl>

        {(reales.length > 0 || registro.accionCorrectiva) && (
          <section className="rounded-campo border-2 border-fuera/50 bg-fuera-claro/30 p-4 flex flex-col gap-3">
            <h2 className="text-lg font-bold">Desviaciones y acción correctiva</h2>
            {reales.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {reales.map((d, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className={cx('rounded px-2 py-0.5 text-xs font-bold', SEVERIDAD[d.severidad].clase)}>{d.pcc ?? 'No conforme'}</span>
                    <strong>{d.etiqueta}</strong> {d.valor} <span className="text-tinta-suave text-sm">esperado {d.esperado}</span>
                  </li>
                ))}
              </ul>
            )}
            <p><strong>Acción correctiva:</strong> {registro.accionCorrectiva || <span className="text-fuera">sin registrar</span>}</p>
          </section>
        )}

        {etapasVisibles(def, ctx).map((etapa) => (
          <section key={etapa.id} className="break-inside-avoid">
            <h2 className="text-lg font-bold mb-2">{etapa.titulo}</h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
              {camposVisibles(etapa, ctx).map((c) => {
                if (c.tipo === 'checklist') return <TablaChecklist key={c.id} campo={c} valor={registro.datos[c.id] as ValorChecklist} ctx={ctx} />;
                if (c.tipo === 'muestras') return <TablaMuestras key={c.id} campo={c} filas={(registro.datos[c.id] ?? []) as FilaMuestras[]} ctx={ctx} />;
                if (c.tipo === 'foto') {
                  const ruta = registro.datos[c.id];
                  return typeof ruta === 'string' && ruta
                    ? <div key={c.id} className="py-2"><VistaFoto ruta={ruta} className="max-h-72 rounded-xl border border-linea" /></div>
                    : null;
                }
                const estado = estadoCampo(c, ctx);
                return (
                  <div key={c.id} className="flex items-baseline justify-between gap-3 border-b border-linea/70 py-2">
                    <span className="text-tinta-suave">
                      {c.etiqueta}{c.pcc && <span className="ml-1.5 rounded bg-vino px-1 text-[11px] font-bold text-white">{c.pcc}</span>}
                    </span>
                    <span className={cx('font-bold text-right cifra', estado === 'fuera' ? 'text-fuera' : estado === 'alerta' ? 'text-confirmar' : '')}>
                      {textoCampo(c, ctx) || (pendiente.has(c.id)
                        ? <span className="text-tinta-suave font-normal italic">pendiente</span>
                        : <span className="text-linea font-normal">—</span>)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {registro.observaciones && <p><strong>Observaciones:</strong> {registro.observaciones}</p>}

        <footer className="hidden print:grid grid-cols-2 gap-10 pt-10 text-sm">
          <div className="border-t border-tinta pt-1">Realizado por: {registro.realizadoPor}</div>
          <div className="border-t border-tinta pt-1">Verificado por (Coordinador de Calidad)</div>
        </footer>
      </article>

      <Panel titulo={<span className="flex items-center gap-2"><History size={20} aria-hidden /> Historial de cambios</span>} className="no-imprimir">
        <div className="px-5 pb-5 pt-2">
          {historial.data?.length ? (
            <ul className="flex flex-col gap-2">
              {historial.data.map((h) => (
                <li key={h.id} className="text-sm">
                  <strong>{h.accion === 'DELETE' ? 'Eliminado' : 'Editado'}</strong> por {h.usuario ?? 'sistema'}, {momentoLegible(h.en)}
                  {h.despues && <span className="text-tinta-suave">. Cambió: {camposCambiados(h.antes.datos ?? {}, h.despues.datos ?? {}, def).join(', ') || 'datos generales'}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-tinta-suave">Sin cambios desde que se guardó.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function camposCambiados(antes: Record<string, unknown>, despues: Record<string, unknown>, def: DefinicionFormato): string[] {
  const nombres = new Map(def.etapas.flatMap((e) => e.campos.map((c) => [c.id, c.etiqueta] as const)));
  const ids = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  return [...ids].filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k])).map((k) => nombres.get(k) ?? k);
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-sm text-tinta-suave">{etiqueta}</dt>
      <dd className="font-bold">{valor}</dd>
    </div>
  );
}

function TablaChecklist({ campo, valor, ctx }: { campo: CampoChecklist; valor?: ValorChecklist; ctx: Contexto }) {
  const columnas = campo.columnas.filter((c) => !c.aplica || c.aplica(ctx));
  const filas = Object.entries(valor ?? {});
  const nombre = (id: string) => ctx.operarios?.find((o) => o.id === id)?.nombre ?? 'Operario retirado';
  return (
    <div className="col-span-full overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr>
            <th className="text-left p-2">Operario</th>
            {columnas.map((c) => <th key={c.id} className="p-2 text-xs font-bold align-bottom max-w-24">{c.etiqueta}</th>)}
            <th className="text-left p-2">Observación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([id, fila]) => (
            <tr key={id} className="border-t border-linea">
              <td className="p-2 font-bold whitespace-nowrap">{nombre(id)}</td>
              {fila._ausente ? (
                <td colSpan={columnas.length} className="p-2 text-tinta-suave italic">No asistió, no se incluye en el monitoreo del día</td>
              ) : columnas.map((c) => {
                const e = campo.estados.find((x) => x.id === fila[c.id]);
                return (
                  <td key={c.id} className={cx('p-2 text-center font-bold', e?.tono === 'fuera' ? 'bg-fuera-claro text-fuera' : e?.tono === 'ok' ? 'text-ok' : 'text-tinta-suave')}>
                    {e?.corta ?? '—'}
                  </td>
                );
              })}
              <td className="p-2 text-tinta-suave">{fila._obs ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaMuestras({ campo, filas, ctx }: { campo: CampoMuestras; filas: FilaMuestras[]; ctx: Contexto }) {
  return (
    <div className="col-span-full overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr className="text-left">
            <th className="p-2">Operador</th>
            <th className="p-2">Producto</th>
            {Array.from({ length: campo.nMuestras }, (_, i) => <th key={i} className="p-2 text-center">M{i + 1}</th>)}
            <th className="p-2 text-center">Promedio</th>
            <th className="p-2 text-center">Apariencia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const lim = limitePeso(f.productoId, ctx);
            const r = resumenMuestras(f.muestras, lim);
            return (
              <tr key={i} className="border-t border-linea">
                <td className="p-2 font-bold whitespace-nowrap">{ctx.operarios?.find((o) => o.id === f.operarioId)?.nombre ?? '—'}</td>
                <td className="p-2 whitespace-nowrap">{ctx.productos?.find((p) => p.id === f.productoId)?.nombre ?? '—'}</td>
                {f.muestras.map((m, k) => {
                  const fuera = m !== null && lim && ((lim.min !== undefined && m < lim.min) || (lim.max !== undefined && m > lim.max));
                  return <td key={k} className={cx('p-2 text-center cifra', fuera && 'bg-fuera-claro text-fuera font-bold')}>{m ?? ''}</td>;
                })}
                <td className="p-2 text-center font-bold cifra">{fmt(r.promedio, 1)}</td>
                <td className={cx('p-2 text-center font-bold', f.apariencia === 'NC' ? TONO_ESTADO.fuera.texto : 'text-ok')}>{f.apariencia === 'NC' ? 'No cumple' : f.apariencia === 'C' ? 'Cumple' : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

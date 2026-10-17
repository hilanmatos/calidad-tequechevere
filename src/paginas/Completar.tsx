import { ArrowLeft, CalendarClock, Check, ChevronLeft, ChevronRight, Clock, Lock, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { Campo } from '../componentes/campos/Campo';
import { TarjetaCampo } from '../componentes/campos/TarjetaCampo';
import { Boton, Cargando, cx, IconoFormato, MensajeError, SEVERIDAD, useAvisar, Vacio } from '../componentes/ui';
import { formato } from '../formatos';
import { useCompletarRegistro, useOperarios, useProductos, useRegistro } from '../datos/hooks';
import type { Registro } from '../datos/repositorio';
import { fechaLimite, puedeCompletar } from '../lib/dia-siguiente';
import { fechaCorta, fechaLarga, hoyPanama } from '../lib/fechas';
import { textoCampo } from '../lib/mostrar';
import {
  camposVisibles, dentroDeVentana, desviaciones, esDiferido, estadoCampo, etapasVisibles, hayPcc, pendientesDiferidos,
} from '../motor/evaluar';
import { materializar, valoresEfectivos } from '../motor/materializar';
import type { Campo as TCampo, Contexto, DefinicionFormato, Operario, Producto, Valores } from '../motor/tipos';

const PASO_RESUMEN = '__resumen';
const SIN_CAPTURA = new Set<TCampo['tipo']>(['calculado', 'foto', 'checklist', 'muestras']);

/**
 * Campos del día siguiente que estaban vacíos al abrir: los únicos que esta vía puede llenar.
 * `llenables` incluye los calculados (cambian al completar); `editables`, solo los que se escriben.
 */
function camposPorLlenar(def: DefinicionFormato, ctx: Contexto) {
  const llenables = new Set<string>();
  const editables = new Set<string>();
  for (const etapa of etapasVisibles(def, ctx)) {
    for (const campo of camposVisibles(etapa, ctx)) {
      if (!esDiferido(campo, etapa) || ctx.valores[campo.id] != null) continue;
      llenables.add(campo.id);
      if (!SIN_CAPTURA.has(campo.tipo)) editables.add(campo.id);
    }
  }
  return { llenables, editables };
}

/** Completa los datos del día siguiente de un registro guardado, aunque el día esté cerrado. */
export function Completar() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const consulta = useRegistro(id);
  const productos = useProductos();
  const operarios = useOperarios();
  if (consulta.isLoading || productos.isLoading || operarios.isLoading) return <Cargando />;
  if (consulta.error) return <MensajeError error={consulta.error} />;
  const registro = consulta.data;
  const def = registro ? formato(registro.formato) : undefined;
  if (!registro || !def) {
    return <Vacio titulo="Este registro no existe" accion={<Link className="font-bold text-vino underline" to="/">Volver a Hoy</Link>} />;
  }
  if (!puedeCompletar(registro, usuario)) {
    return (
      <Vacio titulo="Este registro ya no se puede completar" accion={<Link className="font-bold text-vino underline" to={`/registro/${registro.id}`}>Ver el registro</Link>}>
        {dentroDeVentana(registro.fecha, hoyPanama())
          ? 'Solo quien hizo el registro o un administrador puede completar sus datos del día siguiente.'
          : `Los datos del día siguiente se podían completar hasta el ${fechaCorta(fechaLimite(registro.fecha))}. Para corregir el registro, pide el cambio al administrador.`}
      </Vacio>
    );
  }
  return <AsistenteCompletar key={registro.id} def={def} registro={registro} productos={productos.data ?? []} operarios={operarios.data ?? []} />;
}

function AsistenteCompletar({ def, registro, productos, operarios }: {
  def: DefinicionFormato; registro: Registro; productos: Producto[]; operarios: Operario[];
}) {
  const completar = useCompletarRegistro();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const producto = productos.find((p) => p.id === registro.productoId);
  const [valores, setValores] = useState<Valores>(registro.datos);
  const [agregado, setAgregado] = useState('');
  const [paso, setPaso] = useState(0);

  const guardado: Contexto = useMemo(
    () => ({ valores: registro.datos, producto, productos, operarios, fecha: registro.fecha, area: registro.area }),
    [registro, producto, productos, operarios],
  );
  const { llenables, editables } = useMemo(() => camposPorLlenar(def, guardado), [def, guardado]);
  const ctx: Contexto = useMemo(() => {
    const base = { ...guardado, valores };
    return { ...base, valores: valoresEfectivos(def, base) };
  }, [guardado, valores, def]);

  // Lo que se envía: lo guardado tal cual, más los campos del día siguiente que estaban vacíos y ahora tienen valor.
  const datos = useMemo(() => {
    const m = materializar(def, ctx);
    const res: Valores = { ...registro.datos };
    for (const k of llenables) if (m[k] !== undefined) res[k] = m[k];
    return res;
  }, [def, ctx, llenables, registro.datos]);
  const ctxNuevo: Contexto = { ...guardado, valores: datos };
  const nuevos = [...llenables].filter((k) => datos[k] != null);

  // Las desviaciones ya registradas se conservan; se agregan solo las de los datos nuevos.
  const previas = new Set(registro.desviaciones.map((d) => JSON.stringify(d)));
  const nuevas = desviaciones(def, ctxNuevo).filter((d) => llenables.has(d.campoId) && !previas.has(JSON.stringify(d)));
  const reales = nuevas.filter((d) => d.severidad !== 'por-confirmar');
  const porConfirmar = nuevas.filter((d) => d.severidad === 'por-confirmar');
  const siguen = pendientesDiferidos(def, ctxNuevo);
  const accionFalta = reales.length > 0 && agregado.trim().length < 5;
  const listo = nuevos.length > 0 && !accionFalta;
  const limite = fechaLimite(registro.fecha);

  const etapas = etapasVisibles(def, ctx).filter((e) => e.campos.some((c) => editables.has(c.id)));
  const pasos = [...etapas.map((e) => ({ id: e.id, titulo: e.titulo })), { id: PASO_RESUMEN, titulo: 'Resumen' }];
  const actual = pasos[Math.min(paso, pasos.length - 1)];
  const campoPorId = (id: string) => def.etapas.flatMap((e) => e.campos).find((c) => c.id === id)!;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [paso]);

  if (editables.size === 0) {
    return (
      <Vacio titulo="No quedan datos del día siguiente por llenar" accion={<Link className="font-bold text-vino underline" to={`/registro/${registro.id}`}>Ver el registro</Link>}>
        Este registro ya tiene completos sus datos de congelación y empaque.
      </Vacio>
    );
  }

  const cambiar = (id: string, v: unknown) => {
    if (!editables.has(id)) return;
    setValores((prev) => {
      const n = { ...prev };
      if (v === undefined) delete n[id]; else n[id] = v;
      return n;
    });
  };

  const irA = (etapaTitulo: string, campoId?: string) => {
    const i = pasos.findIndex((p) => p.titulo === etapaTitulo);
    if (i >= 0) setPaso(i);
    if (campoId) setTimeout(() => document.getElementById(`campo-${campoId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  const guardar = async () => {
    const desv = [...registro.desviaciones, ...nuevas];
    // la acción correctiva solo se amplía: lo nuevo va debajo de lo que ya estaba
    const accion = agregado.trim() ? [registro.accionCorrectiva, agregado.trim()].filter(Boolean).join('\n') : undefined;
    try {
      await completar.mutateAsync({ id: registro.id, datos, desviaciones: desv, tienePcc: registro.tieneDesviacionPcc || hayPcc(desv), accionCorrectiva: accion });
      avisar(siguen.length ? `Datos guardados. ${siguen.length === 1 ? 'Queda 1 dato' : `Quedan ${siguen.length} datos`} por completar` : 'Datos del día siguiente guardados');
      navegar(`/registro/${registro.id}`);
    } catch (e) {
      avisar(e instanceof Error ? `No se guardó: ${e.message}` : 'No se guardó. Revisa la conexión.', 'error');
    }
  };

  const texto = 'w-full rounded-xl border border-linea bg-white px-4 py-3 text-lg outline-none focus:border-vino';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={`/registro/${registro.id}`} className="no-imprimir inline-flex items-center gap-1.5 font-bold text-tinta-suave hover:text-vino">
          <ArrowLeft size={18} aria-hidden /> Volver al registro
        </Link>
      </div>
      <header className="flex items-center gap-4">
        <div className="size-16 shrink-0 rounded-2xl bg-vino text-dorado grid place-items-center">
          {def.rotulo ? <span className="font-display text-2xl font-extrabold">{def.rotulo}</span> : <IconoFormato nombre={def.icono} size={32} />}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight">Completar datos del día siguiente</h1>
          <p className="text-tinta-suave first-letter:uppercase">
            {[def.nombreCorto, producto?.nombre, registro.lote && `lote ${registro.lote}`].filter(Boolean).join(', ')}. Registro del {fechaLarga(registro.fecha)}.
          </p>
        </div>
      </header>

      <section className="rounded-panel border-2 border-linea bg-white px-5 py-4 flex flex-wrap items-center gap-4">
        <span className="size-12 rounded-full bg-dorado-claro text-vino-oscuro grid place-items-center shrink-0"><CalendarClock size={22} aria-hidden /></span>
        <div className="flex-1 min-w-60">
          <p className="text-lg font-bold">Solo se llenan los datos que quedaron pendientes</p>
          <p className="text-tinta-suave">
            Lo que ya está registrado no cambia. Tienes hasta el {fechaCorta(limite)}, aunque el día esté cerrado; el cambio queda en el historial con tu nombre.
          </p>
        </div>
      </section>

      <nav aria-label="Etapas por completar" className="no-imprimir -mx-4 px-4 overflow-x-auto [scrollbar-width:none]">
        <ol className="flex gap-2 min-w-max">
          {pasos.map((p, i) => {
            const activo = i === paso;
            const quedan = siguen.filter((f) => f.etapa === p.titulo).length;
            const alerta = reales.some((d) => d.etapa === p.titulo);
            return (
              <li key={p.id}>
                <button
                  type="button" onClick={() => setPaso(i)} aria-current={activo ? 'step' : undefined}
                  className={cx('h-12 rounded-full pl-1.5 pr-4 flex items-center gap-2 font-bold border-2 transition-colors',
                    activo ? 'bg-vino border-vino text-white' : 'bg-white border-linea text-tinta hover:border-vino/40')}
                >
                  <span className={cx('size-8 rounded-full grid place-items-center text-sm',
                    activo ? 'bg-dorado text-vino-oscuro' : alerta ? 'bg-fuera text-white'
                      : p.id !== PASO_RESUMEN && quedan === 0 ? 'bg-ok text-white' : 'bg-escarcha-2 text-tinta-suave')}>
                    {alerta ? '!' : p.id !== PASO_RESUMEN && quedan === 0 ? <Check size={16} /> : i + 1}
                  </span>
                  {p.titulo}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {actual.id !== PASO_RESUMEN && (() => {
        const etapa = etapas.find((e) => e.id === actual.id)!;
        return (
          <div className="grid md:grid-cols-2 gap-4">
            {camposVisibles(etapa, ctx).map((c) => (editables.has(c.id) || (c.tipo === 'calculado' && llenables.has(c.id))
              ? <Campo key={c.id} campo={c} ctx={ctx} cambiar={cambiar} diferido />
              : <CampoGuardado key={c.id} campo={c} ctx={ctx} />))}
          </div>
        );
      })()}

      {actual.id === PASO_RESUMEN && (
        <div className="flex flex-col gap-4">
          <section className={cx('rounded-panel border-2 p-5', nuevos.length ? 'border-ok/50 bg-ok-claro/40' : 'border-dorado bg-dorado-claro/50')}>
            <h2 className="text-xl font-bold mb-2">{nuevos.length ? 'Se va a guardar' : 'Todavía no llenaste ningún dato'}</h2>
            {nuevos.length > 0 && (
              <ul className="divide-y divide-linea">
                {nuevos.map((k) => {
                  const c = campoPorId(k);
                  return (
                    <li key={k} className="py-2 flex items-baseline justify-between gap-3">
                      <span className="text-tinta-suave">{c.etiqueta}</span>
                      <strong className="cifra text-right">{textoCampo(c, ctxNuevo)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {siguen.length > 0 && (
            <section className="rounded-panel border-2 border-linea bg-white p-5">
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Clock size={22} className="text-dorado" aria-hidden /> Siguen pendientes</h2>
              <p className="text-tinta-suave mb-3">Puedes guardar lo que tienes y completar el resto hasta el {fechaCorta(limite)}.</p>
              <ul className="flex flex-wrap gap-2">
                {siguen.map((f) => (
                  <li key={f.campoId}>
                    <button type="button" onClick={() => irA(f.etapa, f.campoId)} className="rounded-full bg-escarcha border border-linea px-4 py-2 font-bold hover:border-vino">
                      {f.etiqueta} <span className="font-normal text-tinta-suave">en {f.etapa}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={cx('rounded-panel border-2 p-5', reales.length ? 'border-fuera/60 bg-white' : 'border-ok/50 bg-ok-claro/40')}>
            {reales.length === 0 ? (
              <p className="flex items-center gap-2 text-xl font-bold text-ok"><Check size={24} aria-hidden /> Sin desviaciones nuevas</p>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-3">{reales.length === 1 ? '1 desviación nueva' : `${reales.length} desviaciones nuevas`}</h2>
                <ul className="divide-y divide-linea">
                  {reales.map((d, i) => (
                    <li key={i} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={cx('rounded px-2 py-0.5 text-xs font-bold', SEVERIDAD[d.severidad].clase)}>{d.pcc ?? 'No conforme'}</span>
                      <button type="button" onClick={() => irA(d.etapa, d.campoId)} className="font-bold hover:text-vino underline-offset-2 hover:underline">{d.etiqueta}</button>
                      <span>{d.valor}</span>
                      <span className="text-tinta-suave text-sm">esperado {d.esperado}, en {d.etapa}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {porConfirmar.length > 0 && (
              <p className="mt-3 text-sm text-confirmar">
                {porConfirmar.length} {porConfirmar.length === 1 ? 'valor queda' : 'valores quedan'} fuera de un límite que Calidad aún no confirma. Se guardan como aviso, no como desviación.
              </p>
            )}
          </section>

          {registro.accionCorrectiva && (
            <p><strong>Acción correctiva registrada:</strong> {registro.accionCorrectiva}</p>
          )}
          <label className="flex flex-col gap-2">
            <span className="font-bold text-lg">
              {registro.accionCorrectiva ? 'Agregar a la acción correctiva' : 'Acción correctiva'}{' '}
              {reales.length ? <span className="text-fuera">(obligatoria: hay desviaciones nuevas)</span> : <span className="font-normal text-tinta-suave">(si aplica)</span>}
            </span>
            <textarea rows={3} className={cx(texto, accionFalta && 'border-fuera')} value={agregado} onChange={(e) => setAgregado(e.target.value)}
              placeholder="Qué se hizo con el producto y con el proceso" />
          </label>
        </div>
      )}

      {/* Barra de acciones fija */}
      <div className="no-imprimir fixed bottom-0 inset-x-0 lg:left-28 z-20 bg-white/95 backdrop-blur border-t border-linea">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 py-3 flex items-center gap-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <Boton tam="lg" icono={ChevronLeft} onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
            <span className="hidden sm:inline">Anterior</span>
          </Boton>
          <div className="flex-1 flex flex-wrap items-center justify-center gap-2 text-sm">
            {reales.length > 0 && (
              <span className={cx('rounded-full px-3 py-1 font-bold', hayPcc(reales) ? 'bg-fuera text-white' : 'bg-fuera-claro text-fuera')}>
                {reales.length} {reales.length === 1 ? 'desviación' : 'desviaciones'}
              </span>
            )}
            <span className="text-tinta-suave">
              {nuevos.length === 0 ? 'Sin datos nuevos' : `${nuevos.length} ${nuevos.length === 1 ? 'dato nuevo' : 'datos nuevos'}`}
              {siguen.length > 0 ? `, ${siguen.length} pendientes` : ''}
            </span>
          </div>
          {actual.id === PASO_RESUMEN ? (
            <Boton tam="lg" variante="primario" icono={Save} onClick={guardar} cargando={completar.isPending} disabled={!listo}>
              Guardar datos
            </Boton>
          ) : (
            <Boton tam="lg" variante="vino" onClick={() => setPaso((p) => Math.min(pasos.length - 1, p + 1))}>
              {paso === pasos.length - 2 ? 'Revisar' : 'Siguiente'} <ChevronRight size={22} aria-hidden />
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dato que ya estaba registrado (o que no es del día siguiente): se ve, pero no se cambia por esta vía. */
function CampoGuardado({ campo, ctx }: { campo: TCampo; ctx: Contexto }) {
  const valor = textoCampo(campo, ctx);
  return (
    <TarjetaCampo id={campo.id} etiqueta={campo.etiqueta} pcc={campo.pcc} estado={estadoCampo(campo, ctx)}>
      <p className={cx('text-2xl cifra font-bold', !valor && 'text-linea')}>{valor || '—'}</p>
      <p className="text-sm text-tinta-suave flex items-center gap-1.5">
        {valor ? <><Lock size={14} aria-hidden /> Ya registrado</> : 'Sin dato'}
      </p>
    </TarjetaCampo>
  );
}

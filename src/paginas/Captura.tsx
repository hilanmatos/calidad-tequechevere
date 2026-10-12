import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Save } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { Campo } from '../componentes/campos/Campo';
import { TarjetaCampo } from '../componentes/campos/TarjetaCampo';
import { Boton, Cargando, cx, IconoFormato, SEVERIDAD, useAvisar, Vacio } from '../componentes/ui';
import { formato } from '../formatos';
import { useGuardarRegistro, useOperarios, useProductos, useRegistro, useRegistros } from '../datos/hooks';
import type { Registro, Usuario } from '../datos/repositorio';
import { fechaLarga, hoyPanama, horaLegible, horaPanama } from '../lib/fechas';
import { camposVisibles, desviaciones, etapasVisibles, faltantes, hayPcc } from '../motor/evaluar';
import { materializar, rutasFotos, valoresEfectivos } from '../motor/materializar';
import type { Contexto, DefinicionFormato, Desviacion, Valores } from '../motor/tipos';

interface Encabezado {
  fecha: string;
  hora?: string;
  area?: string;
  productoId?: string;
  lote?: string;
}

interface Borrador {
  enc: Encabezado;
  valores: Valores;
  accion: string;
  obs: string;
  paso: number;
  en: number;
}

const PASO_DATOS = '__datos';
const PASO_RESUMEN = '__resumen';

export function puedeEditar(r: Registro, u: Usuario): boolean {
  if (u.rol === 'admin') return true;
  return r.creadoPor === u.id && hoyPanama(new Date(r.creadoEn)) === hoyPanama();
}

function leerBorrador(clave: string): Borrador | null {
  try {
    const b = localStorage.getItem(clave);
    return b ? (JSON.parse(b) as Borrador) : null;
  } catch {
    return null;
  }
}

export function Captura() {
  const { codigo, id } = useParams();
  const { usuario } = useSesion();
  const consulta = useRegistro(id);
  if (id && consulta.isLoading) return <Cargando />;
  const registro = consulta.data ?? undefined;
  const def = formato(id ? registro?.formato ?? '' : codigo ?? '');
  if (!def) return <Vacio titulo="No encontramos ese formato" accion={<Link className="font-bold text-vino underline" to="/">Volver a Hoy</Link>} />;
  if (registro && !puedeEditar(registro, usuario)) {
    return (
      <Vacio titulo="Este registro ya no se puede editar" accion={<Link className="font-bold text-vino underline" to={`/registro/${registro.id}`}>Ver el registro</Link>}>
        Solo se pueden editar los registros propios el mismo día. Para corregir uno anterior, pide el cambio al administrador.
      </Vacio>
    );
  }
  return <Asistente key={registro?.id ?? def.codigo} def={def} registro={registro} />;
}

function Asistente({ def, registro }: { def: DefinicionFormato; registro?: Registro }) {
  const { usuario } = useSesion();
  const productos = useProductos();
  const operarios = useOperarios();
  const guardar = useGuardarRegistro();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const clave = `borrador:${def.codigo}`;

  const [enc, setEnc] = useState<Encabezado>(() => registro
    ? { fecha: registro.fecha, hora: registro.hora, area: registro.area, productoId: registro.productoId, lote: registro.lote }
    : { fecha: hoyPanama(), hora: def.usaHora ? horaPanama() : undefined, area: undefined });
  const [valores, setValores] = useState<Valores>(registro?.datos ?? {});
  const [accion, setAccion] = useState(registro?.accionCorrectiva ?? '');
  const [obs, setObs] = useState(registro?.observaciones ?? '');
  const [paso, setPaso] = useState(0);
  const [tocado, setTocado] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(() => (registro ? null : leerBorrador(clave)));

  const producto = productos.data?.find((p) => p.id === enc.productoId);
  const ctx: Contexto = useMemo(() => {
    const base: Contexto = { valores, producto, productos: productos.data, operarios: operarios.data, fecha: enc.fecha, area: enc.area };
    return { ...base, valores: valoresEfectivos(def, base) };
  }, [valores, producto, productos.data, operarios.data, enc.fecha, enc.area, def]);

  const etapas = etapasVisibles(def, ctx);
  const pasos = [{ id: PASO_DATOS, titulo: 'Datos' }, ...etapas, { id: PASO_RESUMEN, titulo: 'Resumen' }];
  const actual = pasos[Math.min(paso, pasos.length - 1)];
  const desv = desviaciones(def, ctx);
  const falt = faltantes(def, ctx);
  const pcc = hayPcc(desv);

  const faltaEnc: string[] = [];
  if (!enc.fecha) faltaEnc.push('Fecha');
  if (def.areas && !enc.area) faltaEnc.push('Área');
  if (def.usaProducto && !enc.productoId) faltaEnc.push('Producto');
  if (def.usaLote && !enc.lote) faltaEnc.push('Lote');
  const accionFalta = desv.some((d) => d.severidad !== 'por-confirmar') && accion.trim().length < 5;
  const listo = falt.length === 0 && faltaEnc.length === 0 && !accionFalta;

  useEffect(() => {
    if (registro || !tocado) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(clave, JSON.stringify({ enc, valores, accion, obs, paso, en: Date.now() } satisfies Borrador)); } catch { /* sin almacenamiento */ }
    }, 400);
    return () => clearTimeout(t);
  }, [enc, valores, accion, obs, paso, tocado, registro, clave]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [paso]);

  const cambiar = (id: string, v: unknown) => {
    setTocado(true);
    setValores((prev) => {
      const n = { ...prev };
      if (v === undefined) delete n[id]; else n[id] = v;
      return n;
    });
  };
  const cambiarEnc = (c: Partial<Encabezado>) => { setTocado(true); setEnc((e) => ({ ...e, ...c })); };

  const retomar = () => {
    if (!borrador) return;
    setEnc(borrador.enc); setValores(borrador.valores); setAccion(borrador.accion); setObs(borrador.obs); setPaso(borrador.paso);
    setBorrador(null); setTocado(true);
  };
  const descartar = () => {
    try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
    setBorrador(null);
  };

  const irACampo = (etapaTitulo: string, campoId?: string) => {
    const i = pasos.findIndex((p) => p.titulo === etapaTitulo);
    if (i >= 0) setPaso(i);
    if (campoId) setTimeout(() => document.getElementById(`campo-${campoId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  };

  const enviar = async () => {
    const datos = materializar(def, ctx);
    try {
      const r = await guardar.mutateAsync({
        id: registro?.id,
        formato: def.codigo,
        versionFormato: def.version,
        fecha: enc.fecha,
        hora: enc.hora,
        area: enc.area,
        productoId: enc.productoId,
        lote: enc.lote?.trim() || undefined,
        datos,
        desviaciones: desv,
        tieneDesviacionPcc: pcc,
        accionCorrectiva: accion.trim() || undefined,
        observaciones: obs.trim() || undefined,
        fotos: rutasFotos(def, datos),
        origen: registro?.origen ?? 'app',
        realizadoPor: registro?.realizadoPor || usuario.nombre,
      });
      try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
      avisar(registro ? 'Cambios guardados' : 'Registro guardado');
      navegar(registro ? `/registro/${r.id}` : '/');
    } catch (e) {
      avisar(e instanceof Error ? `No se guardó: ${e.message}` : 'No se guardó el registro. Revisa la conexión.', 'error');
    }
  };

  const pendientesDe = (pid: string) => {
    if (pid === PASO_DATOS) return faltaEnc.length;
    if (pid === PASO_RESUMEN) return 0;
    const titulo = pasos.find((p) => p.id === pid)?.titulo;
    return falt.filter((f) => f.etapa === titulo).length;
  };
  const alertasDe = (titulo: string) => desv.filter((d) => d.etapa === titulo && d.severidad !== 'por-confirmar').length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={registro ? `/registro/${registro.id}` : '/'} className="no-imprimir inline-flex items-center gap-1.5 font-bold text-tinta-suave hover:text-vino">
          <ArrowLeft size={18} aria-hidden /> {registro ? 'Volver al registro' : 'Hoy'}
        </Link>
      </div>
      <header className="flex items-center gap-4">
        <div className="size-16 shrink-0 rounded-2xl bg-vino text-dorado grid place-items-center">
          {def.rotulo ? <span className="font-display text-2xl font-extrabold">{def.rotulo}</span> : <IconoFormato nombre={def.icono} size={32} />}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight">{registro ? 'Editar: ' : ''}{def.nombreCorto}</h1>
          <p className="text-tinta-suave">{def.nombre}{def.codigoSQF ? `, ${def.codigoSQF}` : ''}</p>
        </div>
      </header>

      {borrador && (
        <div className="rounded-panel bg-dorado-claro border border-dorado/60 px-5 py-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-60">
            <strong>Tienes un registro sin terminar</strong> de {fechaLarga(borrador.enc.fecha)}, {horaLegible(new Date(borrador.en).toTimeString().slice(0, 5))}.
          </p>
          <Boton variante="vino" onClick={retomar}>Continuar donde quedé</Boton>
          <Boton variante="fantasma" onClick={descartar}>Empezar de nuevo</Boton>
        </div>
      )}

      {/* Pasos: es una secuencia real, por eso van numerados */}
      <nav aria-label="Etapas del formato" className="no-imprimir -mx-4 px-4 overflow-x-auto">
        <ol className="flex gap-2 min-w-max">
          {pasos.map((p, i) => {
            const pend = pendientesDe(p.id);
            const alert = p.id.startsWith('__') ? 0 : alertasDe(p.titulo);
            const activo = i === paso;
            return (
              <li key={p.id}>
                <button
                  type="button" onClick={() => setPaso(i)} aria-current={activo ? 'step' : undefined}
                  className={cx('h-12 rounded-full pl-1.5 pr-4 flex items-center gap-2 font-bold border-2 transition-colors',
                    activo ? 'bg-vino border-vino text-white' : 'bg-white border-linea text-tinta hover:border-vino/40')}
                >
                  <span className={cx('size-8 rounded-full grid place-items-center text-sm',
                    activo ? 'bg-dorado text-vino-oscuro' : alert ? 'bg-fuera text-white' : pend === 0 && i < paso ? 'bg-ok text-white' : 'bg-escarcha-2 text-tinta-suave')}>
                    {alert ? '!' : pend === 0 && i < paso ? <Check size={16} /> : i + 1}
                  </span>
                  {p.titulo}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid xl:grid-cols-[1fr_20rem] gap-6 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {actual.id === PASO_DATOS && (
            <PasoDatos def={def} enc={enc} cambiar={cambiarEnc} productos={(productos.data ?? []).filter((p) => p.activo && p.linea === def.codigo)} registroId={registro?.id} />
          )}
          {actual.id === PASO_RESUMEN && (
            <PasoResumen
              faltaEnc={faltaEnc} falt={falt} desv={desv} accion={accion} obs={obs} usuario={registro?.realizadoPor || usuario.nombre}
              setAccion={(t) => { setTocado(true); setAccion(t); }} setObs={(t) => { setTocado(true); setObs(t); }}
              irA={irACampo} irADatos={() => setPaso(0)}
            />
          )}
          {!actual.id.startsWith('__') && (() => {
            const etapa = etapas.find((e) => e.id === actual.id)!;
            return (
              <>
                {etapa.descripcion && <p className="text-tinta-suave text-lg">{etapa.descripcion}</p>}
                <div className="grid md:grid-cols-2 gap-4">
                  {camposVisibles(etapa, ctx).map((c) => <Campo key={c.id} campo={c} ctx={ctx} cambiar={cambiar} />)}
                </div>
              </>
            );
          })()}
        </div>

        <aside className="no-imprimir hidden xl:flex flex-col gap-3 sticky top-6">
          <PanelEnVivo desv={desv} faltan={falt.length + faltaEnc.length} />
        </aside>
      </div>

      {/* Barra de acciones fija */}
      <div className="no-imprimir fixed bottom-0 inset-x-0 lg:left-28 z-20 bg-white/95 backdrop-blur border-t border-linea">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 py-3 flex items-center gap-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <Boton tam="lg" icono={ChevronLeft} onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
            <span className="hidden sm:inline">Anterior</span>
          </Boton>
          <div className="flex-1 flex flex-wrap items-center justify-center gap-2 text-sm">
            {desv.filter((d) => d.severidad !== 'por-confirmar').length > 0 && (
              <span className={cx('rounded-full px-3 py-1 font-bold', pcc ? 'bg-fuera text-white' : 'bg-fuera-claro text-fuera')}>
                {(() => { const n = desv.filter((d) => d.severidad !== 'por-confirmar').length; return `${n} ${n === 1 ? 'desviación' : 'desviaciones'}`; })()}
              </span>
            )}
            <span className="text-tinta-suave">
              {falt.length + faltaEnc.length === 0 ? 'Todo completo' : `Faltan ${falt.length + faltaEnc.length}`}
            </span>
          </div>
          {actual.id === PASO_RESUMEN ? (
            <Boton tam="lg" variante="primario" icono={Save} onClick={enviar} cargando={guardar.isPending} disabled={!listo}>
              {registro ? 'Guardar cambios' : 'Guardar registro'}
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

function PanelEnVivo({ desv, faltan }: { desv: Desviacion[]; faltan: number }) {
  const reales = desv.filter((d) => d.severidad !== 'por-confirmar');
  return (
    <div className="rounded-panel bg-white border border-linea p-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className={cx('cifra text-4xl font-extrabold', reales.length ? 'text-fuera' : 'text-ok')}>{reales.length}</p>
          <p className="text-sm text-tinta-suave">{reales.length === 1 ? 'desviación' : 'desviaciones'}</p>
        </div>
        <div>
          <p className="cifra text-4xl font-extrabold text-tinta">{faltan}</p>
          <p className="text-sm text-tinta-suave">por llenar</p>
        </div>
      </div>
      {desv.length > 0 && (
        <ul className="flex flex-col gap-2">
          {desv.slice(0, 8).map((d, i) => (
            <li key={i} className="text-sm">
              <span className={cx('inline-block rounded px-1.5 py-0.5 text-xs font-bold mr-1.5', SEVERIDAD[d.severidad].clase)}>{d.pcc ?? (d.severidad === 'por-confirmar' ? 'Por confirmar' : 'NC')}</span>
              <strong>{d.etiqueta}</strong> <span className="text-tinta-suave">{d.valor}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Opciones<T extends string>({ opciones, valor, cambiar, etiqueta }: { opciones: { id: T; texto: ReactNode }[]; valor?: T; cambiar: (v: T) => void; etiqueta: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.id} type="button" role="radio" aria-checked={valor === o.id} onClick={() => cambiar(o.id)}
          className={cx('min-h-14 px-5 rounded-xl border-2 font-bold text-lg', valor === o.id ? 'border-vino bg-vino text-white' : 'border-linea bg-white hover:border-vino/40')}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

function PasoDatos({ def, enc, cambiar, productos, registroId }: {
  def: DefinicionFormato; enc: Encabezado; cambiar: (c: Partial<Encabezado>) => void;
  productos: { id: string; codigo: string; nombre: string; presentacion: string }[]; registroId?: string;
}) {
  const delDia = useRegistros({ desde: enc.fecha, hasta: enc.fecha, formato: def.codigo });
  const existente = def.areas && enc.area
    ? delDia.data?.find((r) => r.area === enc.area && r.id !== registroId)
    : undefined;
  const entrada = 'h-14 w-full rounded-xl border border-linea bg-white px-4 text-lg outline-none focus:border-vino';

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <TarjetaCampo id="fecha" etiqueta="Fecha" estado={enc.fecha ? 'ok' : 'vacio'}>
        <input type="date" aria-label="Fecha" className={entrada} value={enc.fecha} max={hoyPanama()} onChange={(e) => cambiar({ fecha: e.target.value })} />
      </TarjetaCampo>
      {def.usaHora && (
        <TarjetaCampo id="hora" etiqueta="Hora de la medición" estado={enc.hora ? 'ok' : 'vacio'}>
          <input type="time" aria-label="Hora" className={entrada} value={enc.hora ?? ''} onChange={(e) => cambiar({ hora: e.target.value || undefined })} />
        </TarjetaCampo>
      )}
      {def.areas && (
        <TarjetaCampo id="area" etiqueta="Área" estado={enc.area ? 'ok' : 'vacio'} ancho>
          <Opciones etiqueta="Área" opciones={def.areas.map((a) => ({ id: a, texto: a }))} valor={enc.area} cambiar={(a) => cambiar({ area: a })} />
          {existente && (
            <p className="rounded-xl bg-dorado-claro px-4 py-3 flex flex-wrap items-center gap-2">
              <CircleAlert size={18} className="text-vino" aria-hidden />
              Ya hay un registro de {enc.area} para este día.
              <Link to={`/registro/${existente.id}/editar`} className="font-bold text-vino underline underline-offset-2">Continuar ese registro</Link>
            </p>
          )}
        </TarjetaCampo>
      )}
      {def.usaProducto && (
        <TarjetaCampo id="producto" etiqueta="Producto" estado={enc.productoId ? 'ok' : 'vacio'} ancho>
          {productos.length === 0 ? (
            <p className="text-tinta-suave">No hay productos activos para esta línea. Agrégalos en Admin.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" role="radiogroup" aria-label="Producto">
              {productos.map((p) => {
                const activo = enc.productoId === p.id;
                return (
                  <button
                    key={p.id} type="button" role="radio" aria-checked={activo} onClick={() => cambiar({ productoId: p.id })}
                    className={cx('text-left rounded-xl border-2 px-4 py-3 transition-colors', activo ? 'border-vino bg-vino text-white' : 'border-linea bg-white hover:border-vino/40')}
                  >
                    <span className={cx('block text-xs font-bold', activo ? 'text-dorado' : 'text-tinta-suave')}>{p.codigo || 'Sin código'}</span>
                    <span className="block font-bold leading-snug">{p.nombre}</span>
                    <span className={cx('block text-sm', activo ? 'text-white/80' : 'text-tinta-suave')}>{p.presentacion}</span>
                  </button>
                );
              })}
            </div>
          )}
        </TarjetaCampo>
      )}
      {def.usaLote && (
        <TarjetaCampo id="lote" etiqueta="Lote (número de orden de producción)" estado={enc.lote ? 'ok' : 'vacio'}>
          <input aria-label="Lote" inputMode="numeric" className={cx(entrada, 'cifra text-2xl')} value={enc.lote ?? ''} onChange={(e) => cambiar({ lote: e.target.value })} />
        </TarjetaCampo>
      )}
    </div>
  );
}

function PasoResumen({ faltaEnc, falt, desv, accion, obs, usuario, setAccion, setObs, irA, irADatos }: {
  faltaEnc: string[]; falt: { campoId: string; etiqueta: string; etapa: string }[]; desv: Desviacion[];
  accion: string; obs: string; usuario: string; setAccion: (t: string) => void; setObs: (t: string) => void;
  irA: (etapa: string, campoId?: string) => void; irADatos: () => void;
}) {
  const reales = desv.filter((d) => d.severidad !== 'por-confirmar');
  const exigeAccion = reales.length > 0;
  const porConfirmar = desv.filter((d) => d.severidad === 'por-confirmar');
  const texto = 'w-full rounded-xl border border-linea bg-white px-4 py-3 text-lg outline-none focus:border-vino';

  return (
    <div className="flex flex-col gap-4">
      {(faltaEnc.length > 0 || falt.length > 0) && (
        <section className="rounded-panel border-2 border-dorado bg-dorado-claro/50 p-5">
          <h2 className="text-xl font-bold mb-3">Antes de guardar, completa estos datos</h2>
          <ul className="flex flex-wrap gap-2">
            {faltaEnc.map((f) => (
              <li key={f}><button type="button" onClick={irADatos} className="rounded-full bg-white border border-linea px-4 py-2 font-bold hover:border-vino">{f}</button></li>
            ))}
            {falt.map((f) => (
              <li key={f.campoId}>
                <button type="button" onClick={() => irA(f.etapa, f.campoId)} className="rounded-full bg-white border border-linea px-4 py-2 font-bold hover:border-vino">
                  {f.etiqueta} <span className="font-normal text-tinta-suave">en {f.etapa}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={cx('rounded-panel border-2 p-5', reales.length ? 'border-fuera/60 bg-white' : 'border-ok/50 bg-ok-claro/40')}>
        {reales.length === 0 ? (
          <p className="flex items-center gap-2 text-xl font-bold text-ok"><Check size={24} aria-hidden /> Sin desviaciones</p>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-3">{reales.length === 1 ? '1 desviación' : `${reales.length} desviaciones`}</h2>
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

      <label className="flex flex-col gap-2">
        <span className="font-bold text-lg">
          Acción correctiva {exigeAccion ? <span className="text-fuera">(obligatoria: hay desviaciones)</span> : <span className="font-normal text-tinta-suave">(si aplica)</span>}
        </span>
        <textarea rows={3} className={cx(texto, exigeAccion && accion.trim().length < 5 && 'border-fuera')} value={accion} onChange={(e) => setAccion(e.target.value)}
          placeholder="Qué se hizo con el producto y con el proceso" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-bold text-lg">Observaciones <span className="font-normal text-tinta-suave">(opcional)</span></span>
        <textarea rows={2} className={texto} value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>
      <p className="text-tinta-suave">Realizado por <strong className="text-tinta">{usuario}</strong></p>
    </div>
  );
}

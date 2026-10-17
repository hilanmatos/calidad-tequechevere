import { ArrowLeft, CalendarClock, Check, ChevronLeft, ChevronRight, CircleCheck, Clock, Eye, Lock, Pencil, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { Campo } from '../componentes/campos/Campo';
import { TarjetaCampo } from '../componentes/campos/TarjetaCampo';
import { Boton, Cargando, cx, IconoFormato, SEVERIDAD, useAvisar, Vacio } from '../componentes/ui';
import { formato } from '../formatos';
import { useCierre, useGuardarRegistro, useOperarios, useProductos, useReabrirDia, useRegistro, useRegistroPorClave, useRegistros } from '../datos/hooks';
import type { CierreDia, Registro, Usuario } from '../datos/repositorio';
import { DESCRIPCION_AREA } from '../formatos/comunes';
import { fechaLimite, pendientesDeRegistro, puedeCompletar } from '../lib/dia-siguiente';
import { fechaCorta, fechaLarga, hoyPanama, horaLegible, horaPanama } from '../lib/fechas';
import { camposVisibles, claveUnica, desviaciones, esDiferido, etapasVisibles, faltantes, hayPcc, pendientesDiferidos } from '../motor/evaluar';
import { materializar, rutasFotos, valoresEfectivos } from '../motor/materializar';
import type { Contexto, DefinicionFormato, Desviacion, Faltante, Valores } from '../motor/tipos';

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

/** Con el día abierto: el creador edita su registro el mismo día y el administrador, cualquiera. */
export function puedeEditar(r: Registro, u: Usuario, diaCerrado = false): boolean {
  if (diaCerrado) return false;
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
  const registro = consulta.data ?? undefined;
  const cierreRegistro = useCierre(registro?.fecha ?? '');
  if (id && (consulta.isLoading || cierreRegistro.isLoading)) return <Cargando />;
  const def = formato(id ? registro?.formato ?? '' : codigo ?? '');
  if (!def) return <Vacio titulo="No encontramos ese formato" accion={<Link className="font-bold text-vino underline" to="/">Volver a Hoy</Link>} />;
  if (registro && !puedeEditar(registro, usuario, !!cierreRegistro.data)) {
    return (
      <Vacio titulo="Este registro ya no se puede editar" accion={<Link className="font-bold text-vino underline" to={`/registro/${registro.id}`}>Ver el registro</Link>}>
        {cierreRegistro.data
          ? 'El día de este registro ya se cerró. Para corregirlo, un administrador debe reabrir el día.'
          : 'Solo se pueden editar los registros propios el mismo día. Para corregir uno anterior, pide el cambio al administrador.'}
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
  const claveBorrador = `borrador:${def.codigo}`;

  const [enc, setEnc] = useState<Encabezado>(() => registro
    ? { fecha: registro.fecha, hora: registro.hora, area: registro.area, productoId: registro.productoId, lote: registro.lote }
    : { fecha: hoyPanama(), hora: def.usaHora ? horaPanama() : undefined, area: undefined });
  const [valores, setValores] = useState<Valores>(registro?.datos ?? {});
  const [accion, setAccion] = useState(registro?.accionCorrectiva ?? '');
  const [obs, setObs] = useState(registro?.observaciones ?? '');
  const [paso, setPaso] = useState(0);
  const [tocado, setTocado] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(() => (registro ? null : leerBorrador(claveBorrador)));

  const producto = productos.data?.find((p) => p.id === enc.productoId);
  const ctx: Contexto = useMemo(() => {
    const base: Contexto = { valores, producto, productos: productos.data, operarios: operarios.data, fecha: enc.fecha, area: enc.area };
    return { ...base, valores: valoresEfectivos(def, base) };
  }, [valores, producto, productos.data, operarios.data, enc.fecha, enc.area, def]);

  const cierre = useCierre(enc.fecha);
  const diaCerrado = cierre.data ?? null;
  const clave = claveUnica(def, enc);
  const porClave = useRegistroPorClave(clave);
  const existente = porClave.data && porClave.data.id !== registro?.id ? porClave.data : null;
  const bloqueado = !!diaCerrado || !!existente;
  const navPasos = useRef<HTMLElement>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);

  const etapas = etapasVisibles(def, ctx);
  const pasos = [{ id: PASO_DATOS, titulo: 'Datos' }, ...etapas, { id: PASO_RESUMEN, titulo: 'Resumen' }];
  const actual = pasos[Math.min(paso, pasos.length - 1)];
  const desv = desviaciones(def, ctx);
  const falt = faltantes(def, ctx);
  // los del día siguiente no impiden guardar: quedan pendientes en el registro
  const pend = pendientesDiferidos(def, ctx);
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
      try { localStorage.setItem(claveBorrador, JSON.stringify({ enc, valores, accion, obs, paso, en: Date.now() } satisfies Borrador)); } catch { /* sin almacenamiento */ }
    }, 400);
    return () => clearTimeout(t);
  }, [enc, valores, accion, obs, paso, tocado, registro, claveBorrador]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    // mantiene el paso actual a la vista en la fila de pasos
    const nav = navPasos.current;
    const chip = chips.current[paso];
    if (nav && chip) {
      const n = nav.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      nav.scrollTo({ left: nav.scrollLeft + (c.left - n.left) - (n.width - c.width) / 2, behavior: 'smooth' });
    }
  }, [paso]);
  useEffect(() => { if (bloqueado) setPaso(0); }, [bloqueado]);

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
    try { localStorage.removeItem(claveBorrador); } catch { /* sin almacenamiento */ }
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
        claveUnica: clave ?? undefined,
      });
      try { localStorage.removeItem(claveBorrador); } catch { /* sin almacenamiento */ }
      const quedan = pend.length ? `. Quedan ${pend.length} ${pend.length === 1 ? 'dato' : 'datos'} para el día siguiente` : '';
      avisar(`${registro ? 'Cambios guardados' : 'Registro guardado'}${quedan}`);
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
  const diferidosDe = (titulo: string) => pend.filter((f) => f.etapa === titulo).length;
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

      {diaCerrado && <AvisoDiaCerrado cierre={diaCerrado} esAdmin={usuario.rol === 'admin'} />}
      {!diaCerrado && existente && <AvisoYaHecho def={def} r={existente} usuario={usuario} />}

      {borrador && !bloqueado && (
        <div className="rounded-panel bg-dorado-claro border border-dorado/60 px-5 py-4 flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-60">
            <strong>Tienes un registro sin terminar</strong> de {fechaLarga(borrador.enc.fecha)}, {horaLegible(new Date(borrador.en).toTimeString().slice(0, 5))}.
          </p>
          <Boton variante="vino" onClick={retomar}>Continuar donde quedé</Boton>
          <Boton variante="fantasma" onClick={descartar}>Empezar de nuevo</Boton>
        </div>
      )}

      {/* Pasos: es una secuencia real, por eso van numerados */}
      <nav ref={navPasos} aria-label="Etapas del formato" className="no-imprimir -mx-4 px-4 overflow-x-auto [scrollbar-width:none]">
        <ol className="flex gap-2 min-w-max">
          {pasos.map((p, i) => {
            const faltan = pendientesDe(p.id);
            const alert = p.id.startsWith('__') ? 0 : alertasDe(p.titulo);
            const despues = p.id.startsWith('__') ? 0 : diferidosDe(p.titulo);
            const activo = i === paso;
            return (
              <li key={p.id}>
                <button
                  ref={(el) => { chips.current[i] = el; }}
                  type="button" onClick={() => setPaso(i)} aria-current={activo ? 'step' : undefined}
                  disabled={bloqueado && i > 0}
                  className={cx('h-12 rounded-full pl-1.5 pr-4 flex items-center gap-2 font-bold border-2 transition-colors disabled:opacity-40',
                    activo ? 'bg-vino border-vino text-white' : 'bg-white border-linea text-tinta hover:border-vino/40')}
                >
                  <span className={cx('size-8 rounded-full grid place-items-center text-sm',
                    activo ? 'bg-dorado text-vino-oscuro' : alert ? 'bg-fuera text-white'
                      : faltan === 0 && despues > 0 && i < paso ? 'bg-dorado-claro text-vino-oscuro'
                        : faltan === 0 && i < paso ? 'bg-ok text-white' : 'bg-escarcha-2 text-tinta-suave')}>
                    {alert ? '!' : faltan === 0 && despues > 0 && i < paso ? <Clock size={16} aria-label="Para el día siguiente" />
                      : faltan === 0 && i < paso ? <Check size={16} /> : i + 1}
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
            <PasoDatos def={def} enc={enc} cambiar={cambiarEnc} productos={(productos.data ?? []).filter((p) => p.activo && p.linea === def.codigo)} registroId={registro?.id} loteRepetido={!!existente && def.unicidad === 'lote'} />
          )}
          {actual.id === PASO_RESUMEN && (
            <PasoResumen
              faltaEnc={faltaEnc} falt={falt} pend={pend} limite={fechaLimite(enc.fecha)} desv={desv} accion={accion} obs={obs} usuario={registro?.realizadoPor || usuario.nombre}
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
                  {camposVisibles(etapa, ctx).map((c) => <Campo key={c.id} campo={c} ctx={ctx} cambiar={cambiar} diferido={esDiferido(c, etapa)} />)}
                </div>
              </>
            );
          })()}
        </div>

        <aside className="no-imprimir hidden xl:flex flex-col gap-3 sticky top-6">
          <PanelEnVivo desv={desv} faltan={falt.length + faltaEnc.length} despues={pend.length} />
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
              {falt.length + faltaEnc.length === 0 ? (pend.length ? 'Listo para guardar' : 'Todo completo') : `Faltan ${falt.length + faltaEnc.length}`}
            </span>
            {pend.length > 0 && (
              <span className="rounded-full bg-dorado-claro px-3 py-1 font-bold text-vino-oscuro">{pend.length} para el día siguiente</span>
            )}
          </div>
          {actual.id === PASO_RESUMEN ? (
            <Boton tam="lg" variante="primario" icono={Save} onClick={enviar} cargando={guardar.isPending} disabled={!listo || bloqueado}>
              {registro ? 'Guardar cambios' : 'Guardar registro'}
            </Boton>
          ) : (
            <Boton tam="lg" variante="vino" onClick={() => setPaso((p) => Math.min(pasos.length - 1, p + 1))} disabled={bloqueado}>
              {paso === pasos.length - 2 ? 'Revisar' : 'Siguiente'} <ChevronRight size={22} aria-hidden />
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelEnVivo({ desv, faltan, despues }: { desv: Desviacion[]; faltan: number; despues: number }) {
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
      {despues > 0 && (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <Clock size={16} className="text-dorado" aria-hidden /> {despues} {despues === 1 ? 'dato queda' : 'datos quedan'} para el día siguiente
        </p>
      )}
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

function PasoDatos({ def, enc, cambiar, productos, registroId, loteRepetido }: {
  def: DefinicionFormato; enc: Encabezado; cambiar: (c: Partial<Encabezado>) => void;
  productos: { id: string; codigo: string; nombre: string; presentacion: string }[]; registroId?: string; loteRepetido: boolean;
}) {
  const delDia = useRegistros({ desde: enc.fecha, hasta: enc.fecha, formato: def.codigo });
  const hechas = new Set((delDia.data ?? []).filter((r) => r.id !== registroId && r.area).map((r) => r.area!));
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
          <Opciones
            etiqueta="Área"
            valor={enc.area}
            cambiar={(a) => cambiar({ area: a })}
            opciones={def.areas.map((a) => ({
              id: a,
              texto: (
                <span className="flex flex-col items-start text-left py-1">
                  <span className="flex items-center gap-2">
                    {a}
                    {def.unicidad === 'dia-area' && hechas.has(a) && (
                      <span className="rounded-full bg-ok px-2 py-0.5 text-xs text-white flex items-center gap-1"><Check size={12} strokeWidth={3} /> Hecho</span>
                    )}
                  </span>
                  {DESCRIPCION_AREA[a] && <span className="text-sm font-normal opacity-80">{DESCRIPCION_AREA[a]}</span>}
                </span>
              ),
            }))}
          />
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
          <input aria-label="Lote" inputMode="numeric" enterKeyHint="done" className={cx(entrada, 'cifra text-2xl', loteRepetido && 'border-fuera')} value={enc.lote ?? ''} onChange={(e) => cambiar({ lote: e.target.value })} />
          {loteRepetido && <p className="text-fuera font-bold">Este lote ya tiene su registro. Revisa el número o abre el registro existente arriba.</p>}
        </TarjetaCampo>
      )}
    </div>
  );
}

function PasoResumen({ faltaEnc, falt, pend, limite, desv, accion, obs, usuario, setAccion, setObs, irA, irADatos }: {
  faltaEnc: string[]; falt: Faltante[]; pend: Faltante[]; limite: string; desv: Desviacion[];
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

      {pend.length > 0 && (
        <section className="rounded-panel border-2 border-linea bg-white p-5">
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Clock size={22} className="text-dorado" aria-hidden /> Se completa al día siguiente</h2>
          <p className="text-tinta-suave mb-3">
            Puedes guardar sin estos datos. Se completan desde el registro hasta el {fechaCorta(limite)}, aunque el día ya esté cerrado.
          </p>
          <ul className="flex flex-wrap gap-2">
            {pend.map((f) => (
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

function AvisoDiaCerrado({ cierre, esAdmin }: { cierre: CierreDia; esAdmin: boolean }) {
  const reabrir = useReabrirDia();
  const avisar = useAvisar();
  return (
    <section className="rounded-panel border-2 border-tinta bg-white px-5 py-4 flex flex-wrap items-center gap-4">
      <span className="size-12 rounded-full bg-tinta text-white grid place-items-center shrink-0"><Lock size={22} aria-hidden /></span>
      <div className="flex-1 min-w-60">
        <p className="text-lg font-bold first-letter:uppercase">El {fechaLarga(cierre.fecha)} ya está cerrado</p>
        <p className="text-tinta-suave">
          Lo cerró {cierre.cerradoPorNombre} a las {horaLegible(horaPanama(new Date(cierre.cerradoEn)))}{' '}
          {esAdmin ? 'Para registrar o corregir algo de ese día, primero reábrelo.' : 'Para agregar o corregir registros de ese día, un administrador debe reabrirlo.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/" className="h-12 px-5 rounded-campo border border-linea bg-white font-bold grid place-items-center">Volver a Hoy</Link>
        {esAdmin && (
          <Boton
            variante="vino"
            cargando={reabrir.isPending}
            onClick={async () => { await reabrir.mutateAsync(cierre.fecha); avisar('Día reabierto'); }}
          >
            Reabrir el día
          </Boton>
        )}
      </div>
    </section>
  );
}

function AvisoYaHecho({ def, r, usuario }: { def: DefinicionFormato; r: Registro; usuario: Usuario }) {
  const titulo = def.unicidad === 'lote'
    ? `El lote ${r.lote} ya tiene su registro de ${def.nombreCorto}`
    : def.unicidad === 'dia-area'
      ? `${r.area} ya tiene su registro de ${def.nombreCorto.toLowerCase()} este día`
      : `${def.nombreCorto} ya se registró este día`;
  const n = r.desviaciones.filter((d) => d.severidad !== 'por-confirmar').length;
  const editable = puedeEditar(r, usuario);
  const productos = useProductos();
  const completable = !editable && puedeCompletar(r, usuario) && pendientesDeRegistro(r, productos.data).length > 0;
  return (
    <section className="rounded-panel border-2 border-ok bg-ok-claro/50 px-5 py-4 flex flex-wrap items-center gap-4">
      <span className="size-12 rounded-full bg-ok text-white grid place-items-center shrink-0"><CircleCheck size={24} aria-hidden /></span>
      <div className="flex-1 min-w-60">
        <p className="text-lg font-bold">{titulo}</p>
        <p className="text-tinta-suave">
          Lo hizo {r.realizadoPor || 'el equipo de Calidad'} a las {horaLegible(r.hora ?? horaPanama(new Date(r.creadoEn)))}{' '}
          {n === 0 ? 'Sin desviaciones.' : `${n} ${n === 1 ? 'desviación' : 'desviaciones'}.`} Para no duplicarlo, ábrelo en lugar de llenar uno nuevo.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/registro/${r.id}`} className="h-12 px-5 rounded-campo border border-linea bg-white font-bold flex items-center gap-2"><Eye size={18} aria-hidden /> Ver</Link>
        {editable && (
          <Link to={`/registro/${r.id}/editar`} className="h-12 px-5 rounded-campo bg-vino text-white font-bold flex items-center gap-2"><Pencil size={18} aria-hidden /> Continuar ese registro</Link>
        )}
        {completable && (
          <Link to={`/registro/${r.id}/completar`} className="h-12 px-5 rounded-campo bg-vino text-white font-bold flex items-center gap-2"><CalendarClock size={18} aria-hidden /> Completar datos del día siguiente</Link>
        )}
      </div>
    </section>
  );
}

import { Check, CircleAlert, Eye, Lock, LockOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { EnviarInforme } from '../componentes/EnviarInforme';
import { Boton, ChipEstadoRegistro, cx, Dialogo, IconoFormato, MensajeError, Panel, useAvisar } from '../componentes/ui';
import { FAMILIAS, formato, formatosDe } from '../formatos';
import { useCerrarDia, useCierre, useProductos, useReabrirDia, useRegistros } from '../datos/hooks';
import type { CierreDia, Registro } from '../datos/repositorio';
import { fechaLarga, hoyPanama, horaLegible, horaPanama, saludo } from '../lib/fechas';
import { estacionesRutina, rutinaDelDia, type PasoRutina } from '../lib/rutina';
import type { DefinicionFormato } from '../motor/tipos';

const reales = (r: Registro) => r.desviaciones.filter((d) => d.severidad !== 'por-confirmar').length;
const horaDe = (r: Registro) => horaLegible(r.hora ?? horaPanama(new Date(r.creadoEn)));

export function Hoy() {
  const { usuario } = useSesion();
  const hoy = hoyPanama();
  const { data, error, isLoading } = useRegistros({ desde: hoy, hasta: hoy });
  const cierre = useCierre(hoy);
  const productos = useProductos();
  const registros = data ?? [];
  const pasos = rutinaDelDia(registros, hoy);
  const cerrado = cierre.data ?? null;
  const conAlerta = registros.filter((r) => reales(r) > 0);
  const conPcc = registros.filter((r) => r.tieneDesviacionPcc);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-lg text-tinta-suave">{saludo()}, {usuario.nombre.split(' ')[0]}</p>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight first-letter:uppercase leading-none mt-1">{fechaLarga(hoy)}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-6 lg:gap-10">
          <dl className="flex gap-6 lg:gap-10">
            <Cifra valor={registros.length} etiqueta={registros.length === 1 ? 'registro hoy' : 'registros hoy'} />
            <Cifra valor={conAlerta.length} etiqueta="con desviaciones" tono={conAlerta.length ? 'fuera' : 'neutro'} />
            <Cifra valor={conPcc.length} etiqueta="PCC fuera de límite" tono={conPcc.length ? 'fuera' : 'neutro'} />
          </dl>
          <EnviarInforme desde={hoy} hasta={hoy} titulo="Informe de calidad del día" variante="secundario" />
        </div>
      </header>

      {error ? <MensajeError error={error} /> : null}

      <LineaDeHoy pasos={pasos} registros={registros} cerrado={cerrado} cargando={isLoading} />

      {FAMILIAS.map((fam) => (
        <section key={fam.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-2xl font-bold">{fam.titulo}</h2>
            <span className="text-tinta-suave">{fam.descripcion}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {formatosDe(fam.id).map((f) => (
              <Estacion key={f.codigo} def={f} registros={registros.filter((r) => r.formato === f.codigo)} pasos={pasos.filter((p) => p.def.codigo === f.codigo)} cerrado={!!cerrado} />
            ))}
          </div>
        </section>
      ))}

      <Panel titulo="Registros de hoy">
        {registros.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-tinta-suave">Todavía no hay registros. Elige un formato arriba para empezar.</p>
        ) : (
          <ul className="divide-y divide-linea px-2 pb-2">
            {registros.map((r) => {
              const def = formato(r.formato);
              const prod = productos.data?.find((p) => p.id === r.productoId);
              return (
                <li key={r.id}>
                  <Link to={`/registro/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-3 min-h-14 hover:bg-escarcha">
                    <span className="w-24 shrink-0 text-tinta-suave cifra">{horaDe(r)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold">{def?.nombreCorto ?? r.formato}</span>
                      <span className="text-tinta-suave"> {[prod?.nombre, r.area, r.lote && `lote ${r.lote}`].filter(Boolean).join(', ')}</span>
                    </span>
                    <ChipEstadoRegistro desviaciones={reales(r)} pcc={r.tieneDesviacionPcc} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Cifra({ valor, etiqueta, tono = 'neutro' }: { valor: number; etiqueta: string; tono?: 'neutro' | 'fuera' }) {
  return (
    <div>
      <dd className={cx('cifra text-5xl font-extrabold leading-none', tono === 'fuera' ? 'text-fuera' : 'text-vino')}>{valor}</dd>
      <dt className="text-sm text-tinta-suave mt-1.5">{etiqueta}</dt>
    </div>
  );
}

/** La rutina diaria dibujada como una línea de producción: cada formato es una estación. */
function LineaDeHoy({ pasos, registros, cerrado, cargando }: { pasos: PasoRutina[]; registros: Registro[]; cerrado: CierreDia | null; cargando: boolean }) {
  const { usuario } = useSesion();
  const [confirmar, setConfirmar] = useState(false);
  const reabrir = useReabrirDia();
  const avisar = useAvisar();
  const estaciones = estacionesRutina(pasos);
  const hechos = pasos.filter((p) => p.hecho).length;
  const completos = estaciones.filter((e) => e.hechos === e.total).length;

  return (
    <section className={cx('relative overflow-hidden rounded-panel px-6 py-6 lg:px-10 lg:py-8 text-white', cerrado ? 'bg-tinta' : 'bg-vino')}>
      <div aria-hidden className={cx('absolute -right-16 -top-20 size-64 rounded-full', cerrado ? 'bg-white/5' : 'bg-vino-2/50')} />
      <div className="relative flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h2 className="text-2xl lg:text-3xl font-extrabold flex items-center gap-3">
            {cerrado && <Lock size={26} className="text-dorado" aria-hidden />}
            {cerrado ? 'Día cerrado' : 'La rutina de hoy'}
          </h2>
          <p className="text-white/70">
            {cerrado
              ? `Lo cerró ${cerrado.cerradoPorNombre} a las ${horaLegible(horaPanama(new Date(cerrado.cerradoEn)))} Ya no se agregan ni corrigen registros de hoy.`
              : 'Cuartos fríos, higiene y lavado de manos de cada área, todos los días.'}
          </p>
        </div>
        <p className="cifra text-5xl font-extrabold text-dorado leading-none">
          {cargando ? '…' : hechos}<span className="text-white/40 text-3xl"> de {pasos.length}</span>
        </p>
      </div>

      <ol className="relative grid grid-cols-3 gap-2">
        <div aria-hidden className="absolute top-7 left-[16.6%] right-[16.6%] h-1.5 rounded-full bg-white/15" />
        <div
          aria-hidden
          className="absolute top-7 left-[16.6%] h-1.5 rounded-full bg-dorado transition-all duration-700"
          style={{ width: `${(Math.max(0, completos - 1) / Math.max(1, estaciones.length - 1)) * 66.8}%` }}
        />
        {estaciones.map(({ def, pasos: ps, hechos: h, total }) => {
          const completo = h === total;
          const alerta = ps.some((p) => p.hecho && reales(p.hecho) > 0);
          const destino = completo && total === 1 && ps[0].hecho ? `/registro/${ps[0].hecho.id}` : `/registrar/${def.codigo}`;
          return (
            <li key={def.codigo} className="relative flex flex-col items-center text-center gap-2">
              <Link
                to={destino}
                aria-label={`${def.nombreCorto}: ${h} de ${total}`}
                className={cx('size-16 rounded-full grid place-items-center border-4 transition-transform active:scale-95',
                  completo ? (alerta ? 'bg-fuera border-fuera text-white' : 'bg-dorado border-dorado text-vino-oscuro')
                    : h > 0 ? 'bg-vino border-dorado text-dorado' : 'bg-transparent border-white/40 text-white')}
              >
                {completo ? (alerta ? <CircleAlert size={28} /> : <Check size={30} strokeWidth={3} />) : <IconoFormato nombre={def.icono} size={26} />}
              </Link>
              <span className="font-bold text-lg leading-tight">{def.nombreCorto}</span>
              <span className="flex flex-wrap justify-center gap-1.5">
                {ps.map((p) => (
                  <span
                    key={p.area ?? 'unico'}
                    className={cx('rounded-full px-2.5 py-0.5 text-sm font-bold', p.hecho ? 'bg-white/15 text-white' : 'border border-white/30 text-white/60')}
                  >
                    {p.hecho ? '✓ ' : ''}{p.area ?? (p.hecho ? horaDe(p.hecho) : 'Pendiente')}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="relative mt-7 flex flex-wrap items-center justify-end gap-3">
        {cerrado ? (
          usuario.rol === 'admin' && (
            <Boton
              icono={LockOpen}
              cargando={reabrir.isPending}
              onClick={async () => {
                if (!window.confirm('¿Reabrir el día? Se podrán volver a agregar y corregir registros de hoy.')) return;
                await reabrir.mutateAsync(cerrado.fecha);
                avisar('Día reabierto');
              }}
            >
              Reabrir el día
            </Boton>
          )
        ) : (
          <Boton variante="primario" tam="lg" icono={Lock} onClick={() => setConfirmar(true)} disabled={cargando}>Cerrar el día</Boton>
        )}
      </div>

      {confirmar && <ConfirmarCierre pasos={pasos} registros={registros} cerrar={() => setConfirmar(false)} />}
    </section>
  );
}

function ConfirmarCierre({ pasos, registros, cerrar }: { pasos: PasoRutina[]; registros: Registro[]; cerrar: () => void }) {
  const { usuario } = useSesion();
  const cerrarDia = useCerrarDia();
  const avisar = useAvisar();
  const pendientes = pasos.filter((p) => !p.hecho);
  const sinAccion = registros.filter((r) => reales(r) > 0 && !r.accionCorrectiva);
  const desviaciones = registros.reduce((n, r) => n + reales(r), 0);

  const confirmar = async () => {
    try {
      await cerrarDia.mutateAsync({
        fecha: hoyPanama(),
        cerradoPorNombre: usuario.nombre,
        resumen: {
          registros: registros.length,
          desviaciones,
          pendientes: pendientes.map((p) => `${p.def.nombreCorto}${p.area ? ` ${p.area}` : ''}`),
        },
      });
      avisar('Día cerrado');
      cerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo cerrar el día.', 'error');
    }
  };

  return (
    <Dialogo
      abierto
      cerrar={cerrar}
      titulo="Cerrar el día"
      pie={
        <>
          <Boton onClick={cerrar}>Seguir trabajando</Boton>
          <Boton variante="vino" icono={Lock} onClick={confirmar} cargando={cerrarDia.isPending}>
            {pendientes.length ? 'Cerrar igual' : 'Cerrar el día'}
          </Boton>
        </>
      }
    >
      <p className="text-tinta">
        Al cerrar, los registros de hoy quedan como definitivos: no se pueden agregar ni corregir. Solo un administrador puede reabrir el día.
      </p>
      <ul className="flex flex-col gap-2">
        {pasos.map((p) => (
          <li key={`${p.def.codigo}-${p.area}`} className="flex items-center gap-3">
            <span className={cx('size-8 rounded-full grid place-items-center shrink-0', p.hecho ? 'bg-ok text-white' : 'bg-fuera-claro text-fuera')}>
              {p.hecho ? <Check size={18} strokeWidth={3} /> : '!'}
            </span>
            <span className="font-bold">{p.def.nombreCorto}{p.area ? `, ${p.area}` : ''}</span>
            <span className="text-tinta-suave ml-auto">{p.hecho ? horaDe(p.hecho) : 'Pendiente'}</span>
          </li>
        ))}
      </ul>
      <p className="rounded-xl bg-escarcha px-4 py-3">
        {registros.length} {registros.length === 1 ? 'registro' : 'registros'} hoy, {desviaciones} {desviaciones === 1 ? 'desviación' : 'desviaciones'}.
        {sinAccion.length > 0 && <strong className="block text-fuera mt-1">{sinAccion.length} con desviaciones sin acción correctiva.</strong>}
      </p>
      {pendientes.length > 0 && (
        <p className="rounded-xl bg-dorado-claro px-4 py-3 font-bold">
          Quedan {pendientes.length} {pendientes.length === 1 ? 'control pendiente' : 'controles pendientes'}. Si cierras ahora, quedarán sin registrar este día.
        </p>
      )}
    </Dialogo>
  );
}

function Estacion({ def, registros, pasos, cerrado }: { def: DefinicionFormato; registros: Registro[]; pasos: PasoRutina[]; cerrado: boolean }) {
  const alerta = registros.filter((r) => reales(r) > 0).length;
  const n = registros.length;
  const diario = pasos.length > 0;
  const completo = diario && pasos.every((p) => p.hecho);
  const unico = completo && pasos.length === 1 ? pasos[0].hecho : undefined;
  const destino = unico ? `/registro/${unico.id}` : cerrado ? '/historial' : `/registrar/${def.codigo}`;

  let estado: string;
  if (diario) {
    estado = completo
      ? `Completado${unico ? ` a las ${horaDe(unico)}` : ''}`
      : pasos.length > 1 ? `${pasos.filter((p) => p.hecho).length} de ${pasos.length} áreas` : 'Pendiente hoy';
  } else {
    estado = n === 0 ? 'Sin registro hoy' : `${n} ${n === 1 ? 'registro' : 'registros'} hoy`;
  }

  return (
    <Link
      to={destino}
      className={cx(
        'group relative flex items-center gap-4 rounded-panel border-2 p-4 pr-5 min-h-24 transition-[border-color,box-shadow]',
        completo ? 'bg-ok-claro/50 border-ok/60' : 'bg-white border-linea/80 hover:border-vino/40',
        cerrado && !completo && 'opacity-75',
      )}
    >
      <div className={cx('size-16 shrink-0 rounded-2xl grid place-items-center', completo ? 'bg-ok text-white' : n ? 'bg-vino text-dorado' : 'bg-escarcha-2 text-vino')}>
        {def.rotulo && def.familia === 'linea'
          ? <span className="font-display text-3xl font-extrabold tracking-tight">{def.rotulo}</span>
          : <IconoFormato nombre={def.icono} size={30} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-lg leading-snug">{def.nombreCorto}</p>
        <p className={cx('text-sm', completo ? 'text-ok font-bold' : 'text-tinta-suave')}>
          {estado}
          {alerta > 0 && <span className="text-fuera font-bold">, {alerta} con desviación</span>}
        </p>
        {diario && pasos.length > 1 && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {pasos.map((p) => (
              <span key={p.area} className={cx('rounded-full px-2 py-0.5 text-xs font-bold', p.hecho ? 'bg-ok text-white' : 'bg-escarcha-2 text-tinta-suave')}>
                {p.hecho ? '✓ ' : ''}{p.area}
              </span>
            ))}
          </span>
        )}
      </div>
      <span
        className={cx('size-12 shrink-0 rounded-full grid place-items-center transition-transform group-active:scale-95',
          cerrado ? 'bg-tinta/10 text-tinta' : completo ? 'bg-ok text-white' : 'bg-dorado text-vino-oscuro')}
        aria-hidden
      >
        {cerrado ? <Lock size={20} /> : completo ? (unico ? <Eye size={22} /> : <Check size={24} strokeWidth={3} />) : <Plus size={24} strokeWidth={2.5} />}
      </span>
    </Link>
  );
}

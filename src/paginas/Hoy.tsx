import { Check, CircleAlert, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { ChipEstadoRegistro, cx, IconoFormato, MensajeError, Panel } from '../componentes/ui';
import { FAMILIAS, formato, formatosDe } from '../formatos';
import { useProductos, useRegistros } from '../datos/hooks';
import type { Registro } from '../datos/repositorio';
import { fechaLarga, hoyPanama, horaLegible, horaPanama, saludo } from '../lib/fechas';
import type { DefinicionFormato } from '../motor/tipos';

/** Rutina que se espera todos los días, haya o no producción. */
const RUTINA = ['temp-cuartos', 'higiene-uniforme', 'lavado-manos'];

const reales = (r: Registro) => r.desviaciones.filter((d) => d.severidad !== 'por-confirmar').length;

export function Hoy() {
  const { usuario } = useSesion();
  const hoy = hoyPanama();
  const { data, error, isLoading } = useRegistros({ desde: hoy, hasta: hoy });
  const productos = useProductos();
  const registros = data ?? [];
  const delFormato = (c: string) => registros.filter((r) => r.formato === c);
  const conAlerta = registros.filter((r) => reales(r) > 0);
  const conPcc = registros.filter((r) => r.tieneDesviacionPcc);
  const rutinaHecha = RUTINA.filter((c) => delFormato(c).length > 0).length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-lg text-tinta-suave">{saludo()}, {usuario.nombre.split(' ')[0]}</p>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight first-letter:uppercase leading-none mt-1">{fechaLarga(hoy)}</h1>
        </div>
        <dl className="flex gap-6 lg:gap-10">
          <Cifra valor={registros.length} etiqueta={registros.length === 1 ? 'registro hoy' : 'registros hoy'} />
          <Cifra valor={conAlerta.length} etiqueta="con desviaciones" tono={conAlerta.length ? 'fuera' : 'neutro'} />
          <Cifra valor={conPcc.length} etiqueta="PCC fuera de límite" tono={conPcc.length ? 'fuera' : 'neutro'} />
        </dl>
      </header>

      {error ? <MensajeError error={error} /> : null}

      <LineaDeHoy hechos={rutinaHecha} registros={registros} cargando={isLoading} />

      {FAMILIAS.map((fam) => (
        <section key={fam.id} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-bold">{fam.titulo}</h2>
            <span className="text-tinta-suave">{fam.descripcion}</span>
          </div>
          <div className={cx('grid gap-3', fam.id === 'linea' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3')}>
            {formatosDe(fam.id).map((f) => <Estacion key={f.codigo} def={f} registros={delFormato(f.codigo)} />)}
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
                  <Link to={`/registro/${r.id}`} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-escarcha">
                    <span className="w-24 shrink-0 text-tinta-suave cifra">{horaLegible(r.hora ?? horaPanama(new Date(r.creadoEn)))}</span>
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
function LineaDeHoy({ hechos, registros, cargando }: { hechos: number; registros: Registro[]; cargando: boolean }) {
  const estaciones = RUTINA.map((c) => {
    const def = formato(c)!;
    const rs = registros.filter((r) => r.formato === c);
    const alerta = rs.some((r) => reales(r) > 0);
    return { def, rs, alerta, hecho: rs.length > 0 };
  });
  return (
    <section className="relative overflow-hidden rounded-panel bg-vino text-white px-6 py-6 lg:px-10 lg:py-8">
      <div aria-hidden className="absolute -right-16 -top-20 size-64 rounded-full bg-vino-2/50" />
      <div className="relative flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <h2 className="text-2xl lg:text-3xl font-extrabold">La rutina de hoy</h2>
          <p className="text-white/70">Cuartos fríos, higiene y lavado de manos, todos los días.</p>
        </div>
        <p className="cifra text-5xl font-extrabold text-dorado leading-none">
          {cargando ? '…' : hechos}<span className="text-white/40 text-3xl"> de {RUTINA.length}</span>
        </p>
      </div>
      <ol className="relative grid grid-cols-3 gap-2">
        <div aria-hidden className="absolute top-7 left-[16.6%] right-[16.6%] h-1.5 rounded-full bg-white/15" />
        <div
          aria-hidden
          className="absolute top-7 left-[16.6%] h-1.5 rounded-full bg-dorado transition-all duration-700"
          style={{ width: `${(Math.max(0, hechos - 1) / (RUTINA.length - 1)) * 66.8}%` }}
        />
        {estaciones.map(({ def, rs, alerta, hecho }) => (
          <li key={def.codigo} className="relative flex flex-col items-center text-center gap-2">
            <Link
              to={`/registrar/${def.codigo}`}
              aria-label={`Registrar ${def.nombreCorto}`}
              className={cx('size-16 rounded-full grid place-items-center border-4 transition-transform hover:scale-105',
                alerta ? 'bg-fuera border-fuera text-white' : hecho ? 'bg-dorado border-dorado text-vino-oscuro' : 'bg-vino border-white/40 text-white')}
            >
              {alerta ? <CircleAlert size={28} /> : hecho ? <Check size={30} strokeWidth={3} /> : <IconoFormato nombre={def.icono} size={26} />}
            </Link>
            <span className="font-bold text-lg leading-tight">{def.nombreCorto}</span>
            <span className="text-sm text-white/70">
              {rs.length === 0 ? 'Pendiente' : def.codigo === 'temp-cuartos'
                ? `${rs.length} ${rs.length === 1 ? 'lectura' : 'lecturas'}`
                : `${rs.length} ${rs.length === 1 ? 'área' : 'áreas'}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Estacion({ def, registros }: { def: DefinicionFormato; registros: Registro[] }) {
  const alerta = registros.filter((r) => reales(r) > 0).length;
  const n = registros.length;
  return (
    <Link
      to={`/registrar/${def.codigo}`}
      className="group relative flex items-center gap-4 rounded-panel bg-white border border-linea/80 p-4 pr-5 hover:border-vino/40 hover:shadow-[0_6px_20px_-8px_rgba(110,26,31,.25)] transition-[border-color,box-shadow]"
    >
      <div className={cx('size-16 shrink-0 rounded-2xl grid place-items-center',
        n ? 'bg-vino text-dorado' : 'bg-escarcha-2 text-vino')}>
        {def.rotulo && def.familia === 'linea'
          ? <span className="font-display text-3xl font-extrabold tracking-tight">{def.rotulo}</span>
          : <IconoFormato nombre={def.icono} size={30} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-lg leading-snug">{def.nombreCorto}</p>
        <p className="text-sm text-tinta-suave">
          {n === 0 ? 'Sin registro hoy' : `${n} ${n === 1 ? 'registro' : 'registros'} hoy`}
          {alerta > 0 && <span className="text-fuera font-bold">, {alerta} con desviación</span>}
        </p>
      </div>
      <span className="size-11 shrink-0 rounded-full bg-dorado text-vino-oscuro grid place-items-center group-hover:scale-105 transition-transform" aria-hidden>
        <Plus size={22} strokeWidth={2.5} />
      </span>
    </Link>
  );
}

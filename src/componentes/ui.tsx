import {
  CircleAlert, CircleCheck, CircleHelp, LoaderCircle, Scale, Shirt, Droplets, ThermometerSnowflake,
  CookingPot, type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type SVGProps } from 'react';
import type { Estado, Severidad } from '../motor/tipos';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/**
 * Evita que un doble toque accidental en la tablet deshaga la acción del primero.
 * Devuelve true cuando el toque debe ignorarse (mismo botón, menos de 400 ms).
 */
export function useToqueSeguro(ms = 400) {
  const ultimo = useRef<Record<string, number>>({});
  return useCallback((clave: string) => {
    const ahora = Date.now();
    const previo = ultimo.current[clave];
    ultimo.current[clave] = ahora;
    return previo !== undefined && ahora - previo < ms;
  }, [ms]);
}

// ───────────── Íconos propios ─────────────
type PropsIcono = SVGProps<SVGSVGElement> & { size?: number };

function IconoTequeno({ size = 24, ...p }: PropsIcono) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-20 12 12)" />
      <path d="M7.2 15.6 9.4 8.2M11.2 14.3l2.2-7.4M15.2 12.9l1.6-5.4" />
    </svg>
  );
}

function IconoEmpanada({ size = 24, ...p }: PropsIcono) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 15.5C3 10.3 7 6.5 12 6.5s9 3.8 9 9H3Z" />
      <path d="M5 15.5l.9-1.6.9 1.6.9-1.6.9 1.6.9-1.6.9 1.6.9-1.6.9 1.6.9-1.6.9 1.6.9-1.6.9 1.6.9-1.6.9 1.6.9-1.6.9 1.6" />
    </svg>
  );
}

function IconoBites({ size = 24, ...p }: PropsIcono) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...p}>
      <circle cx="8" cy="14.5" r="4.5" />
      <circle cx="16" cy="14.5" r="4.5" />
      <circle cx="12" cy="7.5" r="4.5" />
    </svg>
  );
}

const ICONOS: Record<string, LucideIcon | ((p: PropsIcono) => ReactNode)> = {
  tequeno: IconoTequeno,
  empanada: IconoEmpanada,
  bites: IconoBites,
  salsa: CookingPot,
  balanza: Scale,
  uniforme: Shirt,
  manos: Droplets,
  termometro: ThermometerSnowflake,
};

export function IconoFormato({ nombre, size = 24, className }: { nombre: string; size?: number; className?: string }) {
  const I = ICONOS[nombre] ?? CircleHelp;
  return <I size={size} className={className} aria-hidden />;
}

// ───────────── Botón ─────────────
type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'vino';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-dorado text-vino-oscuro hover:bg-[#ffbf3a] active:bg-[#e9a414] shadow-[0_2px_0_#c98a0a]',
  vino: 'bg-vino text-white hover:bg-vino-2 active:bg-vino-oscuro',
  secundario: 'bg-white text-tinta border border-linea hover:border-tinta-suave/40 hover:bg-escarcha',
  fantasma: 'text-tinta-suave hover:bg-escarcha-2 hover:text-tinta',
  peligro: 'bg-white text-fuera border border-fuera/40 hover:bg-fuera-claro',
};

export function Boton({
  variante = 'secundario', tam = 'md', icono: Icono, cargando, className, children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante; tam?: 'sm' | 'md' | 'lg'; icono?: LucideIcon; cargando?: boolean;
}) {
  const tamano = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-12 px-5 text-base gap-2', lg: 'h-14 px-7 text-lg gap-2.5' }[tam];
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-campo font-bold transition-colors disabled:opacity-45 disabled:pointer-events-none select-none',
        tamano, VARIANTES[variante], className,
      )}
      disabled={props.disabled || cargando}
      {...props}
    >
      {cargando ? <LoaderCircle className="animate-spin" size={tam === 'lg' ? 22 : 18} /> : Icono && <Icono size={tam === 'lg' ? 22 : 18} aria-hidden />}
      {children}
    </button>
  );
}

// ───────────── Estados y severidades ─────────────
export const TONO_ESTADO: Record<Estado, { borde: string; fondo: string; texto: string; punto: string }> = {
  vacio: { borde: 'border-linea', fondo: 'bg-white', texto: 'text-tinta-suave', punto: 'bg-linea' },
  ok: { borde: 'border-ok/50', fondo: 'bg-white', texto: 'text-ok', punto: 'bg-ok' },
  fuera: { borde: 'border-fuera', fondo: 'bg-fuera-claro/50', texto: 'text-fuera', punto: 'bg-fuera' },
  alerta: { borde: 'border-confirmar/60', fondo: 'bg-confirmar-claro/40', texto: 'text-confirmar', punto: 'bg-confirmar' },
};

export const SEVERIDAD: Record<Severidad, { nombre: string; clase: string }> = {
  pcc: { nombre: 'PCC fuera de límite', clase: 'bg-fuera text-white' },
  calidad: { nombre: 'No conformidad', clase: 'bg-fuera-claro text-fuera' },
  'por-confirmar': { nombre: 'Límite por confirmar', clase: 'bg-confirmar-claro text-confirmar' },
};

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

export function ChipEstadoRegistro({ desviaciones, pcc }: { desviaciones: number; pcc: boolean }) {
  if (pcc) return <Chip className="bg-fuera text-white"><CircleAlert size={14} /> PCC</Chip>;
  if (desviaciones > 0) return <Chip className="bg-fuera-claro text-fuera"><CircleAlert size={14} /> {desviaciones} {desviaciones === 1 ? 'desviación' : 'desviaciones'}</Chip>;
  return <Chip className="bg-ok-claro text-ok"><CircleCheck size={14} /> Conforme</Chip>;
}

// ───────────── Contenedores ─────────────
export function Panel({ children, className, titulo, accion }: { children: ReactNode; className?: string; titulo?: ReactNode; accion?: ReactNode }) {
  return (
    <section className={cx('rounded-panel bg-white border border-linea/70 shadow-[0_1px_2px_rgba(42,19,22,.05)]', className)}>
      {(titulo || accion) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          {titulo && <h2 className="text-lg font-bold">{titulo}</h2>}
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-tinta-suave" role="status">
      <LoaderCircle className="animate-spin" size={22} /> {texto}
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-14 px-6">
      <p className="font-display text-xl font-bold">{titulo}</p>
      {children && <p className="text-tinta-suave max-w-md">{children}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

export function MensajeError({ error }: { error: unknown }) {
  return (
    <div className="m-4 rounded-campo border border-fuera/40 bg-fuera-claro px-4 py-3 text-fuera" role="alert">
      {error instanceof Error ? error.message : 'No se pudieron cargar los datos. Revisa la conexión y vuelve a intentar.'}
    </div>
  );
}

// ───────────── Avisos ─────────────
interface Aviso { id: number; texto: string; tono: 'ok' | 'error' }
const AvisoContexto = createContext<(texto: string, tono?: Aviso['tono']) => void>(() => {});

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tono: Aviso['tono'] = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tono }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <AvisoContexto.Provider value={avisar}>
      {children}
      <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 flex flex-col gap-2 items-center pointer-events-none" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={cx(
              'pointer-events-auto rounded-full px-5 py-3 font-bold shadow-lg flex items-center gap-2',
              a.tono === 'ok' ? 'bg-tinta text-white' : 'bg-fuera text-white',
            )}
          >
            {a.tono === 'ok' ? <CircleCheck size={18} className="text-dorado" /> : <CircleAlert size={18} />}
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoContexto.Provider>
  );
}

export const useAvisar = () => useContext(AvisoContexto);

export function Encabezado({ titulo, subtitulo, accion, volver }: { titulo: ReactNode; subtitulo?: ReactNode; accion?: ReactNode; volver?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {volver}
        <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">{titulo}</h1>
        {subtitulo && <p className="text-tinta-suave mt-1">{subtitulo}</p>}
      </div>
      {accion && <div className="flex gap-2 flex-wrap">{accion}</div>}
    </header>
  );
}

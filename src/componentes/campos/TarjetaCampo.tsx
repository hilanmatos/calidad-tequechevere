import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Estado } from '../../motor/tipos';
import { cx, TONO_ESTADO } from '../ui';

const TEXTO_ESTADO: Record<Estado, string> = {
  vacio: 'Sin dato',
  ok: 'Dentro de rango',
  fuera: 'Fuera de rango',
  alerta: 'Fuera del límite por confirmar',
};

export function TarjetaCampo({
  etiqueta, pcc, estado, ayuda, pie, ancho, opcional, diferido, children, id,
}: {
  etiqueta: string; pcc?: string; estado: Estado; ayuda?: string; pie?: ReactNode; ancho?: boolean;
  /** Se mide al día siguiente: vacío se marca como pendiente, no como falta. */
  opcional?: boolean; diferido?: boolean; children: ReactNode; id: string;
}) {
  const tono = TONO_ESTADO[estado];
  return (
    <div
      id={`campo-${id}`}
      className={cx(
        'min-w-0 rounded-campo border-2 p-4 flex flex-col gap-3 transition-colors scroll-mt-40',
        tono.borde, tono.fondo, ancho && 'md:col-span-2',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="font-bold leading-snug flex-1">
          {etiqueta}
          {opcional && <span className="ml-1.5 font-normal text-sm text-tinta-suave">opcional</span>}
          {diferido && estado === 'vacio' && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-dorado-claro px-2 py-0.5 align-middle text-xs font-bold text-vino-oscuro">
              <Clock size={12} aria-hidden /> Día siguiente
            </span>
          )}
        </span>
        {pcc && (
          <span className="rounded-md bg-vino px-1.5 py-0.5 text-xs font-bold text-white" title="Punto crítico de control">{pcc}</span>
        )}
        <span className={cx('mt-1.5 size-2.5 rounded-full shrink-0', tono.punto)} title={TEXTO_ESTADO[estado]} aria-label={TEXTO_ESTADO[estado]} />
      </div>
      {children}
      {ayuda && <p className="text-sm text-tinta-suave">{ayuda}</p>}
      {pie}
    </div>
  );
}

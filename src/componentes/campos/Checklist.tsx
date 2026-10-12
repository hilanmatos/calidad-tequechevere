import { MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { operariosDelArea, type ValorChecklist } from '../../motor/materializar';
import type { CampoChecklist, Contexto, EstadoCelda } from '../../motor/tipos';
import { cx } from '../ui';

const TONO: Record<EstadoCelda['tono'], string> = {
  ok: 'bg-ok-claro text-ok border-ok/40',
  fuera: 'bg-fuera text-white border-fuera',
  neutro: 'bg-white text-tinta-suave border-linea',
};

export function EntradaChecklist({ campo, valor, ctx, cambiar }: {
  campo: CampoChecklist; valor: unknown; ctx: Contexto; cambiar: (v: unknown) => void;
}) {
  const v = (valor ?? {}) as ValorChecklist;
  const operarios = operariosDelArea(ctx);
  const columnas = campo.columnas.filter((c) => !c.aplica || c.aplica(ctx));
  const estados = campo.estados;
  const [notaAbierta, setNotaAbierta] = useState<string>();

  if (!ctx.area) return <p className="text-tinta-suave">Elige el área en el primer paso.</p>;
  if (operarios.length === 0) {
    return <p className="text-tinta-suave">No hay operarios activos en {ctx.area}. Agrégalos en Admin.</p>;
  }

  const estadoDe = (o: string, c: string) => v[o]?.[c] ?? campo.porDefecto;
  const fijar = (o: string, c: string, e: string) => cambiar({ ...v, [o]: { ...v[o], [c]: e } });
  const ciclar = (o: string, c: string) => {
    const i = estados.findIndex((e) => e.id === estadoDe(o, c));
    fijar(o, c, estados[(i + 1) % estados.length].id);
  };
  const okId = estados.find((e) => e.tono === 'ok')!.id;
  const marcarColumna = (c: string) => {
    const nuevo = { ...v };
    for (const o of operarios) {
      const actual = estadoDe(o.id, c);
      if (actual === campo.porDefecto) nuevo[o.id] = { ...nuevo[o.id], [c]: okId };
    }
    cambiar(nuevo);
  };
  const fijarNota = (o: string, nota: string) => cambiar({ ...v, [o]: { ...v[o], _obs: nota } });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-sm text-tinta-suave">
        {estados.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1.5">
            <span className={cx('inline-grid place-items-center size-6 rounded-md border text-xs font-bold', TONO[e.tono])}>{e.corta}</span>
            {e.etiqueta}
          </span>
        ))}
        <span>Toca una celda para cambiarla.</span>
      </div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="border-separate border-spacing-1 min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-inherit text-left text-sm font-bold text-tinta-suave px-2 min-w-40">Operario</th>
              {columnas.map((c) => (
                <th key={c.id} className="align-bottom px-1 min-w-16 max-w-24">
                  <button
                    type="button" onClick={() => marcarColumna(c.id)}
                    title={`Marcar "${estados.find((e) => e.id === okId)!.etiqueta}" en los pendientes`}
                    className="text-xs font-bold leading-tight text-tinta hover:text-vino w-full"
                  >
                    {c.etiqueta}
                  </button>
                </th>
              ))}
              <th className="w-12" aria-label="Observación" />
            </tr>
          </thead>
          <tbody>
            {operarios.map((o) => (
              <tr key={o.id}>
                <th scope="row" className="sticky left-0 bg-white/95 text-left font-bold px-2 py-1 rounded-lg whitespace-nowrap">
                  {o.nombre}
                  {v[o.id]?._obs && <span className="block text-xs font-normal text-tinta-suave max-w-48 truncate">{v[o.id]._obs}</span>}
                </th>
                {columnas.map((c) => {
                  const e = estados.find((x) => x.id === estadoDe(o.id, c.id)) ?? estados[0];
                  return (
                    <td key={c.id}>
                      <button
                        type="button" onClick={() => ciclar(o.id, c.id)}
                        aria-label={`${o.nombre}, ${c.etiqueta}: ${e.etiqueta}`}
                        className={cx('size-14 w-full min-w-14 rounded-xl border-2 text-xl font-bold transition-colors', TONO[e.tono])}
                      >
                        {e.corta}
                      </button>
                    </td>
                  );
                })}
                <td>
                  <button
                    type="button" onClick={() => setNotaAbierta(notaAbierta === o.id ? undefined : o.id)}
                    aria-label={`Observación de ${o.nombre}`}
                    className={cx('size-12 rounded-xl grid place-items-center', v[o.id]?._obs ? 'bg-dorado-claro text-vino' : 'text-tinta-suave hover:bg-escarcha-2')}
                  >
                    <MessageSquarePlus size={20} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notaAbierta && (
        <label className="flex flex-col gap-1.5 font-bold">
          Observación de {operarios.find((o) => o.id === notaAbierta)?.nombre}
          <input
            autoFocus
            className="h-12 rounded-xl border border-linea bg-white px-4 font-normal outline-none focus:border-vino"
            value={v[notaAbierta]?._obs ?? ''}
            onChange={(e) => fijarNota(notaAbierta, e.target.value)}
            placeholder="Ej. uñas largas, mascarilla abajo"
          />
        </label>
      )}
    </div>
  );
}

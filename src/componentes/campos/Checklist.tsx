import { Check, MessageSquarePlus, Undo2, UserX } from 'lucide-react';
import { useState } from 'react';
import { DESCRIPCION_AREA } from '../../formatos/comunes';
import { operariosDelArea, type ValorChecklist } from '../../motor/materializar';
import type { CampoChecklist, Contexto, EstadoCelda } from '../../motor/tipos';
import { cx, useToqueSeguro } from '../ui';

const TONO: Record<EstadoCelda['tono'], { chip: string; icono: string }> = {
  ok: { chip: 'border-ok/40 bg-ok-claro/60 text-tinta', icono: 'bg-ok text-white' },
  fuera: { chip: 'border-fuera bg-fuera text-white', icono: 'bg-white text-fuera' },
  neutro: { chip: 'border-linea bg-white text-tinta-suave', icono: 'bg-escarcha-2 text-tinta-suave' },
};

export function EntradaChecklist({ campo, valor, ctx, cambiar }: {
  campo: CampoChecklist; valor: unknown; ctx: Contexto; cambiar: (v: unknown) => void;
}) {
  const v = (valor ?? {}) as ValorChecklist;
  const operarios = operariosDelArea(ctx);
  const columnas = campo.columnas.filter((c) => !c.aplica || c.aplica(ctx));
  const ciclo = campo.ciclo ?? campo.estados.map((e) => e.id);
  const okId = campo.estados.find((e) => e.tono === 'ok')!.id;
  const malId = campo.estados.find((e) => e.tono === 'fuera')!.id;
  const [notas, setNotas] = useState<Set<string>>(() => new Set(Object.keys(v).filter((k) => v[k]?._obs)));
  const toque = useToqueSeguro();

  if (!ctx.area) return <p className="text-tinta-suave">Elige el área en el primer paso.</p>;
  if (operarios.length === 0) return <p className="text-tinta-suave">No hay operarios activos en {ctx.area}. Agrégalos en Admin.</p>;

  const ausente = (o: string) => !!v[o]?._ausente;
  const presentes = operarios.filter((o) => !ausente(o.id));
  const ausentes = operarios.filter((o) => ausente(o.id));
  const estadoDe = (o: string, c: string) => v[o]?.[c] ?? campo.porDefecto;
  const fijarFila = (o: string, fila: Record<string, string>) => cambiar({ ...v, [o]: fila });

  const alternar = (o: string, c: string) => {
    if (toque(`${o}:${c}`)) return;
    const i = ciclo.indexOf(estadoDe(o, c));
    fijarFila(o, { ...v[o], [c]: i < 0 ? ciclo[0] : ciclo[(i + 1) % ciclo.length] });
  };
  const marcarAusente = (o: string, siNo: boolean) => {
    if (toque(`${o}:ausente`)) return;
    const fila: Record<string, string> = siNo ? { _ausente: 'si' } : {};
    if (v[o]?._obs) fila._obs = v[o]._obs;
    fijarFila(o, fila);
  };
  const marcarColumna = (c: string) => {
    if (toque(`col:${c}`)) return;
    const nuevo = { ...v };
    for (const o of presentes) if (estadoDe(o.id, c) === campo.porDefecto) nuevo[o.id] = { ...nuevo[o.id], [c]: okId };
    cambiar(nuevo);
  };
  const alternarNota = (o: string) => setNotas((s) => {
    const n = new Set(s);
    if (n.has(o)) n.delete(o); else n.add(o);
    return n;
  });

  const fallas = presentes.reduce((n, o) => n + columnas.filter((c) => estadoDe(o.id, c.id) === malId).length, 0);
  // Las acciones masivas solo sirven cuando las celdas arrancan "pendientes" (lavado de manos).
  const conPendientes = campo.porDefecto !== okId;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-tinta-suave">
        {DESCRIPCION_AREA[ctx.area] && <span className="block text-sm">{ctx.area}: {DESCRIPCION_AREA[ctx.area]}.</span>}
        {presentes.length} {presentes.length === 1 ? 'persona presente' : 'personas presentes'}
        {ausentes.length > 0 && `, ${ausentes.length} no ${ausentes.length === 1 ? 'asistió' : 'asistieron'}`}.{' '}
        <strong className={fallas ? 'text-fuera' : 'text-ok'}>
          {fallas === 0 ? 'Sin fallas marcadas.' : `${fallas} ${fallas === 1 ? 'falla marcada' : 'fallas marcadas'}.`}
        </strong>
      </p>

      {conPendientes && presentes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-bold">Marcar a todos los presentes como lavados:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {columnas.map((c) => (
              <button
                key={c.id} type="button" onClick={() => marcarColumna(c.id)}
                className="min-h-12 rounded-xl border-2 border-vino/30 bg-white px-3 font-bold text-vino active:bg-dorado-claro"
              >
                {c.etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {presentes.map((o) => {
          const fueraFila = columnas.filter((c) => estadoDe(o.id, c.id) === malId).length;
          const verNota = notas.has(o.id);
          return (
            <section key={o.id} className={cx('rounded-2xl border-2 bg-white p-3 flex flex-col gap-3', fueraFila ? 'border-fuera/50' : 'border-linea')}>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold flex-1 min-w-0 truncate">{o.nombre}</h3>
                {fueraFila > 0 && <span className="rounded-full bg-fuera px-2.5 py-0.5 text-sm font-bold text-white">{fueraFila} ✗</span>}
                <button
                  type="button" aria-label={`Observación de ${o.nombre}`} aria-pressed={verNota} onClick={() => alternarNota(o.id)}
                  className={cx('size-11 shrink-0 rounded-xl grid place-items-center border-2', v[o.id]?._obs ? 'border-dorado bg-dorado-claro text-vino' : 'border-linea text-tinta-suave')}
                >
                  <MessageSquarePlus size={20} />
                </button>
                {campo.permiteAusencia && (
                  <button
                    type="button" onClick={() => marcarAusente(o.id, true)}
                    className="h-11 shrink-0 rounded-xl border-2 border-linea px-3 text-sm font-bold text-tinta-suave flex items-center gap-1.5 active:bg-escarcha-2"
                  >
                    <UserX size={16} aria-hidden /> No asistió
                  </button>
                )}
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
                {columnas.map((c) => {
                  const e = campo.estados.find((x) => x.id === estadoDe(o.id, c.id)) ?? campo.estados[0];
                  const t = TONO[e.tono];
                  return (
                    <button
                      key={c.id} type="button" onClick={() => alternar(o.id, c.id)}
                      aria-label={`${o.nombre}, ${c.etiqueta}: ${e.etiqueta}`}
                      className={cx('min-h-14 rounded-xl border-2 px-2.5 py-2 flex items-center gap-2 text-left font-bold leading-tight transition-colors', t.chip)}
                    >
                      <span className={cx('size-7 shrink-0 rounded-full grid place-items-center text-sm', t.icono)} aria-hidden>
                        {e.tono === 'ok' ? <Check size={16} strokeWidth={3} /> : e.corta}
                      </span>
                      <span className="text-[15px]">{c.etiqueta}</span>
                    </button>
                  );
                })}
              </div>

              {verNota && (
                <input
                  aria-label={`Observación de ${o.nombre}`}
                  className="h-12 rounded-xl border border-linea bg-white px-4 outline-none focus:border-vino"
                  value={v[o.id]?._obs ?? ''}
                  onChange={(e) => fijarFila(o.id, { ...v[o.id], _obs: e.target.value })}
                  placeholder="Ej. uñas largas, mascarilla abajo"
                />
              )}
            </section>
          );
        })}
      </div>

      {ausentes.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-linea p-3">
          <p className="font-bold text-tinta-suave mb-2">No asistieron hoy (no cuentan en el monitoreo)</p>
          <ul className="flex flex-wrap gap-2">
            {ausentes.map((o) => (
              <li key={o.id}>
                <button
                  type="button" onClick={() => marcarAusente(o.id, false)}
                  className="h-11 rounded-full border-2 border-linea bg-white pl-4 pr-3 font-bold flex items-center gap-2 text-tinta-suave"
                >
                  {o.nombre} <Undo2 size={16} aria-label="Volver a incluir" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

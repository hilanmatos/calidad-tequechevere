import { Plus, Trash2 } from 'lucide-react';
import { estadoNumero, fmt, limitePeso, resumenMuestras, textoLimite } from '../../motor/evaluar';
import type { CampoMuestras, Contexto, FilaMuestras } from '../../motor/tipos';
import { cx, TONO_ESTADO } from '../ui';
import { alSiguienteCampo } from './basicos';

const selectClase = 'h-12 w-full rounded-xl border border-linea bg-white px-3 font-bold outline-none focus:border-vino';

export function filaVacia(n: number): FilaMuestras {
  return { muestras: Array.from({ length: n }, () => null) };
}

export function EntradaMuestras({ campo, valor, ctx, cambiar }: {
  campo: CampoMuestras; valor: unknown; ctx: Contexto; cambiar: (v: unknown) => void;
}) {
  const filas = (Array.isArray(valor) && valor.length ? valor : [filaVacia(campo.nMuestras)]) as FilaMuestras[];
  const productos = (ctx.productos ?? []).filter((p) => p.activo && campo.lineas.includes(p.linea));
  const operarios = (ctx.operarios ?? []).filter((o) => o.activo);
  const fijar = (i: number, cambio: Partial<FilaMuestras>) => cambiar(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const fijarMuestra = (i: number, k: number, texto: string) => {
    const n = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
    const muestras = [...filas[i].muestras];
    muestras[k] = n !== null && Number.isFinite(n) ? n : null;
    fijar(i, { muestras });
  };

  return (
    <div className="flex flex-col gap-4">
      {filas.map((f, i) => {
        const lim = limitePeso(f.productoId, ctx);
        const prod = productos.find((p) => p.id === f.productoId);
        const r = resumenMuestras(f.muestras, lim);
        return (
          <div key={`${i}-${filas.length}`} className="rounded-xl border border-linea bg-white p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg">Mesa {i + 1}</span>
              {filas.length > 1 && (
                <button
                  type="button" onClick={() => cambiar(filas.filter((_, j) => j !== i))}
                  className="ml-auto size-10 rounded-lg grid place-items-center text-tinta-suave hover:bg-fuera-claro hover:text-fuera"
                  aria-label={`Quitar mesa ${i + 1}`}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <select aria-label="Operador" className={selectClase} value={f.operarioId ?? ''} onChange={(e) => fijar(i, { operarioId: e.target.value || undefined })}>
                <option value="">Operador…</option>
                {operarios.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({o.area})</option>)}
              </select>
              <select aria-label="Producto" className={selectClase} value={f.productoId ?? ''} onChange={(e) => fijar(i, { productoId: e.target.value || undefined })}>
                <option value="">Producto…</option>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.presentacion && `(${p.presentacion})`}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-5 lg:grid-cols-10 gap-1.5">
              {f.muestras.map((m, k) => {
                const est = estadoNumero(m ?? undefined, lim);
                return (
                  <label key={k} className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold text-tinta-suave">M{k + 1}</span>
                    <input
                      inputMode="decimal"
                      enterKeyHint="next"
                      onKeyDown={alSiguienteCampo}
                      aria-label={`Muestra ${k + 1} en gramos`}
                      className={cx('h-12 w-full rounded-lg border-2 text-center text-lg cifra outline-none focus:ring-4 focus:ring-vino/10',
                        m === null ? 'border-linea' : est === 'fuera' ? 'border-fuera bg-fuera-claro text-fuera' : 'border-ok/50')}
                      defaultValue={m ?? ''}
                      onChange={(e) => fijarMuestra(i, k, e.target.value)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span><span className="text-tinta-suave">Promedio </span><strong className="cifra text-lg">{r.promedio !== undefined ? `${fmt(r.promedio, 1)} g` : '—'}</strong></span>
              {prod?.pesoUnidadG !== undefined && <span className="text-tinta-suave">Teórico {fmt(prod.pesoUnidadG)} g</span>}
              {lim && <span className="text-tinta-suave">Tolerancia {textoLimite(lim, 'g')}</span>}
              {r.n > 0 && lim && (
                <span className={cx('font-bold', r.fuera ? TONO_ESTADO.fuera.texto : TONO_ESTADO.ok.texto)}>
                  {r.fuera ? `${r.fuera} fuera de tolerancia` : 'Todas dentro'}
                </span>
              )}
              <div className="ml-auto flex gap-1.5" role="radiogroup" aria-label="Apariencia">
                {(['C', 'NC'] as const).map((a) => (
                  <button
                    key={a} type="button" role="radio" aria-checked={f.apariencia === a}
                    onClick={() => fijar(i, { apariencia: f.apariencia === a ? undefined : a })}
                    className={cx('h-12 px-4 rounded-xl border-2 font-bold',
                      f.apariencia === a ? (a === 'C' ? 'border-ok bg-ok text-white' : 'border-fuera bg-fuera text-white') : 'border-linea bg-white')}
                  >
                    {a === 'C' ? 'Cumple' : 'No cumple'}
                  </button>
                ))}
              </div>
            </div>
            {(campo.columnasExtra?.length ?? 0) > 0 && (
              <div className="grid sm:grid-cols-2 gap-2">
                {campo.columnasExtra?.includes('lote') && (
                  <input aria-label="Lote" placeholder="Lote" inputMode="numeric" className={selectClase} value={f.lote ?? ''} onChange={(e) => fijar(i, { lote: e.target.value || undefined })} />
                )}
                {campo.columnasExtra?.includes('vencimiento') && (
                  <input aria-label="Vencimiento" type="date" className={selectClase} value={f.vencimiento ?? ''} onChange={(e) => fijar(i, { vencimiento: e.target.value || undefined })} />
                )}
                {campo.columnasExtra?.includes('observacion') && (
                  <input aria-label="Observación" placeholder="Observación" className={cx(selectClase, 'sm:col-span-2 font-normal')} value={f.observacion ?? ''} onChange={(e) => fijar(i, { observacion: e.target.value || undefined })} />
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button" onClick={() => cambiar([...filas, filaVacia(campo.nMuestras)])}
        className="h-14 rounded-xl border-2 border-dashed border-linea font-bold text-vino flex items-center justify-center gap-2 hover:border-vino/50 hover:bg-white"
      >
        <Plus size={20} aria-hidden /> Agregar otra mesa
      </button>
    </div>
  );
}

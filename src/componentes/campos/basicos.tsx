import { Camera, Check, LoaderCircle, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRepo } from '../../datos/hooks';
import { aNumero, estadoNumero, fmt, limiteDe, textoLimite } from '../../motor/evaluar';
import type {
  CampoCalculado, CampoConforme, CampoFecha, CampoNumero, CampoOpcion, CampoTexto, Contexto, Limite,
} from '../../motor/tipos';
import { cx, TONO_ESTADO, useAvisar } from '../ui';

const claseEntrada =
  'h-14 w-full rounded-xl border border-linea bg-white px-4 text-2xl cifra outline-none focus:border-vino focus:ring-4 focus:ring-vino/10';

// ───────────── Barra de límite ─────────────
export function BarraLimite({ valor, limite }: { valor?: number; limite: Limite }) {
  if (limite.min === undefined && limite.max === undefined) return null;
  const { min, max } = limite;
  const span = min !== undefined && max !== undefined ? Math.max(max - min, 1) : Math.max(Math.abs((max ?? min)!) * 0.5, 6);
  const desde = (min ?? max! - span) - span * 0.6;
  const hasta = (max ?? min! + span) + span * 0.6;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - desde) / (hasta - desde)) * 100));
  const ini = min !== undefined ? pos(min) : 0;
  const fin = max !== undefined ? pos(max) : 100;
  const estado = estadoNumero(valor, limite);
  return (
    <div className="relative h-2.5 rounded-full bg-escarcha-2" aria-hidden>
      <div className={cx('absolute inset-y-0 rounded-full', limite.porConfirmar ? 'bg-confirmar/25' : 'bg-ok/25')} style={{ left: `${ini}%`, right: `${100 - fin}%` }} />
      {valor !== undefined && (
        <div
          className={cx('absolute -top-1 size-4.5 -ml-2 rounded-full border-2 border-white shadow', TONO_ESTADO[estado].punto)}
          style={{ left: `${pos(valor)}%` }}
        />
      )}
    </div>
  );
}

function PieLimite({ limite, unidad, referencia }: { limite?: Limite; unidad: string; referencia?: number }) {
  const partes: string[] = [];
  if (limite?.porConfirmar && limite.min === undefined && limite.max === undefined) partes.push('Límite crítico por definir');
  else if (limite) partes.push(`${limite.porConfirmar ? 'Límite por confirmar' : 'Límite'}: ${textoLimite(limite, unidad)}`);
  if (referencia !== undefined) partes.push(`Teórico: ${fmt(referencia)} ${unidad}`);
  if (partes.length === 0) return null;
  return <p className={cx('text-sm', limite?.porConfirmar ? 'text-confirmar' : 'text-tinta-suave')}>{partes.join('. ')}</p>;
}

// ───────────── Número ─────────────
export function EntradaNumero({ campo, valor, ctx, cambiar }: { campo: CampoNumero; valor: unknown; ctx: Contexto; cambiar: (v: unknown) => void }) {
  const limite = limiteDe(campo, ctx);
  const esAmbiente = campo.permiteAmbiente && valor === 'Ambiente';
  const n = aNumero(valor);
  const [texto, setTexto] = useState(n === undefined ? '' : String(n));

  useEffect(() => {
    // sincroniza cuando el valor cambia desde fuera (borrador, edición)
    const actual = aNumero(texto);
    if (actual !== n) setTexto(n === undefined ? '' : String(n));
  }, [valor]);

  const escribir = (t: string) => {
    const limpio = t.replace(',', '.').replace(/[^\d.−-]/g, '').replace('−', '-');
    setTexto(limpio);
    const v = aNumero(limpio);
    cambiar(v === undefined ? undefined : v);
  };
  const invertirSigno = () => escribir(texto.startsWith('-') ? texto.slice(1) : `-${texto}`);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {esAmbiente ? (
          <div className="h-14 flex-1 rounded-xl border border-ok/50 bg-ok-claro px-4 flex items-center text-xl font-bold text-ok">Ambiente</div>
        ) : (
          <div className="relative flex-1">
            <input
              aria-label={campo.etiqueta}
              inputMode="decimal"
              enterKeyHint="next"
              className={claseEntrada}
              value={texto}
              onChange={(e) => escribir(e.target.value)}
              placeholder="—"
            />
            {campo.unidad && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-tinta-suave font-bold">{campo.unidad}</span>}
          </div>
        )}
        {campo.unidad === '°C' && !esAmbiente && (
          <button
            type="button"
            onClick={invertirSigno}
            className="h-14 w-14 rounded-xl border border-linea bg-white text-2xl font-bold text-vino hover:bg-escarcha"
            aria-label="Cambiar signo"
          >
            ±
          </button>
        )}
        {campo.permiteAmbiente && (
          <button
            type="button"
            onClick={() => { setTexto(''); cambiar(esAmbiente ? undefined : 'Ambiente'); }}
            className={cx('h-14 rounded-xl border px-4 font-bold', esAmbiente ? 'border-ok bg-ok text-white' : 'border-linea bg-white text-tinta-suave')}
          >
            Ambiente
          </button>
        )}
      </div>
      {limite && !esAmbiente && <BarraLimite valor={n} limite={limite} />}
      <PieLimite limite={limite} unidad={campo.unidad} referencia={campo.referencia?.(ctx)} />
    </div>
  );
}

// ───────────── Calculado ─────────────
export function VistaCalculado({ campo, ctx }: { campo: CampoCalculado; ctx: Contexto }) {
  const v = campo.formula(ctx);
  const limite = limiteDe(campo, ctx);
  const estado = estadoNumero(v, limite);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className={cx('text-3xl cifra font-bold', v === undefined ? 'text-linea' : TONO_ESTADO[estado].texto)}>
          {v === undefined ? '—' : fmt(v, campo.decimales)}
        </span>
        <span className="text-tinta-suave font-bold">{campo.unidad}</span>
      </div>
      <p className="text-sm text-tinta-suave">
        Se calcula solo{limite ? `. Límite: ${textoLimite(limite, campo.unidad)}` : ''}.
      </p>
    </div>
  );
}

// ───────────── Conforme y opciones ─────────────
export function EntradaConforme({ campo, valor, cambiar }: { campo: CampoConforme; valor: unknown; cambiar: (v: unknown) => void }) {
  const [bien, mal] = campo.opciones ?? ['Conforme', 'No conforme'];
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={campo.etiqueta}>
      <button
        type="button" role="radio" aria-checked={valor === bien}
        onClick={() => cambiar(valor === bien ? undefined : bien)}
        className={cx('h-14 rounded-xl border-2 font-bold flex items-center justify-center gap-2 text-lg',
          valor === bien ? 'border-ok bg-ok text-white' : 'border-linea bg-white text-tinta hover:border-ok/60')}
      >
        <Check size={22} aria-hidden /> {bien}
      </button>
      <button
        type="button" role="radio" aria-checked={valor === mal}
        onClick={() => cambiar(valor === mal ? undefined : mal)}
        className={cx('h-14 rounded-xl border-2 font-bold flex items-center justify-center gap-2 text-lg',
          valor === mal ? 'border-fuera bg-fuera text-white' : 'border-linea bg-white text-tinta hover:border-fuera/60')}
      >
        <X size={22} aria-hidden /> {mal}
      </button>
    </div>
  );
}

export function EntradaOpcion({ campo, valor, cambiar }: { campo: CampoOpcion; valor: unknown; cambiar: (v: unknown) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={campo.etiqueta}>
      {campo.opciones.map((o) => {
        const activo = valor === o;
        const mala = campo.malas?.includes(o);
        return (
          <button
            key={o} type="button" role="radio" aria-checked={activo}
            onClick={() => cambiar(activo ? undefined : o)}
            className={cx('min-h-12 px-4 rounded-xl border-2 font-bold flex-1 min-w-[7rem]',
              activo ? (mala ? 'border-fuera bg-fuera text-white' : 'border-vino bg-vino text-white') : 'border-linea bg-white hover:border-vino/40')}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ───────────── Texto, fecha y hora ─────────────
export function EntradaTexto({ campo, valor, cambiar }: { campo: CampoTexto; valor: unknown; cambiar: (v: unknown) => void }) {
  const clase = 'w-full rounded-xl border border-linea bg-white px-4 text-lg outline-none focus:border-vino focus:ring-4 focus:ring-vino/10';
  return campo.multilinea ? (
    <textarea aria-label={campo.etiqueta} rows={3} className={cx(clase, 'py-3')} value={(valor as string) ?? ''} onChange={(e) => cambiar(e.target.value || undefined)} />
  ) : (
    <input aria-label={campo.etiqueta} className={cx(clase, 'h-14')} value={(valor as string) ?? ''} onChange={(e) => cambiar(e.target.value || undefined)} />
  );
}

export function EntradaFecha({ campo, valor, cambiar }: { campo: CampoFecha; valor: unknown; cambiar: (v: unknown) => void }) {
  return (
    <input
      type="date" aria-label={campo.etiqueta}
      className="h-14 w-full rounded-xl border border-linea bg-white px-4 text-lg outline-none focus:border-vino"
      value={(valor as string) ?? ''} onChange={(e) => cambiar(e.target.value || undefined)}
    />
  );
}

export function EntradaHora({ etiqueta, valor, cambiar }: { etiqueta: string; valor: unknown; cambiar: (v: unknown) => void }) {
  return (
    <input
      type="time" aria-label={etiqueta}
      className="h-14 w-full rounded-xl border border-linea bg-white px-4 text-lg outline-none focus:border-vino"
      value={(valor as string) ?? ''} onChange={(e) => cambiar(e.target.value || undefined)}
    />
  );
}

// ───────────── Foto ─────────────
async function comprimir(archivo: File, lado = 1600): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return new Promise((res) => lienzo.toBlob((b) => res(b ?? archivo), 'image/jpeg', 0.82));
}

export function VistaFoto({ ruta, className }: { ruta: string; className?: string }) {
  const repo = useRepo();
  const [url, setUrl] = useState<string>();
  useEffect(() => { repo.urlFoto(ruta).then(setUrl).catch(() => setUrl(undefined)); }, [repo, ruta]);
  return url ? <img src={url} alt="Foto del registro" className={className} /> : <div className={cx('bg-escarcha-2 animate-pulse', className)} />;
}

export function EntradaFoto({ valor, cambiar }: { valor: unknown; cambiar: (v: unknown) => void }) {
  const repo = useRepo();
  const avisar = useAvisar();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const elegir = async (archivo?: File) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const blob = await comprimir(archivo);
      cambiar(await repo.subirFoto(blob, archivo.name || 'foto.jpg'));
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo subir la foto.', 'error');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {typeof valor === 'string' && valor ? (
        <>
          <VistaFoto ruta={valor} className="size-24 rounded-xl object-cover border border-linea" />
          <button type="button" onClick={() => cambiar(undefined)} className="h-12 px-4 rounded-xl border border-linea bg-white font-bold text-fuera flex items-center gap-2">
            <Trash2 size={18} aria-hidden /> Quitar
          </button>
        </>
      ) : (
        <button
          type="button" onClick={() => entrada.current?.click()} disabled={subiendo}
          className="h-14 px-5 rounded-xl border-2 border-dashed border-linea bg-white font-bold text-tinta-suave flex items-center gap-2 hover:border-vino/50"
        >
          {subiendo ? <LoaderCircle className="animate-spin" size={20} /> : <Camera size={20} aria-hidden />}
          {subiendo ? 'Subiendo…' : 'Tomar foto'}
        </button>
      )}
      <input ref={entrada} type="file" accept="image/*" capture="environment" hidden onChange={(e) => elegir(e.target.files?.[0])} />
    </div>
  );
}

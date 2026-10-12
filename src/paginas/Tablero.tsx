import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, cx, Encabezado, MensajeError, Panel, Vacio } from '../componentes/ui';
import { FORMATOS, formato } from '../formatos';
import { CUARTOS } from '../formatos/temp-cuartos';
import { useOperarios, useProductos, useRegistros } from '../datos/hooks';
import type { Registro } from '../datos/repositorio';
import { COLOR, ejeX, ejeY, Grafico, type Opcion } from '../graficos/Grafico';
import {
  camposNumericos, cuartosResumen, higienePorCriterio, higienePorOperario, indicadores, lavadoMapa, limiteFijo,
  pareto, pesoPorToma, porDia, serieCampo, serieCuarto,
} from '../graficos/series';
import { fechaCorta, horaLegible, hoyPanama } from '../lib/fechas';
import { fmt, sumarDias, textoLimite } from '../motor/evaluar';
import type { Limite, Producto } from '../motor/tipos';

const RANGOS = [
  { id: 7, texto: '7 días' },
  { id: 30, texto: '30 días' },
  { id: 90, texto: '90 días' },
  { id: 365, texto: '1 año' },
];

const pct = (x: number) => `${Math.round(x * 100)} %`;
const instante = (fecha: string, hora?: string) => Date.parse(`${fecha}T${hora || '12:00'}:00-05:00`);
const control = 'h-11 rounded-xl border border-linea bg-white px-3 font-bold outline-none focus:border-vino';

export function Tablero() {
  const hoy = hoyPanama();
  const [dias, setDias] = useState(30);
  const desde = sumarDias(hoy, -(dias - 1));
  const previoDesde = sumarDias(desde, -dias);
  const { data, isLoading, error } = useRegistros({ desde: previoDesde, hasta: hoy });
  const productos = useProductos();
  const operarios = useOperarios();

  const actuales = useMemo(() => (data ?? []).filter((r) => r.fecha >= desde), [data, desde]);
  const previos = useMemo(() => (data ?? []).filter((r) => r.fecha < desde), [data, desde]);
  const nombres = useMemo(() => new Map((operarios.data ?? []).map((o) => [o.id, o.nombre])), [operarios.data]);

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Tablero"
        subtitulo={`Del ${fechaCorta(desde)} al ${fechaCorta(hoy)}, comparado con los ${dias} días anteriores.`}
        accion={
          <div className="flex rounded-xl bg-escarcha-2 p-1" role="radiogroup" aria-label="Período">
            {RANGOS.map((r) => (
              <button
                key={r.id} type="button" role="radio" aria-checked={dias === r.id} onClick={() => setDias(r.id)}
                className={cx('h-10 px-4 rounded-lg font-bold', dias === r.id ? 'bg-white text-vino shadow-sm' : 'text-tinta-suave')}
              >
                {r.texto}
              </button>
            ))}
          </div>
        }
      />
      {error ? <MensajeError error={error} /> : isLoading ? <Cargando /> : actuales.length === 0 ? (
        <Panel>
          <Vacio titulo="Sin registros en este período" accion={<Link to="/" className="font-bold text-vino underline">Registrar el primero</Link>}>
            El tablero se llena solo a medida que se guardan registros.
          </Vacio>
        </Panel>
      ) : (
        <Contenido actuales={actuales} previos={previos} desde={desde} hasta={hoy} productos={productos.data ?? []} nombres={nombres} />
      )}
    </div>
  );
}

function Contenido({ actuales, previos, desde, hasta, productos, nombres }: {
  actuales: Registro[]; previos: Registro[]; desde: string; hasta: string; productos: Producto[]; nombres: Map<string, string>;
}) {
  const k = indicadores(actuales);
  const kp = indicadores(previos);
  const sinPrevio = kp.total === 0;
  const vs = (d: number) => `${d > 0 ? '+' : ''}${d} contra el período anterior`;

  return (
    <>
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Indicadores del período">
        <Indicador titulo="Registros" valor={String(k.total)} delta={k.total - kp.total} texto={vs} neutro sinPrevio={sinPrevio} />
        <Indicador titulo="Conformidad" valor={pct(k.pctConformidad)} delta={Math.round((k.pctConformidad - kp.pctConformidad) * 100)} texto={(d) => `${d > 0 ? '+' : ''}${d} puntos`} subeEsBueno sinPrevio={sinPrevio} />
        <Indicador titulo="Desviaciones" valor={String(k.desviaciones)} delta={k.desviaciones - kp.desviaciones} texto={vs} sinPrevio={sinPrevio} />
        <Indicador titulo="Registros con PCC fuera de límite" valor={String(k.conPcc)} delta={k.conPcc - kp.conPcc} texto={vs} sinPrevio={sinPrevio} critico={k.conPcc > 0} />
      </section>

      <div className="grid xl:grid-cols-3 gap-5">
        <Panel titulo="Registros por día" className="xl:col-span-2">
          <div className="px-3 pb-3"><GraficoPorDia rs={actuales} desde={desde} hasta={hasta} /></div>
        </Panel>
        <Panel titulo="Desviaciones más frecuentes">
          <div className="px-3 pb-3"><GraficoPareto rs={actuales} /></div>
        </Panel>
      </div>

      <Explorador rs={actuales} productos={productos} />
      <Cuartos rs={actuales} />

      <div className="grid xl:grid-cols-2 gap-5">
        <Peso rs={actuales} productos={productos} />
        <Higiene rs={actuales} nombres={nombres} />
      </div>

      <Lavado rs={actuales} nombres={nombres} />
    </>
  );
}

function Indicador({ titulo, valor, delta, texto, subeEsBueno, neutro, sinPrevio, critico }: {
  titulo: string; valor: string; delta: number; texto: (d: number) => string;
  subeEsBueno?: boolean; neutro?: boolean; sinPrevio?: boolean; critico?: boolean;
}) {
  const bueno = delta === 0 || neutro ? undefined : subeEsBueno ? delta > 0 : delta < 0;
  const Icono = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <div className="rounded-panel bg-white border border-linea/70 p-5 flex flex-col gap-1">
      <p className="text-tinta-suave font-bold">{titulo}</p>
      <p className={cx('cifra text-5xl font-extrabold leading-tight', critico ? 'text-fuera' : 'text-vino')}>{valor}</p>
      <p className={cx('text-sm font-bold flex items-center gap-1', bueno === undefined ? 'text-tinta-suave' : bueno ? 'text-ok' : 'text-fuera')}>
        {sinPrevio ? 'Sin datos del período anterior' : <><Icono size={16} aria-hidden /> {texto(delta)}</>}
      </p>
    </div>
  );
}

function GraficoPorDia({ rs, desde, hasta }: { rs: Registro[]; desde: string; hasta: string }) {
  const opcion = useMemo<Opcion>(() => {
    const d = porDia(rs, desde, hasta);
    const barra = { type: 'bar', stack: 'r', barMaxWidth: 18, emphasis: { focus: 'series' } };
    return {
      legend: { data: ['Conformes', 'Con desviación'] },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: ejeX({ type: 'category', data: d.map((x) => fechaCorta(x.fecha, false)) }),
      yAxis: ejeY({ type: 'value', minInterval: 1 }),
      series: [
        { ...barra, name: 'Conformes', data: d.map((x) => x.conformes), itemStyle: { color: COLOR.serie1, borderColor: '#fff', borderWidth: 1 } },
        { ...barra, name: 'Con desviación', data: d.map((x) => x.conDesviacion), itemStyle: { color: COLOR.critico, borderRadius: [4, 4, 0, 0], borderColor: '#fff', borderWidth: 1 } },
      ],
    };
  }, [rs, desde, hasta]);
  return <Grafico opcion={opcion} alto={300} etiqueta="Registros por día, conformes y con desviación" />;
}

function GraficoPareto({ rs }: { rs: Registro[] }) {
  const p = useMemo(() => pareto(rs, 8), [rs]);
  const opcion = useMemo<Opcion>(() => ({
    grid: { top: 8, right: 40 },
    tooltip: {
      trigger: 'item',
      formatter: (x: { dataIndex: number }) => {
        const f = p[x.dataIndex];
        return `<strong>${f.etiqueta}</strong><br/>${f.cantidad} veces, ${pct(f.pct)} del total<br/><span style="color:${COLOR.suave}">${f.formatos.join(', ')}</span>`;
      },
    },
    xAxis: ejeY({ type: 'value', minInterval: 1, splitLine: { show: false }, axisLabel: { show: false } }),
    yAxis: ejeX({ type: 'category', inverse: true, axisLine: { show: false }, data: p.map((f) => (f.etiqueta.length > 26 ? `${f.etiqueta.slice(0, 25)}…` : f.etiqueta)) }),
    series: [{
      type: 'bar', data: p.map((f) => f.cantidad), barMaxWidth: 16,
      itemStyle: { color: COLOR.critico, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: COLOR.tinta, fontWeight: 'bold' },
    }],
  }), [p]);
  if (p.length === 0) return <p className="px-2 py-16 text-center text-ok font-bold">Sin desviaciones en el período.</p>;
  return <Grafico opcion={opcion} alto={300} etiqueta="Desviaciones más frecuentes del período" />;
}

/** Banda del límite y líneas de referencia sobre el eje de valores. */
function marcasLimite(l?: Limite) {
  if (!l || (l.min === undefined && l.max === undefined)) return {};
  const color = l.porConfirmar ? COLOR.confirmar : COLOR.bien;
  return {
    markArea: {
      silent: true,
      itemStyle: { color: l.porConfirmar ? 'rgba(79,91,213,.07)' : COLOR.banda },
      data: [[{ yAxis: l.min ?? -1e6 }, { yAxis: l.max ?? 1e6 }]],
    },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color, type: 'dashed', width: 1.5 },
      label: { color, formatter: (x: { value: number }) => fmt(x.value), position: 'insideEndTop' },
      data: [l.min, l.max].filter((v) => v !== undefined).map((v) => ({ yAxis: v })),
    },
  };
}

function rangoY(valores: number[], l?: Limite): { min: number; max: number } | Record<string, never> {
  const xs = [...valores, ...(l ? [l.min, l.max].filter((v): v is number => v !== undefined) : [])];
  if (!xs.length) return {};
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const m = Math.max((hi - lo) * 0.12, 0.2);
  // redondeo "bonito": enteros en rangos amplios, décimas en rangos cortos (pH, kg)
  const paso = hi - lo > 4 ? 1 : 0.1;
  return { min: Math.floor((lo - m) / paso) * paso, max: Math.ceil((hi + m) / paso) * paso };
}

const ejeTiempo = () => ejeX({
  type: 'time',
  axisLabel: { color: COLOR.suave, hideOverlap: true, formatter: (v: number) => fechaCorta(hoyPanama(new Date(v)), false) },
});

function Explorador({ rs, productos }: { rs: Registro[]; productos: Producto[] }) {
  const formatos = FORMATOS.filter((f) => camposNumericos(f.codigo).length > 0 && f.codigo !== 'temp-cuartos');
  const inicial = (c: string) => (camposNumericos(c).find((x) => x.pcc) ?? camposNumericos(c)[0])?.id ?? '';
  const [codigo, setCodigo] = useState('cq-l1-tequenos');
  const [campoId, setCampoId] = useState(() => inicial('cq-l1-tequenos'));
  const [productoId, setProductoId] = useState('');
  const def = formato(codigo)!;
  const campo = camposNumericos(codigo).find((c) => c.id === campoId);
  const unidad = campo && (campo.tipo === 'numero' || campo.tipo === 'calculado') ? campo.unidad : '';
  const producto = productos.find((p) => p.id === productoId);
  const puntos = useMemo(() => serieCampo(rs, codigo, campoId, productos, productoId || undefined), [rs, codigo, campoId, productos, productoId]);
  const limite = limiteFijo(codigo, campoId, producto);

  const opcion = useMemo<Opcion>(() => ({
    grid: { top: 16 },
    tooltip: {
      trigger: 'item',
      formatter: (x: { dataIndex: number }) => {
        const p = puntos[x.dataIndex];
        const prod = productos.find((q) => q.id === p.productoId);
        return `<strong>${fmt(p.valor)} ${unidad}</strong><br/>${fechaCorta(p.fecha)}${p.hora ? `, ${horaLegible(p.hora)}` : ''}${prod ? `<br/>${prod.nombre}` : ''}`;
      },
    },
    xAxis: ejeTiempo(),
    yAxis: ejeY({ type: 'value', ...rangoY(puntos.map((p) => p.valor), limite), axisLabel: { color: COLOR.suave, formatter: (v: number) => fmt(v) } }),
    series: [{
      type: 'line',
      symbol: 'circle',
      showSymbol: true,
      lineStyle: { color: COLOR.serie1, width: 2 },
      data: puntos.map((p) => ({
        value: [instante(p.fecha, p.hora), p.valor],
        symbolSize: p.estado === 'fuera' || p.estado === 'alerta' ? 10 : 6,
        itemStyle: { color: p.estado === 'fuera' ? COLOR.critico : p.estado === 'alerta' ? COLOR.confirmar : COLOR.serie1, borderColor: '#fff', borderWidth: 2 },
      })),
      ...marcasLimite(limite),
    }],
  }), [puntos, limite, unidad, productos]);

  const valores = puntos.map((p) => p.valor);
  const fuera = puntos.filter((p) => p.estado === 'fuera').length;
  const prods = productos.filter((p) => p.linea === codigo);

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <h2 className="text-lg font-bold mr-auto">Explorador de variables</h2>
        <select aria-label="Formato" className={control} value={codigo} onChange={(e) => { setCodigo(e.target.value); setCampoId(inicial(e.target.value)); setProductoId(''); }}>
          {formatos.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombreCorto}</option>)}
        </select>
        <select aria-label="Variable" className={cx(control, 'max-w-80')} value={campoId} onChange={(e) => setCampoId(e.target.value)}>
          {def.etapas.map((e) => {
            const cs = e.campos.filter((c) => c.tipo === 'numero' || c.tipo === 'calculado');
            return cs.length ? (
              <optgroup key={e.id} label={e.titulo}>
                {cs.map((c) => <option key={c.id} value={c.id}>{c.etiqueta}{c.pcc ? ` (${c.pcc})` : ''}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        {prods.length > 0 && (
          <select aria-label="Producto" className={control} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">Todos los productos</option>
            {prods.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.presentacion}</option>)}
          </select>
        )}
      </div>
      <div className="grid lg:grid-cols-[1fr_14rem] gap-4 px-3 pb-4 pt-2">
        {puntos.length === 0 ? (
          <p className="py-20 text-center text-tinta-suave">No hay mediciones de esta variable en el período.</p>
        ) : (
          <Grafico opcion={opcion} alto={320} etiqueta={`Tendencia de ${campo?.etiqueta ?? ''}`} />
        )}
        <dl className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start px-2">
          <Resumen etiqueta="Mediciones" valor={String(puntos.length)} />
          <Resumen etiqueta="Promedio" valor={valores.length ? `${fmt(valores.reduce((a, b) => a + b, 0) / valores.length, 1)} ${unidad}` : '—'} />
          <Resumen etiqueta="Mínimo y máximo" valor={valores.length ? `${fmt(Math.min(...valores))} a ${fmt(Math.max(...valores))} ${unidad}` : '—'} />
          <Resumen
            etiqueta="Límite"
            valor={limite ? (limite.min === undefined && limite.max === undefined ? 'Por definir' : textoLimite(limite, unidad)) : 'Sin límite'}
            tono={limite?.porConfirmar ? 'confirmar' : undefined}
          />
          <Resumen etiqueta="Fuera de límite" valor={limite ? `${fuera} (${puntos.length ? pct(fuera / puntos.length) : '0 %'})` : '—'} tono={fuera ? 'fuera' : undefined} />
        </dl>
      </div>
    </Panel>
  );
}

function Resumen({ etiqueta, valor, tono }: { etiqueta: string; valor: ReactNode; tono?: 'fuera' | 'confirmar' }) {
  return (
    <div>
      <dt className="text-sm text-tinta-suave">{etiqueta}</dt>
      <dd className={cx('font-bold text-lg cifra', tono === 'fuera' && 'text-fuera', tono === 'confirmar' && 'text-confirmar')}>{valor}</dd>
    </div>
  );
}

function GraficoCuartos({ rs, ids, limite, titulo }: { rs: Registro[]; ids: [string, string]; limite: Limite; titulo: string }) {
  const opcion = useMemo<Opcion>(() => {
    const series = ids.map((id, i) => {
      const c = CUARTOS.find((x) => x.id === id)!;
      const color = i === 0 ? COLOR.serie1 : COLOR.serie2;
      return {
        type: 'line',
        name: c.nombre,
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        endLabel: { show: true, formatter: (x: { seriesName: string }) => x.seriesName.slice(-2), color: COLOR.tinta, fontWeight: 'bold' },
        data: serieCuarto(rs, id).map((p) => [instante(p.fecha, p.hora), p.valor]),
        ...(i === 0 ? marcasLimite(limite) : {}),
      };
    });
    const todos = ids.flatMap((id) => serieCuarto(rs, id).map((p) => p.valor));
    return {
      legend: { data: series.map((s) => s.name) },
      grid: { right: 36 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${fmt(v, 1)} °C` },
      xAxis: ejeTiempo(),
      yAxis: ejeY({ type: 'value', ...rangoY(todos, limite), axisLabel: { color: COLOR.suave, formatter: (v: number) => `${fmt(v)}°` } }),
      series,
    };
  }, [rs, ids, limite]);
  return <Grafico opcion={opcion} alto={260} etiqueta={titulo} />;
}

function Cuartos({ rs }: { rs: Registro[] }) {
  const resumen = useMemo(() => cuartosResumen(rs), [rs]);
  if (resumen.every((c) => c.n === 0)) return null;
  return (
    <Panel titulo="Cuartos fríos">
      <div className="grid lg:grid-cols-2 gap-4 px-3 pt-2">
        <div>
          <p className="px-2 text-sm text-tinta-suave">Refrigeración, de 1 a 5 °C</p>
          <GraficoCuartos rs={rs} ids={['frioPB', 'frioPA']} limite={CUARTOS[0].limite} titulo="Temperatura de los cuartos de refrigeración" />
        </div>
        <div>
          <p className="px-2 text-sm text-tinta-suave">Congelación, −18 °C o menos</p>
          <GraficoCuartos rs={rs} ids={['congPB', 'congPA']} limite={CUARTOS[1].limite} titulo="Temperatura de los cuartos de congelación" />
        </div>
      </div>
      <div className="overflow-x-auto px-5 pb-5 pt-2">
        <table className="w-full text-left">
          <thead className="text-sm text-tinta-suave">
            <tr className="border-b border-linea">
              <th className="py-2 font-bold">Cuarto</th>
              <th className="py-2 font-bold">Lecturas</th>
              <th className="py-2 font-bold">Promedio</th>
              <th className="py-2 font-bold">Fuera de rango</th>
              <th className="py-2 font-bold">Pistola contra termómetro, promedio</th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((c) => {
              const revisar = Math.abs(c.diferencia ?? 0) > 5;
              return (
                <tr key={c.id} className="border-b border-linea/60 last:border-0">
                  <td className="py-2.5 font-bold">{c.nombre}</td>
                  <td className="py-2.5 cifra">{c.n}</td>
                  <td className="py-2.5 cifra">{c.promedio !== undefined ? `${fmt(c.promedio, 1)} °C` : '—'}</td>
                  <td className={cx('py-2.5 cifra font-bold', c.fuera ? 'text-fuera' : 'text-ok')}>{c.fuera}{c.n ? ` (${pct(c.fuera / c.n)})` : ''}</td>
                  <td className={cx('py-2.5 cifra', revisar && 'text-fuera font-bold')}>
                    {c.diferencia !== undefined ? `${c.diferencia > 0 ? '+' : ''}${fmt(c.diferencia, 1)} °C` : '—'}
                    {revisar && <span className="ml-2 text-xs font-normal text-tinta-suave">diferencia alta</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Peso({ rs, productos }: { rs: Registro[]; productos: Producto[] }) {
  const conDatos = useMemo(() => {
    const ids = new Set(rs.filter((r) => r.formato.startsWith('fq32-')).flatMap((r) => ((r.datos.muestras ?? []) as { productoId?: string }[]).map((f) => f.productoId)));
    return productos.filter((p) => ids.has(p.id));
  }, [rs, productos]);
  const [elegido, setElegido] = useState('');
  const productoId = elegido || conDatos[0]?.id || '';
  const prod = productos.find((p) => p.id === productoId);
  const tomas = useMemo(() => (productoId ? pesoPorToma(rs, productoId, productos) : []), [rs, productoId, productos]);
  const limite: Limite | undefined = prod && (prod.pesoUnidadMinG !== undefined || prod.pesoUnidadMaxG !== undefined)
    ? { min: prod.pesoUnidadMinG, max: prod.pesoUnidadMaxG }
    : undefined;

  const opcion = useMemo<Opcion>(() => {
    const x = tomas.map((t) => instante(t.fecha, t.hora));
    return {
      legend: { data: ['Promedio', 'Mínimo a máximo'] },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const t = tomas[ps[0].dataIndex];
          return `<strong>${fechaCorta(t.fecha)}${t.hora ? `, ${horaLegible(t.hora)}` : ''}</strong><br/>Promedio ${fmt(t.promedio, 1)} g<br/>Rango ${fmt(t.minimo)} a ${fmt(t.maximo)} g<br/>${t.fuera} de ${t.n} fuera de tolerancia`;
        },
      },
      xAxis: ejeTiempo(),
      yAxis: ejeY({ type: 'value', ...rangoY(tomas.flatMap((t) => [t.minimo, t.maximo]), limite), axisLabel: { color: COLOR.suave, formatter: (v: number) => `${fmt(v)} g` } }),
      series: [
        { type: 'line', name: 'base', stack: 'rango', data: tomas.map((t, i) => [x[i], t.minimo]), lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
        {
          type: 'line', name: 'Mínimo a máximo', stack: 'rango', symbol: 'none', lineStyle: { opacity: 0 },
          data: tomas.map((t, i) => [x[i], Math.round((t.maximo - t.minimo) * 10) / 10]),
          areaStyle: { color: 'rgba(42,120,214,.16)' }, itemStyle: { color: 'rgba(42,120,214,.35)' },
        },
        {
          type: 'line', name: 'Promedio', symbol: 'circle', symbolSize: 8,
          lineStyle: { color: COLOR.serie1, width: 2 }, itemStyle: { color: COLOR.serie1 },
          data: tomas.map((t, i) => ({ value: [x[i], t.promedio], itemStyle: { color: t.fuera ? COLOR.critico : COLOR.serie1, borderColor: '#fff', borderWidth: 2 } })),
          ...marcasLimite(limite),
        },
      ],
    };
  }, [tomas, limite]);

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <h2 className="text-lg font-bold mr-auto">Peso por unidad, F-Q-32</h2>
        {conDatos.length > 0 && (
          <select aria-label="Producto" className={control} value={productoId} onChange={(e) => setElegido(e.target.value)}>
            {conDatos.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.presentacion}</option>)}
          </select>
        )}
      </div>
      <div className="px-3 pb-3 pt-1">
        {tomas.length === 0 ? <p className="py-20 text-center text-tinta-suave">Sin muestras de peso en el período.</p> : (
          <>
            <p className="px-2 text-sm text-tinta-suave">
              {limite ? `Tolerancia ${textoLimite(limite, 'g')}. Puntos rojos: alguna muestra quedó fuera.` : 'Este producto aún no tiene tolerancia cargada en Admin.'}
            </p>
            <Grafico opcion={opcion} alto={280} etiqueta={`Peso promedio por toma de ${prod?.nombre ?? ''}`} />
          </>
        )}
      </div>
    </Panel>
  );
}

function Higiene({ rs, nombres }: { rs: Registro[]; nombres: Map<string, string> }) {
  const criterios = useMemo(
    () => higienePorCriterio(rs).filter((c) => c.revisiones > 0).sort((a, b) => b.fallas / b.revisiones - a.fallas / a.revisiones),
    [rs],
  );
  const operarios = useMemo(() => higienePorOperario(rs).filter((o) => o.fallas > 0).slice(0, 6), [rs]);
  const opcion = useMemo<Opcion>(() => ({
    grid: { top: 8, right: 48 },
    tooltip: { trigger: 'item', formatter: (x: { dataIndex: number }) => { const c = criterios[x.dataIndex]; return `<strong>${c.criterio}</strong><br/>${c.fallas} fallas en ${c.revisiones} revisiones`; } },
    xAxis: ejeY({ type: 'value', max: (v: { max: number }) => Math.max(v.max, 0.05), splitLine: { show: false }, axisLabel: { show: false } }),
    yAxis: ejeX({ type: 'category', inverse: true, axisLine: { show: false }, data: criterios.map((c) => (c.criterio.length > 24 ? `${c.criterio.slice(0, 23)}…` : c.criterio)) }),
    series: [{
      type: 'bar', barMaxWidth: 14, data: criterios.map((c) => c.fallas / c.revisiones),
      itemStyle: { color: COLOR.critico, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: COLOR.tinta, fontWeight: 'bold', formatter: (x: { value: number }) => pct(x.value) },
    }],
  }), [criterios]);

  if (criterios.length === 0) {
    return <Panel titulo="Higiene y uniforme"><p className="px-5 py-16 text-center text-tinta-suave">Sin revisiones de higiene en el período.</p></Panel>;
  }
  return (
    <Panel titulo="Higiene y uniforme">
      <div className="px-3 pt-1">
        <p className="px-2 text-sm text-tinta-suave">Porcentaje de revisiones con falla, por criterio</p>
        <Grafico opcion={opcion} alto={300} etiqueta="Porcentaje de fallas de higiene por criterio" />
      </div>
      {operarios.length > 0 && (
        <div className="px-5 pb-5">
          <h3 className="font-bold mb-1.5">Personas con más observaciones</h3>
          <ul className="divide-y divide-linea">
            {operarios.map((o) => (
              <li key={o.operarioId} className="py-2 flex items-baseline gap-3">
                <span className="font-bold flex-1">{nombres.get(o.operarioId) ?? 'Operario retirado'}</span>
                <span className="text-sm text-tinta-suave truncate max-w-56">{o.notas.slice(-1)[0] ?? ''}</span>
                <span className="cifra font-bold text-fuera">{o.fallas} {o.fallas === 1 ? 'falla' : 'fallas'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Lavado({ rs, nombres }: { rs: Registro[]; nombres: Map<string, string> }) {
  const celdas = useMemo(() => lavadoMapa(rs), [rs]);
  const fechas = useMemo(() => [...new Set(celdas.map((c) => c.fecha))].sort().slice(-31), [celdas]);
  const ops = useMemo(
    () => [...new Set(celdas.map((c) => c.operarioId))].sort((a, b) => (nombres.get(a) ?? '').localeCompare(nombres.get(b) ?? '')),
    [celdas, nombres],
  );
  const opcion = useMemo<Opcion>(() => ({
    grid: { top: 8, bottom: 56 },
    tooltip: {
      trigger: 'item',
      formatter: (x: { data: number[] }) => {
        const [fi, oi, , lavo, total] = x.data;
        return `<strong>${nombres.get(ops[oi]) ?? 'Operario'}</strong><br/>${fechaCorta(fechas[fi])}: ${total - lavo} de ${total} sin lavado`;
      },
    },
    xAxis: ejeX({ type: 'category', data: fechas.map((f) => fechaCorta(f, false)) }),
    yAxis: ejeX({ type: 'category', axisLine: { show: false }, data: ops.map((o) => nombres.get(o) ?? 'Operario') }),
    visualMap: {
      min: 0, max: 0.5, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 160,
      inRange: { color: COLOR.secuencialFalla }, text: ['50 % o más', 'Sin omisiones'], textStyle: { color: COLOR.suave },
    },
    series: [{
      type: 'heatmap',
      data: celdas.filter((c) => fechas.includes(c.fecha)).map((c) => [fechas.indexOf(c.fecha), ops.indexOf(c.operarioId), (c.total - c.lavo) / c.total, c.lavo, c.total]),
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: COLOR.tinta, borderWidth: 2 } },
    }],
  }), [celdas, fechas, ops, nombres]);

  if (celdas.length === 0) return null;
  return (
    <Panel titulo="Lavado de manos">
      <div className="px-3 pb-3">
        <p className="px-2 text-sm text-tinta-suave">Lavados omitidos por persona y día, sobre los horarios establecidos. Más rojo, más omisiones.</p>
        <Grafico opcion={opcion} alto={Math.max(220, ops.length * 34 + 90)} etiqueta="Lavados de manos omitidos por persona y día" />
      </div>
    </Panel>
  );
}

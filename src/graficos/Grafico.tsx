import { useEffect, useRef } from 'react';
import { echarts } from './motor-echarts';

export type Opcion = echarts.EChartsCoreOption & { tooltip?: Record<string, unknown> };

/** Colores validados para daltonismo y contraste (ver docs del tablero). */
export const COLOR = {
  serie1: '#2a78d6',
  serie2: '#eb6834',
  critico: '#d03b3b',
  bien: '#1f9d55',
  confirmar: '#4f5bd5',
  banda: 'rgba(31,157,85,0.09)',
  tinta: '#2a1316',
  suave: '#6b5b5e',
  linea: '#d9e0e7',
  grilla: '#e9eef2',
  /** Rampa secuencial de un solo tono para "cuánto falló": claro = nada, oscuro = mucho. */
  secuencialFalla: ['#fbeceb', '#f7c9c6', '#ef9a94', '#e46a63', '#d03b3b', '#a8282b', '#7a1a1e'],
};

const fuente = '"Atkinson Hyperlegible Next", system-ui, sans-serif';

export const ejeX = (extra: Record<string, unknown> = {}) => ({
  axisLine: { lineStyle: { color: COLOR.linea } },
  axisTick: { show: false },
  axisLabel: { color: COLOR.suave, fontSize: 12, hideOverlap: true },
  splitLine: { show: false },
  ...extra,
});

export const ejeY = (extra: Record<string, unknown> = {}) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: COLOR.suave, fontSize: 12 },
  splitLine: { lineStyle: { color: COLOR.grilla } },
  ...extra,
});

const BASE = {
  textStyle: { fontFamily: fuente, color: COLOR.tinta },
  animationDuration: 500,
  grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
  tooltip: {
    backgroundColor: '#ffffff',
    borderColor: COLOR.linea,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: COLOR.tinta, fontFamily: fuente, fontSize: 13 },
    extraCssText: 'border-radius:12px; box-shadow:0 8px 24px -12px rgba(42,19,22,.35);',
  },
  legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: COLOR.tinta, fontSize: 13 } },
};

export function Grafico({ opcion, alto = 300, etiqueta }: { opcion: Opcion; alto?: number; etiqueta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const grafico = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current!;
    grafico.current = echarts.init(el, undefined, { renderer: 'svg' });
    const ro = new ResizeObserver(() => grafico.current?.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      grafico.current?.dispose();
      grafico.current = null;
    };
  }, []);

  useEffect(() => {
    grafico.current?.setOption(
      {
        ...BASE,
        ...opcion,
        grid: { ...BASE.grid, ...(opcion.grid as object) },
        tooltip: { ...BASE.tooltip, ...opcion.tooltip },
        legend: opcion.legend === undefined ? { show: false } : { ...BASE.legend, ...(opcion.legend as object) },
      },
      true,
    );
  }, [opcion]);

  return <div ref={ref} role="img" aria-label={etiqueta} style={{ height: alto, width: '100%' }} />;
}

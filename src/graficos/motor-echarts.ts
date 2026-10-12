import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

// Solo los módulos que usa la app, para que el paquete del tablero pese menos.
echarts.use([
  BarChart, LineChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent,
  MarkAreaComponent, MarkLineComponent, VisualMapComponent, SVGRenderer,
]);

export { echarts };

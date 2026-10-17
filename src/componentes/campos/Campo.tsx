import { estadoCampo } from '../../motor/evaluar';
import type { Campo as TCampo, Contexto } from '../../motor/tipos';
import {
  EntradaConforme, EntradaFecha, EntradaFoto, EntradaHora, EntradaNumero, EntradaOpcion, EntradaTexto, VistaCalculado,
} from './basicos';
import { EntradaChecklist } from './Checklist';
import { EntradaMuestras } from './Muestras';
import { TarjetaCampo } from './TarjetaCampo';

export function Campo({ campo, ctx, cambiar, diferido }: { campo: TCampo; ctx: Contexto; cambiar: (id: string, v: unknown) => void; diferido?: boolean }) {
  const valor = ctx.valores[campo.id];
  const fijar = (v: unknown) => cambiar(campo.id, v);
  const estado = estadoCampo(campo, ctx);
  const ancho = campo.tipo === 'checklist' || campo.tipo === 'muestras';

  let control;
  switch (campo.tipo) {
    case 'numero': control = <EntradaNumero campo={campo} valor={valor} ctx={ctx} cambiar={fijar} />; break;
    case 'calculado': control = <VistaCalculado campo={campo} ctx={ctx} />; break;
    case 'conforme': control = <EntradaConforme campo={campo} valor={valor} cambiar={fijar} />; break;
    case 'opcion': control = <EntradaOpcion campo={campo} valor={valor} cambiar={fijar} />; break;
    case 'texto': control = <EntradaTexto campo={campo} valor={valor} cambiar={fijar} />; break;
    case 'fecha': control = <EntradaFecha campo={campo} valor={valor} cambiar={fijar} />; break;
    case 'hora': control = <EntradaHora etiqueta={campo.etiqueta} valor={valor} cambiar={fijar} />; break;
    case 'duracion': control = <EntradaNumero campo={{ ...campo, tipo: 'numero', unidad: 's', decimales: 0 }} valor={valor} ctx={ctx} cambiar={fijar} />; break;
    case 'foto': control = <EntradaFoto valor={valor} cambiar={fijar} />; break;
    case 'checklist': control = <EntradaChecklist campo={campo} valor={valor} ctx={ctx} cambiar={fijar} />; break;
    case 'muestras': control = <EntradaMuestras campo={campo} valor={valor} ctx={ctx} cambiar={fijar} />; break;
  }

  return (
    <TarjetaCampo
      id={campo.id}
      etiqueta={campo.etiqueta}
      pcc={campo.pcc}
      estado={estado}
      ayuda={campo.ayuda}
      opcional={campo.opcional}
      diferido={diferido}
      ancho={ancho}
    >
      {control}
    </TarjetaCampo>
  );
}

import { sumarDias } from '../motor/evaluar';

const TZ = 'America/Panama';

export function hoyPanama(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function horaPanama(d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

const aFecha = (f: string) => new Date(`${f}T12:00:00Z`);

/** "lunes 12 de octubre" */
export function fechaLarga(f: string): string {
  return new Intl.DateTimeFormat('es-PA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(aFecha(f));
}

/** "12 oct 2026" */
export function fechaCorta(f: string, conAnio = true): string {
  const s = new Intl.DateTimeFormat('es-PA', {
    timeZone: 'UTC', day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}),
  }).format(aFecha(f));
  return s.replace('.', '');
}

/** "12:05 p. m." a partir de "12:05" */
export function horaLegible(h?: string): string {
  if (!h) return '';
  const [hh, mm] = h.split(':').map(Number);
  const sufijo = hh >= 12 ? 'p. m.' : 'a. m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${sufijo}`;
}

export function diasEntre(desde: string, hasta: string): string[] {
  const res: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) res.push(f);
  return res;
}

export function saludo(d = new Date()): string {
  const h = Number(horaPanama(d).slice(0, 2));
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function momentoLegible(iso: string): string {
  const d = new Date(iso);
  return `${fechaCorta(hoyPanama(d))}, ${horaLegible(horaPanama(d))}`;
}

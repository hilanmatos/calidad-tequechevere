import { Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boton, Cargando, ChipEstadoRegistro, cx, Encabezado, MensajeError, Panel, useAvisar, Vacio } from '../componentes/ui';
import { FORMATOS, formato } from '../formatos';
import { useOperarios, useProductos, useRegistros } from '../datos/hooks';
import { fechaCorta, horaLegible, hoyPanama } from '../lib/fechas';
import { sumarDias } from '../motor/evaluar';

const RANGOS = [
  { id: 'hoy', texto: 'Hoy', dias: 0 },
  { id: '7', texto: '7 días', dias: 6 },
  { id: '30', texto: '30 días', dias: 29 },
  { id: '90', texto: '90 días', dias: 89 },
  { id: 'año', texto: '1 año', dias: 364 },
];

export function Historial() {
  const hoy = hoyPanama();
  const [rango, setRango] = useState('30');
  const [desde, setDesde] = useState(sumarDias(hoy, -29));
  const [hasta, setHasta] = useState(hoy);
  const [codigo, setCodigo] = useState('');
  const [soloDesv, setSoloDesv] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [exportando, setExportando] = useState(false);
  const avisar = useAvisar();
  const { data, error, isLoading } = useRegistros({ desde, hasta, formato: codigo || undefined });
  const productos = useProductos();
  const operarios = useOperarios();

  const elegirRango = (id: string) => {
    const r = RANGOS.find((x) => x.id === id)!;
    setRango(id);
    setDesde(sumarDias(hoy, -r.dias));
    setHasta(hoy);
  };

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (soloDesv && !r.desviaciones.some((d) => d.severidad !== 'por-confirmar')) return false;
      if (!q) return true;
      const prod = productos.data?.find((p) => p.id === r.productoId);
      return [r.lote, prod?.nombre, prod?.codigo, r.area, r.realizadoPor, formato(r.formato)?.nombreCorto]
        .some((t) => t?.toLowerCase().includes(q));
    });
  }, [data, soloDesv, buscar, productos.data]);

  const exportar = async () => {
    setExportando(true);
    try {
      const { exportarRegistros } = await import('../exportar/excel');
      await exportarRegistros(filas, { desde, hasta, productos: productos.data ?? [], operarios: operarios.data ?? [] });
      avisar('Excel descargado');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo exportar.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const control = 'h-12 rounded-xl border border-linea bg-white px-3 font-bold outline-none focus:border-vino';

  return (
    <div>
      <Encabezado
        titulo="Historial"
        subtitulo="Todos los registros, con sus desviaciones y quién los hizo."
        accion={<Boton variante="primario" icono={Download} onClick={exportar} cargando={exportando} disabled={!filas.length}>Exportar a Excel</Boton>}
      />
      <Panel className="p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-xl bg-escarcha-2 p-1" role="radiogroup" aria-label="Rango de fechas">
            {RANGOS.map((r) => (
              <button
                key={r.id} type="button" role="radio" aria-checked={rango === r.id} onClick={() => elegirRango(r.id)}
                className={cx('h-10 px-3.5 rounded-lg font-bold text-sm', rango === r.id ? 'bg-white text-vino shadow-sm' : 'text-tinta-suave')}
              >
                {r.texto}
              </button>
            ))}
          </div>
          <input type="date" aria-label="Desde" className={control} value={desde} max={hasta} onChange={(e) => { setDesde(e.target.value); setRango(''); }} />
          <input type="date" aria-label="Hasta" className={control} value={hasta} min={desde} max={hoy} onChange={(e) => { setHasta(e.target.value); setRango(''); }} />
          <select aria-label="Formato" className={cx(control, 'min-w-56')} value={codigo} onChange={(e) => setCodigo(e.target.value)}>
            <option value="">Todos los formatos</option>
            {FORMATOS.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombreCorto}</option>)}
          </select>
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" className="size-5 accent-vino" checked={soloDesv} onChange={(e) => setSoloDesv(e.target.checked)} />
            Solo con desviaciones
          </label>
          <div className="relative flex-1 min-w-52">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" aria-hidden />
            <input aria-label="Buscar" placeholder="Lote, producto, área o persona" className={cx(control, 'w-full pl-10 font-normal')} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
        </div>
      </Panel>

      {error ? <MensajeError error={error} /> : isLoading ? <Cargando /> : filas.length === 0 ? (
        <Panel><Vacio titulo="No hay registros con estos filtros">Prueba con un rango de fechas más amplio o quita la búsqueda.</Vacio></Panel>
      ) : (
        <Panel className="overflow-hidden">
          <p className="px-5 pt-4 text-sm text-tinta-suave">{filas.length} {filas.length === 1 ? 'registro' : 'registros'}</p>
          <ul className="lg:hidden divide-y divide-linea px-2 pb-2">
            {filas.slice(0, 300).map((r) => {
              const def = formato(r.formato);
              const prod = productos.data?.find((p) => p.id === r.productoId);
              const n = r.desviaciones.filter((d) => d.severidad !== 'por-confirmar').length;
              return (
                <li key={r.id}>
                  <Link to={`/registro/${r.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 min-h-16 active:bg-escarcha">
                    <span className="w-20 shrink-0">
                      <span className="block font-bold">{fechaCorta(r.fecha, false)}</span>
                      {r.hora && <span className="block text-sm text-tinta-suave">{horaLegible(r.hora)}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold truncate">{def?.nombreCorto ?? r.formato}</span>
                      <span className="block text-sm text-tinta-suave truncate">{[prod?.nombre ?? r.area, r.lote && `lote ${r.lote}`].filter(Boolean).join(', ') || r.realizadoPor}</span>
                    </span>
                    <ChipEstadoRegistro desviaciones={n} pcc={r.tieneDesviacionPcc} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-tinta-suave">
                <tr className="border-b border-linea">
                  <th className="px-5 py-3 font-bold">Fecha</th>
                  <th className="px-3 py-3 font-bold">Formato</th>
                  <th className="px-3 py-3 font-bold">Producto o área</th>
                  <th className="px-3 py-3 font-bold">Lote</th>
                  <th className="px-3 py-3 font-bold">Estado</th>
                  <th className="px-5 py-3 font-bold">Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 500).map((r) => {
                  const def = formato(r.formato);
                  const prod = productos.data?.find((p) => p.id === r.productoId);
                  const n = r.desviaciones.filter((d) => d.severidad !== 'por-confirmar').length;
                  return (
                    <tr key={r.id} className="border-b border-linea/60 last:border-0 hover:bg-escarcha/70">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <Link to={`/registro/${r.id}`} className="font-bold hover:text-vino">{fechaCorta(r.fecha)}</Link>
                        {r.hora && <span className="block text-sm text-tinta-suave">{horaLegible(r.hora)}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Link to={`/registro/${r.id}`} className="hover:text-vino">{def?.nombreCorto ?? r.formato}</Link>
                        {r.origen === 'importado' && <span className="ml-2 text-xs text-tinta-suave">importado</span>}
                      </td>
                      <td className="px-3 py-3">{prod?.nombre ?? r.area ?? '—'}</td>
                      <td className="px-3 py-3 cifra">{r.lote ?? '—'}</td>
                      <td className="px-3 py-3"><ChipEstadoRegistro desviaciones={n} pcc={r.tieneDesviacionPcc} /></td>
                      <td className="px-5 py-3 text-tinta-suave">{r.realizadoPor || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filas.length > 500 && <p className="px-5 py-3 text-sm text-tinta-suave">Se muestran los 500 más recientes. Exporta a Excel para ver todos.</p>}
        </Panel>
      )}
    </div>
  );
}

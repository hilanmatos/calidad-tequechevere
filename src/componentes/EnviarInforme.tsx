import { useQuery } from '@tanstack/react-query';
import { Copy, Download, FileSpreadsheet, FileText, Send, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useSesion } from '../auth/Sesion';
import { useOperarios, useProductos, useRegistros, useRepo } from '../datos/hooks';
import { fechaCorta } from '../lib/fechas';
import { Boton, cx, Dialogo, useAvisar } from './ui';

type Tipo = 'pdf' | 'excel';

export function EnviarInforme({ desde, hasta, titulo, variante = 'primario' }: {
  desde: string; hasta: string; titulo: string; variante?: 'primario' | 'secundario';
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante={variante} icono={Send} onClick={() => setAbierto(true)}>Enviar informe</Boton>
      {abierto && <DialogoInforme desde={desde} hasta={hasta} titulo={titulo} cerrar={() => setAbierto(false)} />}
    </>
  );
}

function DialogoInforme({ desde, hasta, titulo, cerrar }: { desde: string; hasta: string; titulo: string; cerrar: () => void }) {
  const repo = useRepo();
  const { usuario } = useSesion();
  const avisar = useAvisar();
  const registros = useRegistros({ desde, hasta });
  const productos = useProductos();
  const operarios = useOperarios();
  const cierres = useQuery({ queryKey: ['cierres', desde, hasta], queryFn: () => repo.cierres(desde, hasta) });
  const [tipo, setTipo] = useState<Tipo>('pdf');
  const [trabajando, setTrabajando] = useState<'compartir' | 'descargar' | null>(null);
  const [resumen, setResumen] = useState<string>();
  const listo = !!registros.data && !!productos.data && !!operarios.data && !!cierres.data;
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const periodo = desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  const nombre = `${titulo} ${desde === hasta ? desde : `${desde} a ${hasta}`}`.replace(/[\\/:*?"<>|]/g, '');

  const datos = () => ({
    titulo, desde, hasta, registros: registros.data!, productos: productos.data!, operarios: operarios.data!,
    cierres: cierres.data!, generadoPor: usuario.nombre,
  });

  const armar = async (): Promise<File> => {
    if (tipo === 'pdf') {
      const { generarInformePdf } = await import('../exportar/informe');
      return new File([await generarInformePdf(datos())], `${nombre}.pdf`, { type: 'application/pdf' });
    }
    const { crearExcel } = await import('../exportar/excel');
    const blob = await crearExcel(registros.data!, { desde, hasta, productos: productos.data!, operarios: operarios.data! });
    return new File([blob], `${nombre}.xlsx`, { type: blob.type });
  };

  const textoResumen = async () => {
    if (resumen) return resumen;
    const { resumenTexto } = await import('../exportar/informe');
    const r = resumenTexto(datos());
    setResumen(r);
    return r;
  };

  const descargar = async (archivo?: File) => {
    const f = archivo ?? await armar();
    const { descargar: bajar } = await import('../exportar/excel');
    bajar(f, f.name);
  };

  const accion = async (cual: 'compartir' | 'descargar') => {
    setTrabajando(cual);
    try {
      if (cual === 'descargar') {
        await descargar();
        avisar('Informe descargado');
        return;
      }
      const archivo = await armar();
      const texto = await textoResumen();
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: `${titulo}, ${periodo}`, text: texto });
        avisar('Informe listo para enviar');
      } else {
        await descargar(archivo);
        avisar('Este navegador no comparte archivos: se descargó para que lo adjuntes');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // se canceló el menú de compartir
      avisar(e instanceof Error ? `No se pudo armar el informe: ${e.message}` : 'No se pudo armar el informe.', 'error');
    } finally {
      setTrabajando(null);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(await textoResumen());
      avisar('Resumen copiado');
    } catch {
      avisar('No se pudo copiar el resumen.', 'error');
    }
  };

  return (
    <Dialogo
      abierto
      cerrar={cerrar}
      titulo="Enviar informe"
      pie={
        <>
          <Boton icono={Download} onClick={() => accion('descargar')} cargando={trabajando === 'descargar'} disabled={!listo || !!trabajando}>Descargar</Boton>
          {puedeCompartir && (
            <Boton variante="primario" icono={Share2} onClick={() => accion('compartir')} cargando={trabajando === 'compartir'} disabled={!listo || !!trabajando}>
              Compartir
            </Boton>
          )}
        </>
      }
    >
      <p className="text-tinta-suave">
        {titulo}, {periodo}. {listo ? `${registros.data!.length} registros.` : 'Preparando datos…'}
      </p>
      <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de informe">
        {([
          ['pdf', FileText, 'PDF', 'Resumen con gráficos, desviaciones y acciones correctivas. Para leer y archivar.'],
          ['excel', FileSpreadsheet, 'Excel', 'Todos los datos, una hoja por formato. Para analizar.'],
        ] as const).map(([id, Icono, nombreTipo, desc]) => (
          <button
            key={id} type="button" role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)}
            className={cx('text-left rounded-2xl border-2 p-4 flex gap-3 items-start', tipo === id ? 'border-vino bg-vino/5' : 'border-linea')}
          >
            <Icono size={28} className={tipo === id ? 'text-vino' : 'text-tinta-suave'} aria-hidden />
            <span>
              <span className="block font-bold text-lg">{nombreTipo}</span>
              <span className="block text-sm text-tinta-suave">{desc}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-sm text-tinta-suave">
        {puedeCompartir
          ? 'Compartir abre el menú de la tablet para enviarlo por WhatsApp, correo o Drive.'
          : 'En este equipo el informe se descarga; luego adjúntalo al correo o al chat.'}
      </p>
      <button type="button" onClick={copiar} disabled={!listo} className="self-start h-11 px-1 font-bold text-vino flex items-center gap-2 underline underline-offset-2">
        <Copy size={18} aria-hidden /> Copiar resumen en texto
      </button>
      {resumen && <p className="rounded-xl bg-escarcha px-4 py-3 text-sm">{resumen}</p>}
    </Dialogo>
  );
}

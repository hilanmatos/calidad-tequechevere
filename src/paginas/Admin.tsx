import { Pencil, Plus, Save, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Boton, Cargando, cx, Encabezado, MensajeError, Panel, useAvisar } from '../componentes/ui';
import { FORMATOS } from '../formatos';
import { AREAS } from '../formatos/comunes';
import { useGuardarOperario, useGuardarPerfil, useGuardarProducto, useOperarios, usePerfiles, useProductos, useRepo } from '../datos/hooks';
import type { Perfil } from '../datos/repositorio';
import { fmt } from '../motor/evaluar';
import type { Operario, Producto } from '../motor/tipos';

type Pestana = 'productos' | 'operarios' | 'usuarios';

const entrada = 'h-12 w-full rounded-xl border border-linea bg-white px-3 outline-none focus:border-vino';
const LINEAS = FORMATOS.filter((f) => f.usaProducto);

export function Admin() {
  const [pestana, setPestana] = useState<Pestana>('productos');
  return (
    <div>
      <Encabezado titulo="Administración" subtitulo="Catálogos que usan los formatos: productos con sus pesos, operarios por área y usuarios." />
      <div className="flex rounded-xl bg-escarcha-2 p-1 w-fit mb-5" role="tablist">
        {([['productos', 'Productos'], ['operarios', 'Operarios'], ['usuarios', 'Usuarios']] as const).map(([id, texto]) => (
          <button
            key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)}
            className={cx('h-11 px-5 rounded-lg font-bold', pestana === id ? 'bg-white text-vino shadow-sm' : 'text-tinta-suave')}
          >
            {texto}
          </button>
        ))}
      </div>
      {pestana === 'productos' && <Productos />}
      {pestana === 'operarios' && <Operarios />}
      {pestana === 'usuarios' && <Usuarios />}
    </div>
  );
}

function Campo({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1 text-sm font-bold', className)}>
      {etiqueta}
      {children}
    </label>
  );
}

const nuevoProducto = (): Producto => ({
  id: '', codigo: '', nombre: '', linea: LINEAS[0].codigo, presentacion: '', llevaRelleno: true, esPrecocido: false, llevaCongelacion: true, activo: true, vidaUtilMeses: 6,
});

function NumeroOpcional({ valor, cambiar, etiqueta }: { valor?: number; cambiar: (v?: number) => void; etiqueta: string }) {
  return (
    <Campo etiqueta={etiqueta}>
      <input
        inputMode="decimal" className={cx(entrada, 'cifra')} value={valor ?? ''}
        onChange={(e) => { const t = e.target.value.replace(',', '.'); cambiar(t === '' || Number.isNaN(Number(t)) ? undefined : Number(t)); }}
      />
    </Campo>
  );
}

function Productos() {
  const { data, isLoading, error } = useProductos();
  const guardar = useGuardarProducto();
  const avisar = useAvisar();
  const [editando, setEditando] = useState<Producto | null>(null);

  const enviar = async () => {
    if (!editando || !editando.nombre.trim()) return;
    try {
      await guardar.mutateAsync({ ...editando, nombre: editando.nombre.trim(), codigo: editando.codigo.trim() });
      avisar('Producto guardado');
      setEditando(null);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se guardó el producto.', 'error');
    }
  };
  const p = editando;
  const fijar = (c: Partial<Producto>) => setEditando((x) => (x ? { ...x, ...c } : x));

  if (error) return <MensajeError error={error} />;
  if (isLoading) return <Cargando />;

  return (
    <div className="flex flex-col gap-5">
      {p ? (
        <Panel titulo={p.id ? 'Editar producto' : 'Nuevo producto'} accion={<Boton variante="fantasma" icono={X} onClick={() => setEditando(null)}>Cancelar</Boton>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
            <Campo etiqueta="Línea">
              <select className={entrada} value={p.linea} onChange={(e) => fijar({ linea: e.target.value })}>
                {LINEAS.map((f) => <option key={f.codigo} value={f.codigo}>{f.rotulo} {f.nombreCorto}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Código"><input className={entrada} value={p.codigo} onChange={(e) => fijar({ codigo: e.target.value })} placeholder="PT013" /></Campo>
            <Campo etiqueta="Nombre" className="sm:col-span-2"><input className={entrada} value={p.nombre} onChange={(e) => fijar({ nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Presentación"><input className={entrada} value={p.presentacion} onChange={(e) => fijar({ presentacion: e.target.value })} placeholder="20 unidades" /></Campo>
            <NumeroOpcional etiqueta="Peso teórico por unidad (g)" valor={p.pesoUnidadG} cambiar={(v) => fijar({ pesoUnidadG: v })} />
            <NumeroOpcional etiqueta="Peso mínimo por unidad (g)" valor={p.pesoUnidadMinG} cambiar={(v) => fijar({ pesoUnidadMinG: v })} />
            <NumeroOpcional etiqueta="Peso máximo por unidad (g)" valor={p.pesoUnidadMaxG} cambiar={(v) => fijar({ pesoUnidadMaxG: v })} />
            <NumeroOpcional etiqueta="Peso teórico del relleno (g)" valor={p.pesoRellenoG} cambiar={(v) => fijar({ pesoRellenoG: v })} />
            <NumeroOpcional etiqueta="Relleno mínimo por pieza (g)" valor={p.pesoRellenoMinG} cambiar={(v) => fijar({ pesoRellenoMinG: v })} />
            <NumeroOpcional etiqueta="Relleno máximo por pieza (g)" valor={p.pesoRellenoMaxG} cambiar={(v) => fijar({ pesoRellenoMaxG: v })} />
            <NumeroOpcional etiqueta="Peso declarado del empaque (kg)" valor={p.pesoDeclaradoKg} cambiar={(v) => fijar({ pesoDeclaradoKg: v })} />
            <NumeroOpcional etiqueta="Vida útil (meses)" valor={p.vidaUtilMeses} cambiar={(v) => fijar({ vidaUtilMeses: v })} />
            <div className="flex flex-col gap-2 justify-end">
              {([['llevaRelleno', 'Lleva relleno'], ['esPrecocido', 'Es precocido (se fríe)'], ['llevaCongelacion', 'Pasa por congelación'], ['activo', 'Activo']] as const).map(([k, t]) => (
                <label key={k} className="flex items-center gap-2 font-bold">
                  {/* sin dato, llevaCongelacion cuenta como sí */}
                  <input type="checkbox" className="size-5 accent-vino" checked={p[k] !== false} onChange={(e) => fijar({ [k]: e.target.checked })} /> {t}
                </label>
              ))}
            </div>
          </div>
          <div className="px-5 pb-5">
            <Boton variante="primario" icono={Save} onClick={enviar} cargando={guardar.isPending} disabled={!p.nombre.trim()}>Guardar producto</Boton>
          </div>
        </Panel>
      ) : (
        <div><Boton variante="primario" icono={Plus} onClick={() => setEditando(nuevoProducto())}>Agregar producto</Boton></div>
      )}

      {LINEAS.map((linea) => {
        const ps = (data ?? []).filter((x) => x.linea === linea.codigo);
        return (
          <Panel key={linea.codigo} titulo={`${linea.rotulo} ${linea.nombreCorto}`}>
            {ps.length === 0 ? <p className="px-5 pb-5 pt-2 text-tinta-suave">Sin productos en esta línea.</p> : (
              <div className="overflow-x-auto px-2 pb-2">
                <table className="w-full text-left text-sm">
                  <thead className="text-tinta-suave">
                    <tr className="border-b border-linea">
                      <th className="px-3 py-2">Código</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Peso por unidad</th>
                      <th className="px-3 py-2">Relleno</th><th className="px-3 py-2">Empaque</th><th className="px-3 py-2">Vida útil</th><th className="px-3 py-2">Estado</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {ps.map((x) => (
                      <tr key={x.id} className={cx('border-b border-linea/60 last:border-0', !x.activo && 'opacity-50')}>
                        <td className="px-3 py-2.5 font-bold">{x.codigo || '—'}</td>
                        <td className="px-3 py-2.5"><strong>{x.nombre}</strong><span className="block text-tinta-suave">{x.presentacion}{x.esPrecocido ? ', precocido' : ''}{x.llevaCongelacion === false ? ', sin congelación' : ''}</span></td>
                        <td className="px-3 py-2.5 cifra">
                          {x.pesoUnidadG !== undefined ? `${fmt(x.pesoUnidadG)} g` : <span className="text-confirmar">sin cargar</span>}
                          {(x.pesoUnidadMinG !== undefined || x.pesoUnidadMaxG !== undefined) && <span className="block text-tinta-suave">{fmt(x.pesoUnidadMinG)} a {fmt(x.pesoUnidadMaxG)} g</span>}
                        </td>
                        <td className="px-3 py-2.5 cifra">
                          {x.llevaRelleno ? (x.pesoRellenoG !== undefined ? `${fmt(x.pesoRellenoG)} g` : '—') : 'No lleva'}
                          {x.llevaRelleno && (x.pesoRellenoMinG !== undefined || x.pesoRellenoMaxG !== undefined) && <span className="block text-tinta-suave whitespace-nowrap">{fmt(x.pesoRellenoMinG)} a {fmt(x.pesoRellenoMaxG)} g</span>}
                        </td>
                        <td className="px-3 py-2.5 cifra">{x.pesoDeclaradoKg !== undefined ? `${fmt(x.pesoDeclaradoKg)} kg` : <span className="text-confirmar">sin cargar</span>}</td>
                        <td className="px-3 py-2.5">{x.vidaUtilMeses ? `${x.vidaUtilMeses} meses` : '—'}</td>
                        <td className="px-3 py-2.5">{x.activo ? 'Activo' : 'Inactivo'}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" onClick={() => setEditando(x)} className="size-10 rounded-lg grid place-items-center text-tinta-suave hover:bg-escarcha-2 hover:text-vino" aria-label={`Editar ${x.nombre}`}>
                            <Pencil size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

function Operarios() {
  const { data, isLoading, error } = useOperarios();
  const guardar = useGuardarOperario();
  const avisar = useAvisar();
  const [nuevo, setNuevo] = useState<Operario>({ id: '', nombre: '', area: AREAS[0], activo: true });
  const [editando, setEditando] = useState<string>();

  const enviar = async (o: Operario) => {
    if (!o.nombre.trim()) return;
    try {
      await guardar.mutateAsync({ ...o, nombre: o.nombre.trim() });
      avisar(o.id ? 'Operario actualizado' : 'Operario agregado');
      if (!o.id) setNuevo({ ...nuevo, nombre: '' });
      setEditando(undefined);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se guardó el operario.', 'error');
    }
  };

  if (error) return <MensajeError error={error} />;
  if (isLoading) return <Cargando />;

  return (
    <div className="flex flex-col gap-5">
      <Panel titulo="Agregar operario">
        <form className="flex flex-wrap items-end gap-3 p-5" onSubmit={(e) => { e.preventDefault(); enviar(nuevo); }}>
          <Campo etiqueta="Nombre y apellido" className="flex-1 min-w-60"><input className={entrada} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Área">
            <select className={entrada} value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })}>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Campo>
          <Boton type="submit" variante="primario" icono={Plus} cargando={guardar.isPending} disabled={!nuevo.nombre.trim()}>Agregar</Boton>
        </form>
      </Panel>
      <div className="grid lg:grid-cols-2 gap-5">
        {AREAS.map((area) => {
          const os = (data ?? []).filter((o) => o.area === area);
          return (
            <Panel key={area} titulo={`${area} (${os.filter((o) => o.activo).length} activos)`}>
              <ul className="divide-y divide-linea px-5 pb-3">
                {os.length === 0 && <li className="py-3 text-tinta-suave">Sin operarios.</li>}
                {os.map((o) => (
                  <li key={o.id} className="py-2.5 flex items-center gap-3">
                    {editando === o.id ? (
                      <FilaOperario o={o} guardar={enviar} cancelar={() => setEditando(undefined)} />
                    ) : (
                      <>
                        <span className={cx('flex-1 font-bold', !o.activo && 'text-tinta-suave line-through')}>{o.nombre}</span>
                        <button type="button" className="text-sm font-bold text-vino hover:underline" onClick={() => enviar({ ...o, activo: !o.activo })}>
                          {o.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button type="button" onClick={() => setEditando(o.id)} className="size-10 rounded-lg grid place-items-center text-tinta-suave hover:bg-escarcha-2" aria-label={`Editar ${o.nombre}`}>
                          <Pencil size={18} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function FilaOperario({ o, guardar, cancelar }: { o: Operario; guardar: (o: Operario) => void; cancelar: () => void }) {
  const [x, setX] = useState(o);
  return (
    <form className="flex flex-wrap gap-2 w-full" onSubmit={(e) => { e.preventDefault(); guardar(x); }}>
      <input aria-label="Nombre" className={cx(entrada, 'flex-1 min-w-40')} value={x.nombre} onChange={(e) => setX({ ...x, nombre: e.target.value })} />
      <select aria-label="Área" className={cx(entrada, 'w-auto')} value={x.area} onChange={(e) => setX({ ...x, area: e.target.value })}>
        {AREAS.map((a) => <option key={a}>{a}</option>)}
      </select>
      <Boton type="submit" variante="vino" icono={Save}>Guardar</Boton>
      <Boton variante="fantasma" onClick={cancelar}>Cancelar</Boton>
    </form>
  );
}

function Usuarios() {
  const repo = useRepo();
  const { data, isLoading, error } = usePerfiles();
  const guardar = useGuardarPerfil();
  const avisar = useAvisar();

  const cambiar = async (p: Perfil) => {
    try {
      await guardar.mutateAsync(p);
      avisar('Usuario actualizado');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se guardó el usuario.', 'error');
    }
  };

  if (error) return <MensajeError error={error} />;
  if (isLoading) return <Cargando />;

  return (
    <div className="flex flex-col gap-5">
      <Panel className="p-5">
        <p className="max-w-3xl">
          Las cuentas nuevas se crean en Supabase, en <strong>Authentication, Users, Add user</strong>, con correo y contraseña.
          Al crearse aparecen aquí como capturistas. El nombre que pongas aquí es el que sale en "Realizado por".
          {repo.modo === 'demo' && <span className="block mt-2 text-confirmar">En modo demo solo existe el usuario de prueba.</span>}
        </p>
      </Panel>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-tinta-suave">
              <tr className="border-b border-linea"><th className="px-5 py-3">Nombre</th><th className="px-3 py-3">Correo</th><th className="px-3 py-3">Rol</th><th className="px-5 py-3">Estado</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="border-b border-linea/60 last:border-0">
                  <td className="px-5 py-2.5">
                    <input
                      aria-label={`Nombre de ${p.correo}`} defaultValue={p.nombre} className={cx(entrada, 'font-bold')}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.nombre && cambiar({ ...p, nombre: e.target.value.trim() })}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-tinta-suave">{p.correo}</td>
                  <td className="px-3 py-2.5">
                    <select aria-label="Rol" className={entrada} value={p.rol} onChange={(e) => cambiar({ ...p, rol: e.target.value as Perfil['rol'] })}>
                      <option value="capturista">Capturista</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="px-5 py-2.5">
                    <label className="flex items-center gap-2 font-bold">
                      <input type="checkbox" className="size-5 accent-vino" checked={p.activo} onChange={(e) => cambiar({ ...p, activo: e.target.checked })} />
                      Activo
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-sm text-tinta-suave">Los campos y límites de los {FORMATOS.length} formatos se cambian en el código, en la carpeta src/formatos del repositorio.</p>
    </div>
  );
}

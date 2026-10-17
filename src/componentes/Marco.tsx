import { ChartColumn, History, House, LogOut, RefreshCw, Settings, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { useRepo } from '../datos/hooks';
import { reiniciarDemo } from '../datos/repo-local';
import { cx } from './ui';

interface ItemNav { to: string; etiqueta: string; icono: LucideIcon; soloAdmin?: boolean }

const NAV: ItemNav[] = [
  { to: '/', etiqueta: 'Hoy', icono: House },
  { to: '/historial', etiqueta: 'Historial', icono: History },
  { to: '/tablero', etiqueta: 'Tablero', icono: ChartColumn },
  { to: '/admin', etiqueta: 'Admin', icono: Settings, soloAdmin: true },
];

const iniciales = (n: string) => n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export function Marco() {
  const { usuario, salir } = useSesion();
  const repo = useRepo();
  const { pathname } = useLocation();
  const enCaptura = pathname.startsWith('/registrar') || pathname.endsWith('/editar') || pathname.endsWith('/completar');
  const items = NAV.filter((i) => !i.soloAdmin || usuario.rol === 'admin');

  return (
    <div className="min-h-dvh lg:pl-28">
      {/* Riel lateral: tablet horizontal y computadora */}
      <aside className="no-imprimir hidden lg:flex fixed inset-y-0 left-0 w-28 flex-col items-center bg-vino text-white py-5 z-30">
        <NavLink to="/" aria-label="Inicio" className="mb-8">
          <img src="logo.png" alt="" className="size-16 drop-shadow-md" />
        </NavLink>
        <nav className="flex flex-col gap-2 w-full px-3">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) => cx(
                'flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-bold transition-colors',
                isActive ? 'bg-dorado text-vino-oscuro' : 'text-white/75 hover:bg-white/10 hover:text-white',
              )}
            >
              <i.icono size={24} aria-hidden />
              {i.etiqueta}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-3">
          <div title={usuario.nombre} className="size-11 rounded-full bg-white/15 grid place-items-center font-display font-bold">
            {iniciales(usuario.nombre)}
          </div>
          <button type="button" onClick={salir} className="min-h-12 w-20 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs text-white/70 hover:text-white hover:bg-white/10">
            <LogOut size={20} aria-hidden /> Salir
          </button>
        </div>
      </aside>

      {/* Cabecera compacta: tablet vertical y teléfono */}
      <header className="no-imprimir lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-vino text-white px-4 h-16">
        <img src="logo.png" alt="" className="size-10" />
        <span className="font-display text-xl font-extrabold">Calidad Chévere</span>
        <button type="button" onClick={salir} className="ml-auto h-12 pl-1.5 pr-4 rounded-full flex items-center gap-2 text-sm font-bold text-white/90 bg-white/10">
          <span className="size-9 rounded-full bg-white/15 grid place-items-center">{iniciales(usuario.nombre)}</span>
          <LogOut size={18} aria-hidden /> Salir
        </button>
      </header>

      {repo.modo === 'demo' && (
        <div className="no-imprimir bg-dorado-claro text-vino-oscuro text-sm px-4 py-2 flex items-center justify-center gap-3">
          <span><strong>Modo demo.</strong> Datos de prueba guardados solo en este navegador; aún no está conectada la base de datos.</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 h-10 px-2 font-bold underline underline-offset-2"
            onClick={() => { reiniciarDemo(); location.reload(); }}
          >
            <RefreshCw size={14} aria-hidden /> Reiniciar demo
          </button>
        </div>
      )}

      <main className={cx('mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 py-6 lg:py-8', enCaptura ? 'pb-36 lg:pb-36' : 'pb-28 lg:pb-12')}>
        <Outlet />
      </main>

      {!enCaptura && (
        <nav className="no-imprimir lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-linea flex justify-around pb-[env(safe-area-inset-bottom)]">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) => cx(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold',
                isActive ? 'text-vino' : 'text-tinta-suave',
              )}
            >
              {({ isActive }) => (
                <>
                  <span className={cx('rounded-full px-4 py-1', isActive && 'bg-dorado-claro')}><i.icono size={22} aria-hidden /></span>
                  {i.etiqueta}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

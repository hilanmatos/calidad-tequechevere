import { LogIn } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Boton, Cargando } from '../componentes/ui';
import { useRepo } from '../datos/hooks';
import type { Usuario } from '../datos/repositorio';

interface ValorSesion {
  usuario: Usuario;
  salir: () => Promise<void>;
}

const SesionContexto = createContext<ValorSesion | null>(null);

export function useSesion(): ValorSesion {
  const v = useContext(SesionContexto);
  if (!v) throw new Error('Falta ProveedorSesion');
  return v;
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [errorInicial, setErrorInicial] = useState<string>();

  useEffect(() => {
    repo.sesion().then(setUsuario).catch((e: Error) => { setErrorInicial(e.message); setUsuario(null); });
    return repo.alCambiarSesion((u) => setUsuario(u));
  }, [repo]);

  if (usuario === undefined) return <Cargando texto="Abriendo sesión…" />;
  if (usuario === null) return <Ingreso alIngresar={setUsuario} errorInicial={errorInicial} />;

  const salir = async () => {
    await repo.salir();
    qc.clear();
    setUsuario(null);
  };
  return <SesionContexto.Provider value={{ usuario, salir }}>{children}</SesionContexto.Provider>;
}

function Ingreso({ alIngresar, errorInicial }: { alIngresar: (u: Usuario) => void; errorInicial?: string }) {
  const repo = useRepo();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(errorInicial);
  const [enviando, setEnviando] = useState(false);
  const demo = repo.modo === 'demo';

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    setEnviando(true);
    setError(undefined);
    try {
      alIngresar(await repo.ingresar(correo.trim(), clave));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ingresar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative overflow-hidden bg-vino text-white flex flex-col justify-between p-8 lg:p-14">
        <div aria-hidden className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-vino-2/60" />
        <div aria-hidden className="absolute -right-28 bottom-[-12rem] size-[22rem] rounded-full border-[28px] border-dorado/90" />
        <img src="logo.png" alt="Teque Chévere" className="relative size-24 lg:size-32 drop-shadow-xl" />
        <div className="relative mt-10 lg:mt-0 max-w-lg">
          <h1 className="font-display text-5xl lg:text-7xl font-extrabold leading-[0.95] tracking-tight">
            Calidad<br />Chévere
          </h1>
          <p className="mt-5 text-lg text-white/80 max-w-sm">
            Los registros de calidad de la planta, llenados en el momento y listos para la auditoría.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 lg:p-14">
        <form onSubmit={enviar} className="w-full max-w-sm flex flex-col gap-5">
          <div>
            <h2 className="text-3xl font-extrabold">Ingresar</h2>
            <p className="text-tinta-suave mt-1">
              {demo ? 'Modo demo: los datos de prueba se guardan solo en este navegador.' : 'Usa el correo que te asignó el administrador.'}
            </p>
          </div>
          {!demo && (
            <>
              <label className="flex flex-col gap-1.5 font-bold">
                Correo
                <input
                  type="email" autoComplete="username" required value={correo} onChange={(e) => setCorreo(e.target.value)}
                  className="h-14 rounded-campo border border-linea bg-white px-4 text-lg font-normal focus:border-vino outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 font-bold">
                Contraseña
                <input
                  type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)}
                  className="h-14 rounded-campo border border-linea bg-white px-4 text-lg font-normal focus:border-vino outline-none"
                />
              </label>
            </>
          )}
          {error && <p role="alert" className="rounded-campo bg-fuera-claro text-fuera px-4 py-3 font-bold">{error}</p>}
          <Boton type="submit" variante="primario" tam="lg" icono={LogIn} cargando={enviando}>
            {demo ? 'Entrar al demo' : 'Ingresar'}
          </Boton>
        </form>
      </section>
    </main>
  );
}

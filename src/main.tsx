import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { ProveedorSesion } from './auth/Sesion';
import { ProveedorAvisos } from './componentes/ui';
import { RepoContexto } from './datos/hooks';
import { repoLocal } from './datos/repo-local';
import { repoSupabase } from './datos/repo-supabase';
import { supabase } from './lib/supabase';
import './estilos.css';

const repo = supabase ? repoSupabase(supabase) : repoLocal();
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepoContexto.Provider value={repo}>
      <QueryClientProvider client={qc}>
        <ProveedorAvisos>
          <HashRouter>
            <ProveedorSesion>
              <App />
            </ProveedorSesion>
          </HashRouter>
        </ProveedorAvisos>
      </QueryClientProvider>
    </RepoContexto.Provider>
  </StrictMode>,
);

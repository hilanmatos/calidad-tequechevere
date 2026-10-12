import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSesion } from './auth/Sesion';
import { Marco } from './componentes/Marco';
import { Cargando } from './componentes/ui';
import { Captura } from './paginas/Captura';
import { Historial } from './paginas/Historial';
import { Hoy } from './paginas/Hoy';
import { DetalleRegistro } from './paginas/Registro';

// El tablero y la administración cargan ECharts y ExcelJS: se bajan solo cuando se usan.
const Tablero = lazy(() => import('./paginas/Tablero').then((m) => ({ default: m.Tablero })));
const Admin = lazy(() => import('./paginas/Admin').then((m) => ({ default: m.Admin })));

export function App() {
  const { usuario } = useSesion();
  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={<Hoy />} />
        <Route path="registrar/:codigo" element={<Captura />} />
        <Route path="registro/:id" element={<DetalleRegistro />} />
        <Route path="registro/:id/editar" element={<Captura />} />
        <Route path="historial" element={<Historial />} />
        <Route path="tablero" element={<Suspense fallback={<Cargando />}><Tablero /></Suspense>} />
        {usuario.rol === 'admin' && (
          <Route path="admin" element={<Suspense fallback={<Cargando />}><Admin /></Suspense>} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

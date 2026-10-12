import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { Operario, Producto } from '../motor/tipos';
import type { CierreDia, FiltroRegistros, NuevoRegistro, Perfil, Repositorio } from './repositorio';

export const RepoContexto = createContext<Repositorio | null>(null);

export function useRepo(): Repositorio {
  const repo = useContext(RepoContexto);
  if (!repo) throw new Error('Falta RepoContexto');
  return repo;
}

export function useProductos() {
  const repo = useRepo();
  return useQuery({ queryKey: ['productos'], queryFn: () => repo.productos(), staleTime: 5 * 60_000 });
}

export function useOperarios() {
  const repo = useRepo();
  return useQuery({ queryKey: ['operarios'], queryFn: () => repo.operarios(), staleTime: 5 * 60_000 });
}

export function usePerfiles() {
  const repo = useRepo();
  return useQuery({ queryKey: ['perfiles'], queryFn: () => repo.perfiles() });
}

export function useRegistros(filtro: FiltroRegistros) {
  const repo = useRepo();
  return useQuery({ queryKey: ['registros', filtro], queryFn: () => repo.registros(filtro), staleTime: 30_000 });
}

export function useRegistro(id?: string) {
  const repo = useRepo();
  return useQuery({ queryKey: ['registro', id], queryFn: () => repo.registro(id!), enabled: !!id });
}

export function useHistorial(id?: string) {
  const repo = useRepo();
  return useQuery({ queryKey: ['historial', id], queryFn: () => repo.historial(id!), enabled: !!id });
}

export function useGuardarRegistro() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: NuevoRegistro) => repo.guardarRegistro(r),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['registros'] });
      qc.invalidateQueries({ queryKey: ['registro', r.id] });
      qc.invalidateQueries({ queryKey: ['historial', r.id] });
    },
  });
}

export function useEliminarRegistro() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.eliminarRegistro(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registros'] }),
  });
}

export function useGuardarProducto() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Producto) => repo.guardarProducto(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });
}

export function useGuardarOperario() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (o: Operario) => repo.guardarOperario(o),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operarios'] }),
  });
}

export function useGuardarPerfil() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Perfil) => repo.guardarPerfil(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfiles'] }),
  });
}

export function useCierre(fecha: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ['cierres', fecha],
    queryFn: async () => (await repo.cierres(fecha, fecha))[0] ?? null,
    staleTime: 30_000,
  });
}

export function useCerrarDia() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Omit<CierreDia, 'cerradoEn' | 'cerradoPor'>) => repo.cerrarDia(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cierres'] }),
  });
}

export function useReabrirDia() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fecha: string) => repo.reabrirDia(fecha),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cierres'] }),
  });
}

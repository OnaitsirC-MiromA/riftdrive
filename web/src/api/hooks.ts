import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type FileStatus, type Job, type Settings } from './client';

const ACTIVE: Job['status'][] = ['running', 'queued'];
export const isActive = (j: Job) => ACTIVE.includes(j.status);
export const isPaused = (j: Job) => j.status.startsWith('paused');
export const isFinished = (j: Job) => j.status === 'done' || j.status === 'canceled' || j.status === 'failed';

export const useInfo = () => useQuery({ queryKey: ['info'], queryFn: api.info });
export const useAuthClient = () => useQuery({ queryKey: ['authClient'], queryFn: api.authClient });
export const useAccounts = () => useQuery({ queryKey: ['accounts'], queryFn: api.accounts, select: (d) => d.accounts });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.settings });
export const useQuota = (accountId?: string) => useQuery({ queryKey: ['quota', accountId ?? 'default'], queryFn: () => api.quota(accountId), retry: false });
export const useCopies = () => useQuery({ queryKey: ['copies'], queryFn: api.copies, select: (d) => d.copies });

// Enquanto houver cópia andando, a lista se atualiza a cada 2 s.
export const useJobs = () =>
  useQuery({
    queryKey: ['jobs'],
    queryFn: api.jobs,
    select: (d) => d.jobs,
    refetchInterval: (q) => (q.state.data?.jobs.some(isActive) ? 2000 : 10_000),
  });

export const useJob = (id: string) =>
  useQuery({
    queryKey: ['job', id],
    queryFn: () => api.job(id),
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.job) ? 2000 : false),
  });

export const useJobFiles = (id: string, status?: FileStatus, limit = 200, offset = 0) =>
  useQuery({ queryKey: ['jobFiles', id, status ?? 'all', limit, offset], queryFn: () => api.jobFiles(id, status, limit, offset), select: (d) => d.files });

export const useFolders = (accountId: string | undefined, parentId: string, q = '') =>
  useQuery({ queryKey: ['folders', accountId, parentId, q], queryFn: () => api.folders(accountId!, parentId, q), enabled: Boolean(accountId), select: (d) => d.folders });

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useJobActions() {
  const invalidate = useInvalidate();
  const after = () => invalidate('jobs', 'job', 'quota', 'copies');
  return {
    pause: useMutation({ mutationFn: api.pauseJob, onSettled: after }),
    resume: useMutation({ mutationFn: api.resumeJob, onSettled: after }),
    cancel: useMutation({ mutationFn: api.cancelJob, onSettled: after }),
    remove: useMutation({ mutationFn: api.deleteJob, onSettled: after }),
  };
}

// Criou uma pasta: toda lista de pastas em cache pode estar desatualizada.
export function useCreateFolder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: api.createFolder, onSuccess: () => invalidate('folders') });
}

export function useCreateJob() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: api.createJob, onSuccess: () => invalidate('jobs', 'quota') });
}

export function useAccountActions() {
  const invalidate = useInvalidate();
  const after = () => invalidate('accounts', 'info', 'quota');
  return {
    remove: useMutation({ mutationFn: api.removeAccount, onSettled: after }),
    setDefault: useMutation({ mutationFn: api.setDefaultAccount, onSettled: after }),
    test: useMutation({ mutationFn: api.testAccount, onSettled: after }),
  };
}

export function usePatchSettings() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: Partial<Settings>) => api.patchSettings(body), onSettled: () => invalidate('settings', 'quota') });
}

export function useCopyActions() {
  const invalidate = useInvalidate();
  return {
    check: useMutation({ mutationFn: api.checkCopy, onSettled: () => invalidate('copies') }),
    sync: useMutation({ mutationFn: ({ id, folders }: { id: string; folders: string[] }) => api.syncCopy(id, folders), onSettled: () => invalidate('copies', 'jobs') }),
    remove: useMutation({ mutationFn: api.deleteCopy, onSettled: () => invalidate('copies') }),
  };
}

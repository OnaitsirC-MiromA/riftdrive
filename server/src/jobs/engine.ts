import type { JobRow } from '../types';
import type { AccountsRepo } from '../auth/accounts';
import type { DriveClient } from '../drive/client';
import type { QuotaService } from '../drive/quota';
import { runRift } from '../drive/copier';
import { runMachine } from '../drive/transfer';
import { DriveError } from '../drive/errors';
import { classifyFailure, type PauseReason } from '../drive/outcomes';
import type { RunContext } from '../drive/run-loop';
import { ensureDestFolder, finalizeName } from './naming';
import type { JobsRepo } from './repo';
import { t } from '../i18n/strings';

export interface EngineDeps {
  repo: JobsRepo;
  accountsRepo: AccountsRepo;
  clientFor: (accountId: string) => DriveClient;
  quota: QuotaService;
  now?: () => number;
  log?: (message: string) => void;
  runners?: { rift: typeof runRift; machine: typeof runMachine };
  concurrency?: { rift: number; machine: number };
  chunkSize?: number;
}

export interface JobStats {
  bytesPerSec: number;
  etaSec: number | null;
}

interface Running {
  id: string;
  abort: AbortController;
  pauseRequested: boolean;
  cancelRequested: boolean;
  samples: { t: number; bytes: number }[];
}

const SPEED_WINDOW_MS = 30_000;
const TERMINAL = new Set(['done', 'canceled', 'failed']);

/**
 * O motor: um job por vez, na ordem da fila.
 *
 * A cada tick, jobs pausados cujo horário chegou voltam para a fila; se nada
 * está rodando, o próximo `queued` começa. O job roda até concluir, pausar
 * (cota, conta, espaço, rede) ou ser interrompido pelo usuário. Tudo o que o
 * motor sabe sobre um job está no banco — reiniciar o app só recoloca na fila
 * o que estava no meio.
 */
export class JobEngine {
  private running: Running | null = null;
  private timer: NodeJS.Timeout | null = null;
  private now: () => number;

  constructor(private deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick().catch((err) => this.deps.log?.(`tick: ${err instanceof Error ? err.message : err}`)), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running?.abort.abort();
  }

  // O processo morreu com um job rodando: ele volta à fila e recomeça do
  // inventário (o que está `done` não se repete).
  recoverOnBoot(): void {
    for (const j of this.deps.repo.listByStatus(['running'])) this.deps.repo.update(j.id, { status: 'queued' });
  }

  async tick(): Promise<void> {
    const { repo } = this.deps;
    const now = this.now();
    for (const j of repo.listByStatus(['paused_quota', 'paused_offline'])) {
      if (j.paused_until !== null && j.paused_until <= now) repo.update(j.id, { status: 'queued', paused_until: null, resume_reason: null });
    }
    if (this.running) return;
    const next = repo.listByStatus(['queued'])[0];
    if (!next) return;

    const state: Running = { id: next.id, abort: new AbortController(), pauseRequested: false, cancelRequested: false, samples: [] };
    this.running = state;
    try {
      await this.runJob(next, state);
    } finally {
      if (this.running === state) this.running = null;
    }
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  private async runJob(job: JobRow, state: Running): Promise<void> {
    const { repo, quota } = this.deps;
    repo.update(job.id, { status: 'running', started_at: job.started_at ?? this.iso(), paused_until: null, resume_reason: null, message: null });
    this.deps.log?.(`iniciando "${job.name}" (${job.path})`);

    try {
      const destClient = this.deps.clientFor(job.dest_account_id);
      await ensureDestFolder(job, destClient, repo);
      const fresh = repo.get(job.id)!;
      const concurrency = this.deps.concurrency ?? { rift: 4, machine: 2 };
      const ctx: RunContext = {
        job: fresh,
        repo,
        quota,
        signal: state.abort.signal,
        now: this.now,
        concurrency: fresh.path === 'rift' ? concurrency.rift : concurrency.machine,
        onProgress: (bytes) => this.sample(state, bytes),
      };
      const runners = this.deps.runners ?? { rift: runRift, machine: runMachine };
      const result =
        fresh.path === 'rift'
          ? await runners.rift({ ...ctx, client: destClient })
          : await runners.machine({ ...ctx, reader: this.deps.clientFor(fresh.src_reader_account_id), writer: destClient, chunkSize: this.deps.chunkSize });

      repo.recount(job.id);
      if (result.kind === 'completed') await this.finalize(repo.get(job.id)!, destClient);
      else if (result.kind === 'paused') this.applyPause(job, result.reason);
      else if (state.cancelRequested) repo.update(job.id, { status: 'canceled', finished_at: this.iso() });
      else repo.update(job.id, { status: 'paused', paused_until: null, resume_reason: null });
    } catch (err) {
      // Falhou antes/fora do laço (ex.: criar a pasta de destino). Classificar
      // aqui evita que uma conta desconectada vire "failed" definitivo.
      const message = err instanceof Error ? err.message : String(err);
      const kind = classifyFailure(err);
      const accountId = err instanceof DriveError ? err.accountId : undefined;
      if (kind === 'pause_auth') this.applyPause(job, { kind: 'auth', until: null, message: t.jobs.auth, accountId });
      else if (kind === 'pause_storage') this.applyPause(job, { kind: 'storage', until: null, message: t.jobs.storage });
      else if (kind === 'pause_offline') this.applyPause(job, { kind: 'offline', until: this.now() + 60_000, message: t.jobs.offline });
      else if (kind === 'pause_quota' || kind === 'transient') this.applyPause(job, { kind: 'quota', until: this.now() + 3_600_000, message: t.jobs.dailyLimit });
      else repo.update(job.id, { status: 'failed', finished_at: this.iso(), message });
      this.deps.log?.(`"${job.name}": ${message}`);
    }
  }

  private async finalize(job: JobRow, destClient: DriveClient): Promise<void> {
    const { repo } = this.deps;
    await finalizeName(job, destClient);
    const counts = repo.fileCounts(job.id);
    const copy = repo.upsertCopy({
      srcFolderId: job.src_folder_id,
      srcReaderAccountId: job.src_reader_account_id,
      destFolderId: job.dest_folder_id!,
      destAccountId: job.dest_account_id,
      name: job.dest_final_name,
      path: job.path,
    });
    if (job.mode === 'merge') repo.touchCopy(copy.id, { synced: true });
    const status = counts.done === 0 && counts.failed > 0 ? 'failed' : 'done';
    repo.update(job.id, {
      status,
      finished_at: this.iso(),
      message: t.jobs.summary({ done: counts.done, blocked: counts.skipped_blocked, native: counts.skipped_native, missing: counts.missing, failed: counts.failed }),
    });
    this.deps.log?.(`"${job.name}": ${status}`);
  }

  private applyPause(job: JobRow, reason: PauseReason): void {
    this.deps.repo.update(job.id, { status: `paused_${reason.kind}`, paused_until: reason.until, resume_reason: reason.message });
    if (reason.kind === 'auth') {
      const accountId = reason.accountId ?? job.dest_account_id;
      const acc = this.deps.accountsRepo.get(accountId);
      if (acc && acc.status !== 'disconnected') this.deps.accountsRepo.setStatus(accountId, 'disconnected', this.iso());
    }
  }

  // --- ações do usuário ---

  pause(id: string): void {
    if (this.running?.id === id) {
      this.running.pauseRequested = true;
      this.running.abort.abort();
      return;
    }
    const j = this.deps.repo.get(id);
    if (j && j.status === 'queued') this.deps.repo.update(id, { status: 'paused' });
  }

  resume(id: string): void {
    const j = this.deps.repo.get(id);
    if (j && j.status.startsWith('paused')) this.deps.repo.update(id, { status: 'queued', paused_until: null, resume_reason: null });
  }

  cancel(id: string): void {
    if (this.running?.id === id) {
      this.running.cancelRequested = true;
      this.running.abort.abort();
      return;
    }
    const j = this.deps.repo.get(id);
    if (j && !TERMINAL.has(j.status)) this.deps.repo.update(id, { status: 'canceled', finished_at: this.iso() });
  }

  /** false se o job está rodando — cancele primeiro. */
  remove(id: string): boolean {
    if (this.running?.id === id) return false;
    this.deps.repo.remove(id);
    return true;
  }

  isRunning(id: string): boolean {
    return this.running?.id === id;
  }

  // --- velocidade / ETA (janela deslizante de 30 s) ---

  private sample(state: Running, bytes: number): void {
    const now = this.now();
    state.samples.push({ t: now, bytes });
    const cut = now - SPEED_WINDOW_MS;
    while (state.samples.length && state.samples[0].t < cut) state.samples.shift();
  }

  stats(id: string): JobStats | null {
    const s = this.running;
    if (!s || s.id !== id || !s.samples.length) return null;
    const now = this.now();
    const first = s.samples[0].t;
    const elapsed = Math.max(1000, now - first);
    const bytes = s.samples.reduce((n, x) => n + x.bytes, 0);
    const bytesPerSec = (bytes / elapsed) * 1000;
    const job = this.deps.repo.get(id);
    const remaining = job ? Math.max(0, job.total_bytes - job.done_bytes) : 0;
    return { bytesPerSec, etaSec: bytesPerSec > 0 ? Math.round(remaining / bytesPerSec) : null };
  }
}

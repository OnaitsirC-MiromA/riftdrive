import { randomUUID } from 'node:crypto';
import type { InspectResult } from './inspect';
import type { Tree } from './tree';

// A análise lê a árvore inteira (minutos, numa pasta grande). Criar o job logo
// depois reaproveita essa leitura em vez de repeti-la: a SPA devolve o id da
// inspeção, e o inventário do job sai daqui.
export class InspectionCache {
  private items = new Map<string, { result: InspectResult; tree: Tree; at: number }>();

  constructor(
    private ttlMs = 15 * 60_000,
    private max = 20,
    private now: () => number = Date.now,
  ) {}

  put(result: InspectResult, tree: Tree): string {
    this.sweep();
    const id = randomUUID();
    this.items.set(id, { result, tree, at: this.now() });
    while (this.items.size > this.max) this.items.delete(this.items.keys().next().value!);
    return id;
  }

  get(id: string): { result: InspectResult; tree: Tree } | null {
    this.sweep();
    const it = this.items.get(id);
    return it ? { result: it.result, tree: it.tree } : null;
  }

  // Só o destino mudou: o resultado é outro, a árvore e o id continuam os mesmos,
  // então a SPA não precisa remontar nada nem o job perder a leitura.
  update(id: string, result: InspectResult): boolean {
    const it = this.items.get(id);
    if (!it) return false;
    it.result = result;
    return true;
  }

  private sweep(): void {
    const cut = this.now() - this.ttlMs;
    for (const [k, v] of this.items) if (v.at < cut) this.items.delete(k);
  }
}

// Quantos arquivos a leitura em curso já viu, por token que a SPA inventou.
// O POST /api/inspect alimenta; a SPA consulta enquanto espera; ao terminar,
// o token some. Tokens esquecidos morrem pelo TTL.
export class InspectProgress {
  private items = new Map<string, { filesSeen: number; at: number }>();

  constructor(
    private ttlMs = 15 * 60_000,
    private now: () => number = Date.now,
  ) {}

  set(token: string, filesSeen: number): void {
    this.items.set(token, { filesSeen, at: this.now() });
  }

  get(token: string): number | null {
    const it = this.items.get(token);
    if (!it) return null;
    if (it.at < this.now() - this.ttlMs) {
      this.items.delete(token);
      return null;
    }
    return it.filesSeen;
  }

  clear(token: string): void {
    this.items.delete(token);
  }
}

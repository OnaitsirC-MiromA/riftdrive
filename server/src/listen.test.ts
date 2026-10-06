import { describe, expect, it } from 'vitest';
import { listenWithFallback } from './listen';

// Um "servidor" que recusa as primeiras n portas com EADDRINUSE.
const busy = (n: number) => {
  let calls = 0;
  return {
    listen: async () => {
      calls++;
      if (calls <= n) throw Object.assign(new Error('x'), { code: 'EADDRINUSE' });
    },
    get calls() {
      return calls;
    },
  };
};

describe('listenWithFallback', () => {
  it('usa a primeira porta livre', async () => {
    expect(await listenWithFallback(busy(0), 7799, '127.0.0.1')).toEqual({ port: 7799, changed: false });
  });

  it('anda para a seguinte quando ocupada', async () => {
    expect(await listenWithFallback(busy(2), 7799, '127.0.0.1')).toEqual({ port: 7801, changed: true });
  });

  it('outro erro sobe na hora', async () => {
    const app = {
      listen: async () => {
        throw Object.assign(new Error('perm'), { code: 'EACCES' });
      },
    };
    await expect(listenWithFallback(app, 80, '127.0.0.1')).rejects.toThrow('perm');
  });

  it('desiste depois das tentativas', async () => {
    await expect(listenWithFallback(busy(99), 7799, '127.0.0.1', 3)).rejects.toThrow(/Nenhuma porta livre entre 7799 e 7801/);
  });
});

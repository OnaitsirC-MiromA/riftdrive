import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuthClient, useInfo } from '../api/hooks';
import { Brand, PortalMark } from '../components/Brand';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { CheckIcon, ExternalIcon } from '../components/icons';
import { CLOUD_STEPS, loadDoneSteps, saveDoneSteps, type StepKey } from './setup/steps';
import { s } from '../i18n/strings';

type Phase = { kind: 'steps' } | { kind: 'waiting'; authUrl: string } | { kind: 'connected'; email: string };

// O único atrito do produto, então merece a melhor tela: cada passo com o link
// certo, o passo que todo mundo pula em destaque, e o login sem colar URL.
export default function Setup() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const info = useInfo();
  const authClient = useAuthClient();
  const [done, setDone] = useState<Set<StepKey>>(() => loadDoneSteps());
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'steps' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pasteRef = useRef<HTMLLIElement>(null);
  const autoStarted = useRef(false);

  const hasClient = authClient.data?.configured ?? false;
  const accountsCount = info.data?.configured.accounts ?? 0;
  const reconnectHint = params.get('reconectar') ?? undefined;
  const another = params.get('outra') === '1';

  const toggle = (key: StepKey) => {
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDone(next);
    saveDoneSteps(next);
  };

  const startLogin = async (hint?: string) => {
    setBusy(true);
    setError(null);
    try {
      const { authUrl } = await api.loginStart(hint);
      setPhase({ kind: 'waiting', authUrl });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.common.error);
    } finally {
      setBusy(false);
    }
  };

  // Veio das Configurações para reconectar/conectar outra: já vai para o Google.
  useEffect(() => {
    if (autoStarted.current || !hasClient) return;
    if (reconnectHint || another) {
      autoStarted.current = true;
      void startLogin(reconnectHint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasClient, reconnectHint, another]);

  // Enquanto o Google não responde, perguntamos ao servidor a cada segundo.
  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    const timer = setInterval(async () => {
      try {
        const st = await api.loginStatus();
        if (st.state === 'done') {
          clearInterval(timer);
          setPhase({ kind: 'connected', email: st.email });
          void qc.invalidateQueries();
        } else if (st.state === 'error') {
          clearInterval(timer);
          setPhase({ kind: 'steps' });
          setError(st.message);
        }
      } catch {
        /* servidor fora por um instante: tenta de novo */
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase.kind, qc]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clientId.trim() || clientSecret.trim() || !hasClient) {
      if (!/\.apps\.googleusercontent\.com$/.test(clientId.trim())) {
        setError('O ID do cliente precisa terminar em .apps.googleusercontent.com.');
        return;
      }
      setBusy(true);
      try {
        await api.setAuthClient(clientId.trim(), clientSecret.trim());
        await qc.invalidateQueries({ queryKey: ['authClient'] });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : s.common.error);
        setBusy(false);
        return;
      }
    }
    await startLogin();
  };

  const stepText: Record<StepKey, { title: React.ReactNode; hint: React.ReactNode }> = {
    project: { title: s.setup.steps.project, hint: s.setup.steps.projectHint },
    api: { title: s.setup.steps.api, hint: s.setup.steps.apiHint },
    consent: {
      title: (
        <>
          {s.setup.steps.consent}
          <span className="text-amber">{s.setup.steps.consentStrong}</span>
        </>
      ),
      hint: (
        <Banner tone="warn" className="mt-1">
          {s.setup.steps.consentWarn1}
          <strong className="text-fg">{s.setup.steps.consentWarnStrong}</strong>
          {s.setup.steps.consentWarn2}
        </Banner>
      ),
    },
    credential: { title: s.setup.steps.credential, hint: s.setup.steps.credentialHint },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-line">
        <Brand to={accountsCount > 0 ? '/' : null} />
        <span className="text-[12px] text-muted">{s.setup.step(phase.kind === 'connected' ? 2 : 1, 2)}</span>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 sm:px-6 py-8 grid gap-6 flex-1">
        {phase.kind === 'connected' ? (
          <section className="grid gap-5 text-center py-6" aria-live="polite">
            <PortalMark size={56} className="text-fg justify-self-center" />
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.02em]">{s.setup.connectedTitle(phase.email)}</h1>
              <p className="text-muted mt-1 text-[14px]">{s.setup.connectedText}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => void startLogin()} disabled={busy}>
                {s.setup.another}
              </Button>
              <Button variant="primary" onClick={() => navigate('/')}>
                {s.setup.finish}
              </Button>
            </div>
            <p className="text-[12px] text-muted">{s.setup.anotherHint}</p>
          </section>
        ) : phase.kind === 'waiting' ? (
          <section className="grid gap-4 text-center py-6" aria-live="polite">
            <PortalMark size={56} animated className="text-fg justify-self-center" />
            <h1 className="text-lg font-semibold">{s.setup.waiting}</h1>
            <p className="text-muted text-[13px] leading-relaxed max-w-md mx-auto">{s.setup.waitingHint}</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => window.open(phase.authUrl, '_blank', 'noopener')}>
                <ExternalIcon width={14} height={14} /> Abrir o Google de novo
              </Button>
              <Button onClick={() => setPhase({ kind: 'steps' })}>{s.analysis.cancel}</Button>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-2">
              <h1 className="text-xl font-semibold tracking-[-0.02em]">{s.setup.title}</h1>
              <p className="text-muted text-[14px] leading-relaxed">
                {s.setup.intro1}
                <strong className="text-fg font-medium">{s.setup.introStrong}</strong>
                {s.setup.intro2}
              </p>
            </section>

            {hasClient && (
              <Banner tone="success">
                {s.settings.oauthText(authClient.data?.clientIdMasked ?? '')}{' '}
                <Button variant="link" size="sm" onClick={() => void startLogin()} disabled={busy}>
                  Entrar com Google →
                </Button>
              </Banner>
            )}

            <ol className="grid gap-1">
              {CLOUD_STEPS.map((step, idx) => {
                const isDone = done.has(step.key);
                return (
                  <li key={step.key} className="grid grid-cols-[24px_1fr] gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(step.key)}
                      aria-pressed={isDone}
                      aria-label={`${isDone ? 'Desmarcar' : 'Marcar'} passo ${idx + 1}`}
                      className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold ${isDone ? 'bg-green/[0.18] text-green' : 'bg-white/[0.08] text-muted'}`}
                    >
                      {isDone ? <CheckIcon width={12} height={12} /> : idx + 1}
                    </button>
                    <div className="grid gap-1 text-[13.5px]">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`font-semibold ${isDone ? 'text-muted line-through decoration-white/30' : ''}`}>{stepText[step.key].title}</span>
                        <a href={step.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-strong hover:underline text-[12.5px]">
                          {s.setup.open} <ExternalIcon width={12} height={12} />
                        </a>
                      </div>
                      <div className="text-muted text-[12.5px]">{stepText[step.key].hint}</div>
                      {step.key === 'consent' && !isDone && (
                        <Button size="sm" className="justify-self-start mt-1" onClick={() => toggle('consent')}>
                          {s.setup.markDone}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
              <li className="grid grid-cols-[24px_1fr] gap-3 py-2.5" ref={pasteRef}>
                <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold bg-violet text-ink">5</span>
                <form onSubmit={submit} className="grid gap-3">
                  <span className="font-semibold text-[13.5px]">{s.setup.steps.paste}</span>
                  <Field label={s.setup.clientId} placeholder={s.setup.clientIdPlaceholder} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
                  <Field label={s.setup.clientSecret} placeholder={s.setup.clientSecretPlaceholder} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" autoComplete="off" />
                  {error && <Banner tone="error">{error}</Banner>}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => pasteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                      {s.setup.skip}
                    </button>
                    <Button variant="primary" type="submit" disabled={busy || (!hasClient && (!clientId.trim() || !clientSecret.trim()))}>
                      {busy ? s.setup.submitting : s.setup.submit}
                    </Button>
                  </div>
                </form>
              </li>
            </ol>
          </>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { api } from '../lib/api';
import type { PublicDemo, PublicPlan, User } from '../types';

interface Props { onAuthenticated: (user: User) => void }

type AuthMode = 'login' | 'register' | 'forgot';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatStorage(bytes: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(bytes / 1024 ** 3)} Go`;
}

function formatFileSize(bytes: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024 ** 2)} Mo`;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const parameters = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<AuthMode>(() => parameters.get('register') === '1' ? 'register' : 'login');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [demo, setDemo] = useState<PublicDemo | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState(parameters.get('plan') ?? '');
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(() => parameters.get('billing') === 'year' || parameters.get('interval') === 'year' ? 'year' : 'month');

  useEffect(() => {
    api.publicDemo().then((result) => setDemo(result.demo)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode !== 'register' || plans.length > 0) return;
    api.publicPlans().then((result) => {
      const billablePlans = result.plans.filter((plan) => plan.monthlyPriceCents !== null || plan.annualPriceCents !== null);
      setPlans(billablePlans);
      setSelectedPlanCode((current) => billablePlans.some((plan) => plan.code === current)
        ? current
        : (billablePlans.find((plan) => plan.featured) ?? billablePlans[0])?.code ?? '');
    }).catch(() => setError('Impossible de charger les forfaits disponibles.'));
  }, [mode, plans.length]);

  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode);
  const selectedPrice = billingInterval === 'month' ? selectedPlan?.monthlyPriceCents : selectedPlan?.annualPriceCents;
  const freePlan = selectedPlan?.free ?? false;

  useEffect(() => {
    if (!selectedPlan) return;
    if (billingInterval === 'month' && selectedPlan.monthlyPriceCents === null && selectedPlan.annualPriceCents !== null) setBillingInterval('year');
    if (billingInterval === 'year' && selectedPlan.annualPriceCents === null && selectedPlan.monthlyPriceCents !== null) setBillingInterval('month');
  }, [billingInterval, selectedPlan]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const email = String(data.get('email'));
      if (mode === 'forgot') {
        const result = await api.forgotPassword(email);
        setMessage(result.message);
        return;
      }
      const payload = {
        email,
        password: String(data.get('password')),
      };
      if (mode === 'register') {
        const result = await api.register({
          ...payload,
          displayName: String(data.get('displayName')),
          planCode: String(data.get('planCode')),
          billingInterval: String(data.get('billingInterval')) as 'month' | 'year',
          requestId: crypto.randomUUID(),
        });
        if (result.checkoutUrl) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        if (!result.checkoutRequired) {
          onAuthenticated(result.user);
          return;
        }
        setMode('login');
        setMessage(result.checkoutError ?? 'Votre compte a été créé. Connectez-vous pour reprendre la souscription.');
        return;
      }
      const result = await api.login(payload);
      onAuthenticated(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }

  async function startDemo() {
    setDemoLoading(true);
    setError('');
    try {
      const result = await api.startDemo();
      onAuthenticated(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Démonstration indisponible.');
    } finally {
      setDemoLoading(false);
    }
  }

  return <main className="auth-shell auth-centered">
    <img className="auth-animated-logo" src="/sonoriva-logo-animated.svg" alt="SonoRiva" />
    <section className="auth-panel">
      <form className="auth-card" onSubmit={submit}>
        <div>
          <h2>{mode === 'register' ? 'Créer votre régie' : mode === 'forgot' ? 'Réinitialiser le mot de passe' : 'Connexion'}</h2>
          {mode === 'forgot' && <p>Saisissez l’adresse e-mail de votre compte.</p>}
        </div>
        {mode === 'register' && <label>Nom affiché<input name="displayName" autoComplete="name" required minLength={2} placeholder="Votre nom" /></label>}
        <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required placeholder="vous@exemple.fr" /></label>
        {mode !== 'forgot' && <label>Mot de passe<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} placeholder="8 caractères minimum" /></label>}
        {mode === 'register' && <div className={`auth-billing-choice ${freePlan ? 'free' : ''}`}>
          <label>Forfait<select name="planCode" value={selectedPlanCode} onChange={(event) => setSelectedPlanCode(event.target.value)} required>{plans.map((plan) => <option value={plan.code} key={plan.code}>{plan.name}</option>)}</select></label>
          {!freePlan && <label>Périodicité<select name="billingInterval" value={billingInterval} onChange={(event) => setBillingInterval(event.target.value as 'month' | 'year')} required><option value="month" disabled={selectedPlan?.monthlyPriceCents === null}>Mensuelle</option><option value="year" disabled={selectedPlan?.annualPriceCents === null}>Annuelle</option></select></label>}
          {freePlan && <input type="hidden" name="billingInterval" value={billingInterval} />}
          {selectedPlan && selectedPrice !== null && selectedPrice !== undefined && (freePlan
            ? <p><strong>Gratuit sans carte bancaire</strong><span>{formatStorage(selectedPlan.storageQuotaBytes)} de stockage, sans limite de durée.</span></p>
            : <p><strong>{selectedPlan.trialDays > 0 ? `${selectedPlan.trialDays} jours gratuits` : 'Abonnement sans période d’essai'}</strong><span>{selectedPlan.trialDays > 0 ? 'Puis ' : ''}{formatPrice(selectedPrice)}{billingInterval === 'month' ? ' par mois' : ' par an'}. Le moyen de paiement est enregistré par Stripe.</span></p>)}
        </div>}
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        <button className="button primary wide" disabled={loading || (mode === 'register' && (!selectedPlan || selectedPrice === null || selectedPrice === undefined))}>{loading && <LoaderCircle className="spin" size={18} />}{mode === 'register' ? freePlan ? 'Créer mon compte gratuitement' : 'Continuer avec Stripe' : mode === 'forgot' ? 'Envoyer le lien' : 'Se connecter'}</button>
        {mode !== 'forgot' && <><div className="auth-separator"><span>ou</span></div><button className="button demo wide" type="button" disabled={demoLoading} onClick={startDemo}>{demoLoading && <LoaderCircle className="spin" size={18} />}Essayer sans compte</button><details className="demo-auth-details"><summary>Limites de la démo</summary><small className="demo-auth-note">Espace temporaire · {demo?.maxUploads ?? 15} fichiers · {formatFileSize(demo?.maxFileBytes ?? 5 * 1024 ** 2)} maximum par fichier · réinitialisé après {demo?.lifetimeHours ?? 24} h d’inactivité</small></details></>}
        {mode === 'login' && <button className="text-button" type="button" onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}>
          Mot de passe oublié ?
        </button>}
        <button className="text-button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>
          {mode === 'register' ? 'J’ai déjà un compte' : mode === 'forgot' ? 'Retour à la connexion' : 'Créer un nouveau compte'}
        </button>
      </form>
    </section>
  </main>;
}

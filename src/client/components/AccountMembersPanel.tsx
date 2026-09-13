import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { AccountMember, AccountSummary, SharedLibrary, User } from '../types';

export function AccountMembersPanel({ account, user }: { account: AccountSummary; user: User }) {
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [library, setLibrary] = useState<SharedLibrary>({ tracks: [], projects: [] });
  const [sourceUserId, setSourceUserId] = useState(user.id);
  const [destination, setDestination] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<string>();
  const owner = account.billing?.membershipRole === 'owner';
  const enabled = account.maxUsers > 0;
  const refresh = useCallback(async () => {
    const result = await api.accountMembers();
    setMembers(result.members);
    if (enabled) setLibrary(await api.sharedLibrary());
  }, [enabled]);
  useEffect(() => { refresh().catch((cause: Error) => setError(cause.message)); }, [refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'La requête a échoué.'); }
    finally { setBusy(false); }
  }
  function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await api.createAccountMember({ displayName: String(data.get('displayName')), email: String(data.get('email')), password: String(data.get('password')) });
      form.reset(); setMessage('Utilisateur créé. Il peut se connecter avec ses identifiants.');
    });
  }
  const visibleTracks = library.tracks.filter((track) => track.userId === sourceUserId && `${track.title} ${track.projectName}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')));
  const destinations = library.projects.filter((project) => sourceUserId === user.id ? project.userId !== user.id : project.userId === user.id);

  return <section className="settings-section settings-section-wide account-members-panel">
    <div className="settings-section-title"><div><strong>Utilisateurs du compte</strong><span>{enabled ? `${members.length} / ${account.maxUsers} utilisateurs, titulaire inclus` : 'La gestion multiutilisateur est désactivée pour ce forfait.'}</span></div></div>
    <p>Chaque utilisateur dispose de ses spectacles, catégories et sons. Une nouvelle connexion remplace la session précédente du compte.</p>
    <ul className="account-members-list">{members.map((member) => <li key={member.id}>
      <div><strong>{member.displayName}</strong><small>{member.email} · {member.role === 'owner' ? 'Titulaire' : member.disabledAt ? 'Désactivé' : !member.allowed ? 'Hors limite du forfait' : 'Utilisateur'}</small></div>
      {owner && member.role !== 'owner' && <div className="account-member-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={() => void run(() => api.updateAccountMember(member.id, { disabled: !member.disabledAt }))}>{member.disabledAt ? 'Réactiver' : 'Désactiver'}</button>
        <button type="button" className="button danger" disabled={busy} onClick={() => setRemoving(member.id)}>Retirer</button>
        {removing === member.id && <div><p>Retirer cet utilisateur et supprimer ses spectacles ? Les sons copiés chez d’autres utilisateurs seront conservés.</p><button type="button" className="button danger" disabled={busy} onClick={() => void run(async () => { await api.removeAccountMember(member.id); setRemoving(undefined); })}>Confirmer le retrait</button><button type="button" className="button ghost" onClick={() => setRemoving(undefined)}>Annuler</button></div>}
      </div>}
    </li>)}</ul>
    {owner && enabled && <form className="account-member-form" onSubmit={createMember}>
      <label>Nom<input name="displayName" required minLength={2} maxLength={80} autoComplete="off" /></label>
      <label>Adresse e-mail<input name="email" type="email" required autoComplete="off" /></label>
      <label>Mot de passe initial<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
      <button className="button primary" disabled={busy || members.length >= account.maxUsers}>Ajouter un utilisateur</button>
    </form>}
    {enabled && <div className="account-copy-panel">
      <h3>Copier des sons entre utilisateurs</h3>
      <p>Le nom et les réglages de chaque copie sont indépendants. Le fichier reste commun et n’occupe le stockage qu’une seule fois. Les copies arrivent sans catégorie dans le spectacle de destination.</p>
      <label>Utilisateur source<select value={sourceUserId} onChange={(event) => { setSourceUserId(event.target.value); setSelected([]); setDestination(''); }}>{members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
      <label>Rechercher un son<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="account-copy-tracks">{visibleTracks.map((track) => <label key={track.id}><input type="checkbox" checked={selected.includes(track.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, track.id] : current.filter((id) => id !== track.id))} /><span>{track.title}<small>{track.projectName}</small></span></label>)}{!visibleTracks.length && <p>Aucun son à copier.</p>}</div>
      <label>Spectacle de destination<select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Choisir un spectacle</option>{destinations.map((project) => <option key={project.id} value={project.id}>{project.displayName} — {project.name}</option>)}</select></label>
      <button type="button" className="button primary" disabled={busy || !selected.length || selected.length > 500 || !destination} onClick={() => void run(async () => {
        await api.copyAccountTracks({ trackIds: selected, projectId: destination });
        setMessage(`${selected.length} son(s) copié(s).`); setSelected([]);
        window.dispatchEvent(new Event('sonoriva:project-updated'));
      })}>Copier {selected.length > 0 ? `(${selected.length})` : ''}</button>
    </div>}
    {error && <p role="alert" className="billing-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}

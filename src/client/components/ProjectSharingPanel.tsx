import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AccountMember, Project, User } from '../types';

export function ProjectSharingPanel({ project, user, enabled }: { project: Project; user: User; enabled: boolean }) {
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const owner = project.userId === user.id;
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    Promise.all([api.accountMembers(), api.projectSharing(project.id)]).then(([result, sharing]) => {
      if (cancelled) return;
      setMembers(result.members.filter((member) => member.id !== user.id));
      setSelected(sharing.userIds); setLoading(false);
    }).catch((cause: Error) => { if (!cancelled) { setError(cause.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [project.id, user.id, owner]);

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      await api.updateProjectSharing(project.id, selected);
      setMessage(selected.length ? 'Partage enregistré.' : 'Le spectacle est privé.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de modifier le partage.'); }
    finally { setBusy(false); }
  }

  return <section className="settings-section project-sharing-panel">
    <div className="settings-section-title"><div><strong>Partage du spectacle</strong><span>{project.name}</span></div></div>
    {!owner ? <p>Ce spectacle est partagé avec vous. Vous pouvez le lire et le modifier. Son propriétaire conserve la gestion du partage et sa suppression.</p> : <>
      <p>Les utilisateurs sélectionnés accèdent au même spectacle et peuvent modifier ses sons, catégories, playlists et réglages. Décocher un utilisateur retire son accès.</p>
      {!enabled && <p>Le partage est désactivé par le forfait. Vous pouvez retirer les partages enregistrés.</p>}
      {loading ? <p>Chargement…</p> : <div className="project-sharing-members">{members.map((member) => <label key={member.id}>
        <input type="checkbox" checked={selected.includes(member.id)} disabled={busy || (!enabled && !selected.includes(member.id))} onChange={(event) => { setMessage(''); setSelected((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)); }} />
        <span>{member.displayName}{!member.allowed && <small>Accès utilisateur actuellement désactivé</small>}</span>
      </label>)}{!members.length && <p>Aucun autre utilisateur dans ce compte.</p>}</div>}
      <button type="button" className="button primary" disabled={loading || busy || (!enabled && selected.length > 0)} onClick={() => void save()}>Enregistrer le partage</button>
    </>}
    {error && <p role="alert" className="billing-error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}

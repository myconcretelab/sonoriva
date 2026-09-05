import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsDialog = readFileSync(new URL('../src/client/components/SettingsDialog.tsx', import.meta.url), 'utf8');
const application = readFileSync(new URL('../src/client/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');

describe('panneau de paramètres', () => {
  it('répartit les réglages dans cinq onglets thématiques', () => {
    for (const tab of ['Général', 'Spectacle', 'Audio', 'Commandes', 'Compte']) {
      expect(settingsDialog).toContain(`label: '${tab}'`);
    }
    expect(settingsDialog).toContain('role="tablist"');
    expect(settingsDialog).toContain('role="tabpanel"');
    expect(settingsDialog).toContain("hidden={activeTab !== 'show'}");
    expect(settingsDialog).toContain("hidden={activeTab !== 'audio'}");
  });

  it('conserve les actions essentielles au-dessus du contenu défilable', () => {
    const persistentTools = settingsDialog.indexOf('className="settings-persistent-tools"');
    const scrollableContent = settingsDialog.indexOf('className="settings-dialog-content"');

    expect(persistentTools).toBeGreaterThan(0);
    expect(scrollableContent).toBeGreaterThan(persistentTools);
    expect(settingsDialog.slice(persistentTools, scrollableContent)).toContain('Moteur audio');
    expect(settingsDialog.slice(persistentTools, scrollableContent)).toContain('Documentation');
    expect(settingsDialog.slice(persistentTools, scrollableContent)).toContain('Support');
    expect(settingsDialog.slice(persistentTools, scrollableContent)).toContain('Télécommande');
    expect(settingsDialog.slice(persistentTools, scrollableContent)).toContain('Se connecter');
    expect(settingsDialog.slice(persistentTools, scrollableContent)).toContain('Se déconnecter');
    expect(application).toContain('supportUnreadCount={supportUnreadCount}');
    expect(application).toContain('onOpenSupport={() =>');
  });

  it('utilise un panneau large et limite le défilement à son contenu', () => {
    expect(styles).toContain('.settings-dialog { width: min(1040px, 100%);');
    expect(styles).toContain('.settings-dialog-content { min-height: 0;');
    expect(styles).toContain('overflow-y: auto;');
    expect(styles).toContain('.settings-section[hidden] { display: none; }');
    expect(styles).toContain('.settings-dialog { width: 100%; height: 100dvh;');
  });
});

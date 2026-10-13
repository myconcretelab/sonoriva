import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('réglages de la colonne de lecture', () => {
  it('migre les valeurs par défaut à huit lectures et cinq cartes', () => {
    const migration = readFileSync(new URL('../migrations/0028_lame_vengeance.sql', import.meta.url), 'utf8');
    expect(migration).toContain('"max_active_playbacks" integer DEFAULT 8 NOT NULL');
    expect(migration).toContain('"compact_playback_threshold" integer DEFAULT 5 NOT NULL');
  });

  it('valide les deux réglages entre un et seize', () => {
    const route = readFileSync(new URL('../src/server/routes/projects.ts', import.meta.url), 'utf8');
    expect(route).toContain('maxActivePlaybacks: z.number().int().min(1).max(16).optional()');
    expect(route).toContain('compactPlaybackThreshold: z.number().int().min(1).max(16).optional()');
  });

  it('enregistre une durée de fondu enchaîné de zéro à vingt secondes', () => {
    const migration = readFileSync(new URL('../migrations/0040_cuddly_shinobi_shaw.sql', import.meta.url), 'utf8');
    const route = readFileSync(new URL('../src/server/routes/projects.ts', import.meta.url), 'utf8');
    expect(migration).toContain('"crossfade_duration_ms" integer DEFAULT 2000 NOT NULL');
    expect(route).toContain('crossfadeDurationMs: z.number().int().min(0).max(20_000).optional()');
  });

  it('enregistre la réinitialisation optionnelle du fondu sur deux secondes', () => {
    const schema = readFileSync(new URL('../src/server/db/schema.ts', import.meta.url), 'utf8');
    const route = readFileSync(new URL('../src/server/routes/projects.ts', import.meta.url), 'utf8');
    expect(schema).toContain("crossfadeResetAfterUse: boolean('crossfade_reset_after_use').notNull().default(false)");
    expect(schema).toContain("crossfadeResetDurationMs: integer('crossfade_reset_duration_ms').notNull().default(2_000)");
    expect(route).toContain('crossfadeResetAfterUse: z.boolean().optional()');
    expect(route).toContain('crossfadeResetDurationMs: z.number().int().min(0).max(20_000).optional()');
  });

  it('affiche les commandes contextuelles de fondu et de volumes liés', () => {
    const app = readFileSync(new URL('../src/client/App.tsx', import.meta.url), 'utf8');
    const durationControl = readFileSync(new URL('../src/client/components/CrossfadeDurationControl.tsx', import.meta.url), 'utf8');
    expect(app).toContain("detail?.project.leftClickAction === 'crossfade' || detail?.project.rightClickAction === 'crossfade'");
    expect(app).toContain('className="players-crossfade-duration"');
    expect(app).not.toContain('className="mouse-crossfade-duration"');
    expect(app).toContain('playingTracks.length === 2');
    expect(app).toContain('linkedVolumeForTotal(linkedVolumes.total, nextVolume)');
    expect(durationControl).toContain('max="20000" step="500"');
    expect(durationControl).toContain("label = 'Fondu'");
    expect(durationControl).toContain('<Clock3 size={13} />{label}');
    expect(durationControl).toContain('popoverOpen && <output className="crossfade-duration-popover"');
    expect(durationControl).toContain('className="crossfade-reset-toggle"');
    expect(app).toContain('resetCrossfadeDurationAfterUse');
  });
});

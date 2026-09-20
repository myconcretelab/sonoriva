import { categorySizedWorkspaceRows } from '../src/client/lib/workspace-layout';
import { describe, expect, it } from 'vitest';
import {
  createWorkspaceLayout,
  moveWorkspaceItem,
  readSavedWorkspaceLayouts,
  readWorkspaceLayout,
  resizeWorkspaceItem,
  setWorkspaceItemCollapsed,
  swapWorkspaceItems,
  workspaceDockItems,
  workspaceItemIsDocked,
  workspaceItemIsCollapsed,
  workspaceLayoutItem,
  workspaceLayoutsMatch,
  workspaceLayoutSnapshot,
  workspaceLayoutStorageKey,
  workspaceLayoutWithColumns,
  workspaceSavedLayoutsStorageKey,
} from '../src/client/lib/workspace-layout';

describe('workspace layout', () => {
  it('places actions, playbacks and playlist in the left dock by default', () => {
    const layout = createWorkspaceLayout();
    expect(layout.dock).toEqual(['actions', 'players', 'playlist', 'quickLaunch']);
    expect(workspaceItemIsDocked(layout, 'actions')).toBe(true);
    expect(workspaceItemIsDocked(layout, 'players')).toBe(true);
    expect(workspaceItemIsDocked(layout, 'playlist')).toBe(true);
    expect(workspaceLayoutItem(layout, 'categories')).toMatchObject({ x: 0, y: 0, w: 12, h: 2 });
    expect(workspaceLayoutItem(layout, 'soundboard')).toMatchObject({ x: 0, y: 2, w: 12, h: 10 });
  });

  it('provides a full-height playlist preset', () => {
    const layout = createWorkspaceLayout('playlist-vertical');
    expect(workspaceLayoutItem(layout, 'playlist')).toMatchObject({ x: 0, y: 0, w: 4, h: 12 });
    expect(layout.dock).toEqual(['actions', 'players', 'quickLaunch']);
    expect(workspaceLayoutItem(layout, 'soundboard')).toMatchObject({ x: 4, y: 2, w: 8, h: 10 });
  });

  it('places current playbacks below actions in every preset', () => {
    for (const preset of ['classic', 'playlist-vertical', 'playlist-focus'] as const) {
      expect(workspaceDockItems(createWorkspaceLayout(preset)).slice(0, 2)).toEqual(['actions', 'players']);
    }
    expect(workspaceLayoutItem(createWorkspaceLayout('playlist-focus'), 'soundboard')).toMatchObject({ x: 8, y: 2, w: 4, h: 10 });
  });

  it('collapses reusable modules', () => {
    const collapsed = setWorkspaceItemCollapsed(createWorkspaceLayout(), 'playlist', true);
    expect(workspaceItemIsCollapsed(collapsed, 'playlist')).toBe(true);
    expect(collapsed.preset).toBe('classic');
  });

  it('keeps the proportions when the grid resolution changes', () => {
    const layout = workspaceLayoutWithColumns(createWorkspaceLayout('classic'), 6);
    expect(workspaceLayoutItem(layout, 'categories')).toMatchObject({ x: 0, w: 6 });
    expect(workspaceLayoutItem(layout, 'players')).toMatchObject({ x: 5, w: 1 });
  });

  it('normalizes persisted layouts to the fixed twelve-column grid', () => {
    const restored = readWorkspaceLayout(JSON.stringify(createWorkspaceLayout('classic', 6)));
    expect(restored.columns).toBe(12);
    expect(workspaceLayoutItem(restored, 'categories')).toMatchObject({ x: 0, w: 12 });
  });

  it('rejects moves and resizes that overlap another block', () => {
    const layout = createWorkspaceLayout('classic');
    expect(moveWorkspaceItem(layout, 'categories', 0, 3)).toBe(layout);
    expect(resizeWorkspaceItem(layout, 'categories', 12, 4)).toBe(layout);
  });

  it('accepts a resize inside the free geometry and marks the layout custom', () => {
    const layout = createWorkspaceLayout('playlist-focus');
    const resized = resizeWorkspaceItem(layout, 'players', 4, 3);
    expect(workspaceLayoutItem(resized, 'players').h).toBe(3);
    expect(resized.preset).toBe('custom');
  });

  it('swaps two complete block slots without creating overlap', () => {
    const layout = createWorkspaceLayout('classic');
    const swapped = swapWorkspaceItems(layout, 'players', 'playlist');
    expect(workspaceDockItems(swapped)).toEqual(['actions', 'playlist', 'players', 'quickLaunch']);
    expect(workspaceLayoutItem(swapped, 'players')).toMatchObject({ x: 9, y: 0, w: 3, h: 6 });
    expect(workspaceLayoutItem(swapped, 'playlist')).toMatchObject({ x: 9, y: 6, w: 3, h: 6 });
  });

  it('exchanges a docked block with a compatible grid block', () => {
    const layout = swapWorkspaceItems(createWorkspaceLayout('playlist-vertical'), 'actions', 'playlist');
    expect(workspaceDockItems(layout)).toEqual(['playlist', 'players', 'quickLaunch']);
    expect(workspaceItemIsDocked(layout, 'actions')).toBe(false);
    expect(workspaceLayoutItem(layout, 'actions')).toMatchObject({ x: 0, y: 0, w: 4, h: 12 });
  });

  it('falls back safely when persisted data is invalid', () => {
    const invalid = JSON.stringify({ columns: 12, preset: 'custom', items: [{ id: 'playlist', x: 0, y: 0, w: 20, h: 12 }] });
    expect(readWorkspaceLayout(invalid).preset).toBe('classic');
    expect(readWorkspaceLayout('{')).toEqual(createWorkspaceLayout());
  });

  it('migrates the removed compact preset to the classic layout', () => {
    const compact = { ...createWorkspaceLayout(), preset: 'compact-control', compactPlaylistEnabled: true, compactPlaylistOpen: true, compactPlaylistRows: 8 };
    expect(readWorkspaceLayout(JSON.stringify(compact))).toEqual(createWorkspaceLayout());
  });

  it('migrates layouts saved before the left dock existed', () => {
    const current = createWorkspaceLayout();
    const legacy = JSON.stringify({ columns: current.columns, preset: current.preset, items: current.items.filter((item) => item.id !== 'actions') });
    const migrated = readWorkspaceLayout(legacy);
    expect(workspaceLayoutItem(migrated, 'actions').id).toBe('actions');
    expect(migrated.dock).toEqual(['actions', 'players', 'playlist', 'quickLaunch']);
    expect(migrated.collapsed).toEqual([]);
  });

  it('migrates the former classic right column into the left dock', () => {
    const current = createWorkspaceLayout();
    const legacy = JSON.stringify({
      ...current,
      dock: ['actions'],
      items: current.items.map((item) => item.id === 'categories' || item.id === 'soundboard' ? { ...item, w: 9 } : item),
    });
    const migrated = readWorkspaceLayout(legacy);
    expect(migrated.dock).toEqual(['actions', 'players', 'playlist', 'quickLaunch']);
    expect(workspaceLayoutItem(migrated, 'categories')).toMatchObject({ x: 0, w: 12 });
    expect(workspaceLayoutItem(migrated, 'soundboard')).toMatchObject({ x: 0, w: 12 });
  });

  it('preserves compact two-row categories in saved custom layouts', () => {
    const current = createWorkspaceLayout();
    const legacyItems = current.items.map((item) => item.id === 'categories' ? { ...item, h: 2 } : item.id === 'soundboard' ? { ...item, y: 2, h: 10 } : item);
    const migrated = readWorkspaceLayout(JSON.stringify({ ...current, preset: 'custom', items: legacyItems }));
    expect(workspaceLayoutItem(migrated, 'categories')).toMatchObject({ y: 0, h: 2 });
    expect(workspaceLayoutItem(migrated, 'soundboard')).toMatchObject({ y: 2, h: 10 });
  });

  it('uses a distinct persistence key for each user', () => {
    expect(workspaceLayoutStorageKey('user-a')).not.toBe(workspaceLayoutStorageKey('user-b'));
    expect(workspaceSavedLayoutsStorageKey('user-a')).not.toBe(workspaceSavedLayoutsStorageKey('user-b'));
  });

  it('reads named layouts and compares them independently from their preset label', () => {
    const layout = createWorkspaceLayout('playlist-focus');
    const serialized = JSON.stringify([{ id: 'layout-1', name: '  Ma régie  ', layout }]);
    const saved = readSavedWorkspaceLayouts(serialized);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'layout-1', name: 'Ma régie', layout: { columns: 12, preset: 'custom' } });
    expect(workspaceLayoutsMatch(saved[0]!.layout, layout)).toBe(true);
    expect(workspaceLayoutSnapshot(layout)).not.toBe(layout);
  });
});

describe('category pad height follows the category band', () => {
  it('fits categories and gives the remaining rows to the soundboard in standard layouts', () => {
    for (const preset of ['classic', 'playlist-vertical', 'playlist-focus'] as const) {
      const rows = categorySizedWorkspaceRows(createWorkspaceLayout(preset))!;
      expect(rows.match(/var\(--category-zone-height\)/g)).toHaveLength(2);
      expect(rows.match(/minmax\(0, 1fr\)/g)).toHaveLength(10);
      expect(rows).toContain('var(--workspace-gap)');
    }
  });
  it('preserves the grid when another independent panel shares the category rows', () => {
    const layout = createWorkspaceLayout();
    layout.dock = layout.dock.filter(id => id !== 'players');
    layout.items = layout.items.map(item => item.id === 'players' ? { ...item, y: 0, h: 2 } : item);
    expect(categorySizedWorkspaceRows(layout)).toBeUndefined();
  });
  it('supports a category band moved further down the grid', () => {
    const layout = createWorkspaceLayout();
    layout.items = layout.items.map(item => item.id === 'categories' ? { ...item, y: 4 } : item.id === 'soundboard' ? { ...item, y: 6, h: 6 } : item);
    const rows = categorySizedWorkspaceRows(layout)!;
    expect(rows.startsWith('minmax(0, 1fr) '.repeat(4))).toBe(true);
    expect(rows.match(/var\(--category-zone-height\)/g)).toHaveLength(2);
  });
});

export const workspaceLayoutRows = 12;
export const workspaceLayoutColumns = [6, 8, 12] as const;

export type WorkspaceGridColumns = typeof workspaceLayoutColumns[number];
export type WorkspaceBlockId = 'actions' | 'categories' | 'soundboard' | 'players' | 'playlist' | 'quickLaunch';
export type WorkspacePreset = 'classic' | 'playlist-vertical' | 'playlist-focus' | 'custom';
export const workspaceDockableBlockIds: WorkspaceBlockId[] = ['actions', 'players', 'playlist', 'quickLaunch'];
export const workspaceCollapsibleBlockIds: WorkspaceBlockId[] = ['actions', 'playlist'];

export interface WorkspaceLayoutItem {
  id: WorkspaceBlockId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WorkspaceLayout {
  columns: WorkspaceGridColumns;
  preset: WorkspacePreset;
  items: WorkspaceLayoutItem[];
  dock: WorkspaceBlockId[];
  collapsed: WorkspaceBlockId[];
  quickLaunchAttached?: boolean;
}

export interface SavedWorkspaceLayout {
  id: string;
  name: string;
  layout: WorkspaceLayout;
}

export const workspaceBlockLabels: Record<WorkspaceBlockId, string> = {
  quickLaunch: 'Départ rapide',
  actions: 'Actions de déclenchement',
  categories: 'Catégories',
  soundboard: 'Soundboard',
  players: 'Lectures en cours',
  playlist: 'Playlist',
};

export const workspacePresetLabels: Record<Exclude<WorkspacePreset, 'custom'>, string> = {
  classic: 'Régie classique',
  'playlist-vertical': 'Playlist verticale',
  'playlist-focus': 'Playlist principale',
};

const basePresets: Record<Exclude<WorkspacePreset, 'custom'>, WorkspaceLayoutItem[]> = {
  classic: [
    { id: 'actions', x: 0, y: 0, w: 3, h: 4 },
    { id: 'categories', x: 0, y: 0, w: 12, h: 2 },
    { id: 'soundboard', x: 0, y: 2, w: 12, h: 10 },
    { id: 'players', x: 9, y: 0, w: 3, h: 6 },
    { id: 'playlist', x: 9, y: 6, w: 3, h: 6 },
  ],
  'playlist-vertical': [
    { id: 'actions', x: 0, y: 0, w: 3, h: 4 },
    { id: 'playlist', x: 0, y: 0, w: 4, h: 12 },
    { id: 'categories', x: 4, y: 0, w: 8, h: 2 },
    { id: 'soundboard', x: 4, y: 2, w: 8, h: 10 },
    { id: 'players', x: 10, y: 2, w: 2, h: 10 },
  ],
  'playlist-focus': [
    { id: 'actions', x: 0, y: 0, w: 3, h: 4 },
    { id: 'categories', x: 0, y: 0, w: 12, h: 2 },
    { id: 'playlist', x: 0, y: 2, w: 8, h: 10 },
    { id: 'players', x: 8, y: 2, w: 4, h: 4 },
    { id: 'soundboard', x: 8, y: 2, w: 4, h: 10 },
  ],
};

const minimumSizes: Record<WorkspaceBlockId, { w: number; h: number }> = {
  quickLaunch: { w: 1, h: 3 },
  actions: { w: 2, h: 3 },
  categories: { w: 2, h: 2 },
  soundboard: { w: 2, h: 4 },
  players: { w: 1, h: 3 },
  playlist: { w: 2, h: 4 },
};

export function createWorkspaceLayout(preset: Exclude<WorkspacePreset, 'custom'> = 'classic', columns: WorkspaceGridColumns = 12): WorkspaceLayout {
  const dock: WorkspaceBlockId[] = preset === 'classic' ? ['actions', 'players', 'playlist'] : ['actions', 'players'];
  return { columns, preset, items: scaleItems([...basePresets[preset], { id: 'quickLaunch', x: 0, y: 2, w: 2, h: 10 }], 12, columns), dock: [...dock, 'quickLaunch'], collapsed: [], quickLaunchAttached: true };
}

export function workspaceLayoutWithColumns(layout: WorkspaceLayout, columns: WorkspaceGridColumns): WorkspaceLayout {
  if (layout.columns === columns) return layout;
  return { ...layout, columns, items: scaleItems(layout.items, layout.columns, columns) };
}

export function workspaceLayoutItem(layout: WorkspaceLayout, id: WorkspaceBlockId): WorkspaceLayoutItem {
  return layout.items.find((item) => item.id === id) ?? createWorkspaceLayout('classic', layout.columns).items.find((item) => item.id === id)!;
}

export function moveWorkspaceItem(layout: WorkspaceLayout, id: WorkspaceBlockId, x: number, y: number): WorkspaceLayout {
  const current = workspaceLayoutItem(layout, id);
  return replaceWorkspaceItem(layout, { ...current, x: clamp(x, 0, layout.columns - current.w), y: clamp(y, 0, workspaceLayoutRows - current.h) });
}

export function resizeWorkspaceItem(layout: WorkspaceLayout, id: WorkspaceBlockId, w: number, h: number): WorkspaceLayout {
  const current = workspaceLayoutItem(layout, id);
  const minimum = minimumSizes[id];
  return replaceWorkspaceItem(layout, {
    ...current,
    w: clamp(w, Math.min(minimum.w, layout.columns), layout.columns - current.x),
    h: clamp(h, minimum.h, workspaceLayoutRows - current.y),
  });
}

export function swapWorkspaceItems(layout: WorkspaceLayout, firstId: WorkspaceBlockId, secondId: WorkspaceBlockId): WorkspaceLayout {
  if (firstId === secondId) return layout;
  const first = workspaceLayoutItem(layout, firstId);
  const second = workspaceLayoutItem(layout, secondId);
  const firstDocked = workspaceItemIsDocked(layout, firstId);
  const secondDocked = workspaceItemIsDocked(layout, secondId);
  if (firstDocked && secondDocked) {
    const dock = workspaceDockItems(layout);
    const firstIndex = dock.indexOf(firstId);
    const secondIndex = dock.indexOf(secondId);
    [dock[firstIndex], dock[secondIndex]] = [dock[secondIndex]!, dock[firstIndex]!];
    return { ...layout, preset: 'custom', dock, quickLaunchAttached: firstId === 'quickLaunch' || secondId === 'quickLaunch' ? false : layout.quickLaunchAttached };
  }
  const dock: WorkspaceBlockId[] = firstDocked === secondDocked
    ? layout.dock
    : workspaceDockItems(layout).map((id) => id === (firstDocked ? firstId : secondId) ? (firstDocked ? secondId : firstId) : id);
  return {
    ...layout,
    preset: 'custom',
    quickLaunchAttached: firstId === 'quickLaunch' || secondId === 'quickLaunch' ? false : layout.quickLaunchAttached,
    dock,
    items: layout.items.map((item) => item.id === firstId ? { ...second, id: firstId } : item.id === secondId ? { ...first, id: secondId } : item),
  };
}

export function workspaceItemIsDocked(layout: WorkspaceLayout, id: WorkspaceBlockId): boolean {
  return layout.dock.includes(id);
}

export function workspaceItemIsCollapsed(layout: WorkspaceLayout, id: WorkspaceBlockId): boolean {
  return layout.collapsed.includes(id);
}

export function setWorkspaceItemCollapsed(layout: WorkspaceLayout, id: WorkspaceBlockId, collapsed: boolean): WorkspaceLayout {
  if (!workspaceCollapsibleBlockIds.includes(id)) return layout;
  const nextCollapsed = collapsed
    ? [...layout.collapsed.filter((item) => item !== id), id]
    : layout.collapsed.filter((item) => item !== id);
  if (nextCollapsed.length === layout.collapsed.length && nextCollapsed.every((item, index) => item === layout.collapsed[index])) return layout;
  return {
    ...layout,
    collapsed: nextCollapsed,
  };
}

export function workspaceDockItems(layout: WorkspaceLayout): WorkspaceBlockId[] {
  return layout.dock.filter((id, index) => layout.dock.indexOf(id) === index);
}

export function dockWorkspaceItem(layout: WorkspaceLayout, id: WorkspaceBlockId): WorkspaceLayout {
  if (!workspaceDockableBlockIds.includes(id)) return layout;
  const dock = [...layout.dock.filter((item) => item !== id), id];
  const next = { ...layout, preset: 'custom' as const, dock, quickLaunchAttached: id === 'quickLaunch' ? false : layout.quickLaunchAttached };
  const gridItems = next.items.filter((item) => !workspaceItemIsDocked(next, item.id));
  const rightEdge = Math.max(...gridItems.map((item) => item.x + item.w));
  if (rightEdge >= next.columns) return next;
  return { ...next, items: next.items.map((item) => !workspaceItemIsDocked(next, item.id) && item.x + item.w === rightEdge ? { ...item, w: next.columns - item.x } : item) };
}

export function placeWorkspaceItemOnGrid(layout: WorkspaceLayout, id: WorkspaceBlockId, x: number, y: number): WorkspaceLayout {
  const undocked = { ...layout, dock: layout.dock.filter((item) => item !== id) };
  const moved = moveWorkspaceItem(undocked, id, x, y);
  return moved === undocked ? layout : moved;
}

export function readWorkspaceLayout(serialized: string | null): WorkspaceLayout {
  if (!serialized) return createWorkspaceLayout();
  try {
    const value = JSON.parse(serialized) as Omit<WorkspaceLayout, 'preset'> & { preset: WorkspacePreset | 'compact-control'; compactPlaylistEnabled?: boolean };
    if (value.preset === 'compact-control' || value.compactPlaylistEnabled) return createWorkspaceLayout();
    if (workspaceLayoutColumns.includes(value.columns) && value.preset in workspacePresetLabels) {
      const preset = createWorkspaceLayout(value.preset as Exclude<WorkspacePreset, 'custom'>);
      const collapsed = Array.isArray(value.collapsed)
        ? value.collapsed.filter((id): id is WorkspaceBlockId => workspaceCollapsibleBlockIds.includes(id as WorkspaceBlockId))
        : [];
      return { ...preset, collapsed };
    }
    let storedItems = Array.isArray(value.items) && !value.items.some((item) => item.id === 'actions')
      ? [...value.items, createWorkspaceLayout('classic', value.columns).items.find((item) => item.id === 'actions')!]
      : value.items;
    let storedDock = Array.isArray(value.dock) ? value.dock.filter((id): id is WorkspaceBlockId => workspaceDockableBlockIds.includes(id as WorkspaceBlockId)) : ['actions'] as WorkspaceBlockId[];
    if (Array.isArray(storedItems) && !storedItems.some((item) => item.id === 'quickLaunch')) {
      storedItems = [...storedItems, createWorkspaceLayout('classic', value.columns).items.find((item) => item.id === 'quickLaunch')!];
      storedDock = [...storedDock, 'quickLaunch'];
    }
    const legacyClassic = value.preset === 'classic' && storedDock.length === 1 && storedDock[0] === 'actions';
    const dock = legacyClassic ? ['actions', 'players', 'playlist'] as WorkspaceBlockId[] : storedDock;
    const collapsed = Array.isArray(value.collapsed)
      ? value.collapsed.filter((id): id is WorkspaceBlockId => workspaceCollapsibleBlockIds.includes(id as WorkspaceBlockId))
      : [];
    const classicItems = legacyClassic && Array.isArray(storedItems)
      ? storedItems.map((item) => item.id === 'categories' || item.id === 'soundboard' ? { ...item, x: 0, w: value.columns } : item)
      : storedItems;
    const expandedItems = Array.isArray(classicItems) ? expandCategorySpace(classicItems) : classicItems;
    const items = Array.isArray(expandedItems) && layoutItemsAreValid(expandedItems, value.columns, dock) ? expandedItems : storedItems;
    if (!workspaceLayoutColumns.includes(value.columns) || !Array.isArray(items) || !layoutItemsAreValid(items, value.columns, dock)) return createWorkspaceLayout();
    const restored: WorkspaceLayout = {
      columns: value.columns,
      preset: value.preset in workspacePresetLabels || value.preset === 'custom' ? value.preset : 'custom',
      items,
      dock,
      collapsed,
      quickLaunchAttached: value.quickLaunchAttached !== false,
    };
    return workspaceLayoutWithColumns(restored, 12);
  } catch {
    return createWorkspaceLayout();
  }
}

export function workspaceLayoutStorageKey(userId: string): string {
  return `sonoriva-workspace-layout:${userId}`;
}

export function workspaceSavedLayoutsStorageKey(userId: string): string {
  return `sonoriva-workspace-layouts:${userId}`;
}

export function workspaceLayoutSnapshot(layout: WorkspaceLayout): WorkspaceLayout {
  const normalized = workspaceLayoutWithColumns(layout, 12);
  return {
    ...normalized,
    preset: 'custom',
    items: normalized.items.map((item) => ({ ...item })),
    dock: [...normalized.dock],
    collapsed: [...normalized.collapsed],
  };
}

export function readSavedWorkspaceLayouts(serialized: string | null): SavedWorkspaceLayout[] {
  if (!serialized) return [];
  try {
    const values = JSON.parse(serialized) as unknown;
    if (!Array.isArray(values)) return [];
    return values.flatMap((value): SavedWorkspaceLayout[] => {
      if (!value || typeof value !== 'object') return [];
      const candidate = value as Partial<SavedWorkspaceLayout>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 60) : '';
      if (typeof candidate.id !== 'string' || !candidate.id || !name || !candidate.layout) return [];
      return [{ id: candidate.id, name, layout: workspaceLayoutSnapshot(readWorkspaceLayout(JSON.stringify(candidate.layout))) }];
    });
  } catch {
    return [];
  }
}

export function workspaceLayoutsMatch(first: WorkspaceLayout, second: WorkspaceLayout): boolean {
  const comparable = (layout: WorkspaceLayout) => {
    const normalized = workspaceLayoutWithColumns(layout, 12);
    return {
      items: normalized.items,
      dock: normalized.dock,
      collapsed: normalized.collapsed,
      quickLaunchAttached: normalized.quickLaunchAttached !== false,
    };
  };
  return JSON.stringify(comparable(first)) === JSON.stringify(comparable(second));
}

function replaceWorkspaceItem(layout: WorkspaceLayout, nextItem: WorkspaceLayoutItem): WorkspaceLayout {
  if (!workspaceItemIsDocked(layout, nextItem.id) && layout.items.some((item) => item.id !== nextItem.id && !workspaceItemIsDocked(layout, item.id) && itemsOverlap(item, nextItem))) return layout;
  return { ...layout, preset: 'custom', items: layout.items.map((item) => item.id === nextItem.id ? nextItem : item) };
}

function scaleItems(items: WorkspaceLayoutItem[], fromColumns: number, toColumns: WorkspaceGridColumns): WorkspaceLayoutItem[] {
  return items.map((item) => {
    const x = Math.round(item.x / fromColumns * toColumns);
    const right = Math.round((item.x + item.w) / fromColumns * toColumns);
    return { ...item, x, w: Math.max(1, right - x) };
  });
}

function expandCategorySpace(items: WorkspaceLayoutItem[]): WorkspaceLayoutItem[] {
  const category = items.find((item) => item.id === 'categories');
  const minimumHeight = minimumSizes.categories.h;
  if (!category || category.h >= minimumHeight || category.y + minimumHeight > workspaceLayoutRows) return items;
  const previousBottom = category.y + category.h;
  const offset = minimumHeight - category.h;
  return items.map((item) => {
    if (item.id === 'categories') return { ...item, h: minimumHeight };
    const overlapsHorizontally = item.x < category.x + category.w && item.x + item.w > category.x;
    if (!overlapsHorizontally || item.y < previousBottom) return item;
    const y = item.y + offset;
    return { ...item, y, h: Math.min(item.h, workspaceLayoutRows - y) };
  });
}

function layoutItemsAreValid(items: WorkspaceLayoutItem[], columns: WorkspaceGridColumns, dock: WorkspaceBlockId[]): boolean {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== 6 || !(['actions', 'categories', 'soundboard', 'players', 'playlist', 'quickLaunch'] as WorkspaceBlockId[]).every((id) => ids.has(id))) return false;
  if (new Set(dock).size !== dock.length || dock.some((id) => !ids.has(id))) return false;
  const effectiveDock = new Set(dock);
  return items.every((item) => Number.isInteger(item.x) && Number.isInteger(item.y) && Number.isInteger(item.w) && Number.isInteger(item.h)
    && item.x >= 0 && item.y >= 0 && item.w > 0 && item.h > 0 && item.x + item.w <= columns && item.y + item.h <= workspaceLayoutRows)
    && items.filter((item) => !effectiveDock.has(item.id)).every((item, index, gridItems) => gridItems.slice(index + 1).every((other) => !itemsOverlap(item, other)));
}

function itemsOverlap(first: WorkspaceLayoutItem, second: WorkspaceLayoutItem): boolean {
  return first.x < second.x + second.w && first.x + first.w > second.x && first.y < second.y + second.h && first.y + first.h > second.y;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/** Fit the category band to its square pads while the other rows share the space left. */
export function categorySizedWorkspaceRows(layout: WorkspaceLayout): string | undefined {
  const category = workspaceLayoutItem(layout, 'categories');
  const bottom = category.y + category.h;
  if (category.h >= workspaceLayoutRows || workspaceItemIsDocked(layout, 'categories')) return undefined;
  const conflicts = layout.items.some((item) => {
    if (item.id === 'categories' || workspaceItemIsDocked(layout, item.id) || (item.id === 'quickLaunch' && layout.quickLaunchAttached)) return false;
    const itemBottom = item.y + item.h;
    if (item.y >= bottom || itemBottom <= category.y) return false;
    // A tall neighbouring panel can span the category band; independent panels
    // confined to it must retain their manually allocated height.
    return !(item.y <= category.y && itemBottom >= bottom && item.h > category.h);
  });
  if (conflicts) return undefined;
  const categoryRow = `minmax(0, calc((var(--category-zone-height) - ${category.h - 1} * var(--workspace-gap)) / ${category.h}))`;
  return Array.from({ length: workspaceLayoutRows }, (_, row) => row >= category.y && row < bottom ? categoryRow : 'minmax(0, 1fr)').join(' ');
}

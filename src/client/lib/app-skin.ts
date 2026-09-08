export const appSkinStorageKey = 'sonoriva-app-skin';

export const appSkins = ['original', 'studio', 'porcelain', 'tape'] as const;

export type AppSkin = (typeof appSkins)[number];

export function normalizeAppSkin(value: string | null | undefined): AppSkin {
  return appSkins.includes(value as AppSkin) ? value as AppSkin : 'original';
}

export function readAppSkin(storage: Pick<Storage, 'getItem'> = window.localStorage): AppSkin {
  return normalizeAppSkin(storage.getItem(appSkinStorageKey));
}

export function applyAppSkin(skin: AppSkin, root: HTMLElement = document.documentElement): void {
  root.dataset.skin = skin;
}

export function saveAppSkin(skin: AppSkin, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  storage.setItem(appSkinStorageKey, skin);
}

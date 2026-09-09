const audioExtensions = /\.(?:mp3|wav|ogg|flac|m4a|aac|mp4|webm)$/i;
const audioMimeTypes = new Set([
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/ogg', 'audio/flac',
  'audio/x-flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/x-aac', 'application/ogg',
]);

export type FolderImportMode = 'categories' | 'subcategories' | 'tags';

export interface DroppedAudioFile {
  file: File;
  folders: string[];
  relativePath: string;
}

interface FileEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
}

interface DirectoryEntry extends FileEntry {
  createReader: () => {
    readEntries: (success: (entries: FileEntry[]) => void, failure?: (error: DOMException) => void) => void;
  };
}

export function isSupportedAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  return audioMimeTypes.has(file.type) || audioExtensions.test(file.name);
}

export function titleFromAudioFilename(filename: string): string {
  return filename.replace(audioExtensions, '');
}

export function droppedFilesHaveSubfolders(files: DroppedAudioFile[]): boolean {
  return files.some((item) => item.folders.length > 0);
}

export function firstFolderName(item: DroppedAudioFile): string | undefined {
  return item.folders[0]?.trim().slice(0, 80) || undefined;
}

export function droppedFolderNames(files: DroppedAudioFile[]): string[] {
  return uniqueFolderNames(files.map(firstFolderName).filter((name): name is string => Boolean(name)));
}

export function droppedFolderTags(item: DroppedAudioFile): string[] {
  return uniqueFolderNames(item.folders);
}

export async function readDroppedAudioFiles(dataTransfer: DataTransfer): Promise<DroppedAudioFile[]> {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() as FileEntry | null : null)
    .filter((entry): entry is FileEntry => Boolean(entry));

  const files = entries.length > 0
    ? (await Promise.all(entries.map((entry) => readTopLevelEntry(entry)))).flat()
    : Array.from(dataTransfer.files).map(fileFromRelativePath);

  return files.filter((item) => isSupportedAudioFile(item.file))
    .sort((first, second) => first.relativePath.localeCompare(second.relativePath, 'fr', { sensitivity: 'base', numeric: true }));
}

async function readTopLevelEntry(entry: FileEntry): Promise<DroppedAudioFile[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    return [{ file, folders: [], relativePath: file.name }];
  }
  if (!entry.isDirectory) return [];
  return readDirectoryEntry(entry as DirectoryEntry, []);
}

async function readDirectoryEntry(entry: DirectoryEntry, folders: string[]): Promise<DroppedAudioFile[]> {
  const children = await readAllDirectoryEntries(entry);
  const nested = await Promise.all(children.map(async (child): Promise<DroppedAudioFile[]> => {
    if (child.isDirectory) return readDirectoryEntry(child as DirectoryEntry, [...folders, child.name]);
    if (!child.isFile) return [];
    const file = await readFileEntry(child);
    return [{ file, folders, relativePath: [...folders, file.name].join('/') }];
  }));
  return nested.flat();
}

async function readAllDirectoryEntries(entry: DirectoryEntry): Promise<FileEntry[]> {
  const reader = entry.createReader();
  const entries: FileEntry[] = [];
  while (true) {
    const batch = await new Promise<FileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

function readFileEntry(entry: FileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function fileFromRelativePath(file: File): DroppedAudioFile {
  const path = file.webkitRelativePath || file.name;
  const segments = path.split('/').filter(Boolean);
  const folders = segments.length > 2 ? segments.slice(1, -1) : [];
  return { file, folders, relativePath: [...folders, file.name].join('/') };
}

function uniqueFolderNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.trim().toLocaleLowerCase('fr');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

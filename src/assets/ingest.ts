export interface ImportCandidate {
  file: File;
  relativePath: string;
}

interface LegacyFileEntry {
  isFile: true;
  isDirectory: false;
  name: string;
  fullPath: string;
  file(success: (file: File) => void, failure?: (error: DOMException) => void): void;
}

interface LegacyDirectoryReader {
  readEntries(success: (entries: LegacyEntry[]) => void, failure?: (error: DOMException) => void): void;
}

interface LegacyDirectoryEntry {
  isFile: false;
  isDirectory: true;
  name: string;
  fullPath: string;
  createReader(): LegacyDirectoryReader;
}

type LegacyEntry = LegacyFileEntry | LegacyDirectoryEntry;

export function normalizeRelativePath(value: string) {
  const parts = value.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error(`Unsafe relative path: ${value}`);
  return parts.join('/');
}

function candidateKey(candidate: ImportCandidate) {
  return [
    candidate.relativePath.toLocaleLowerCase(),
    candidate.file.size,
    candidate.file.lastModified
  ].join('\u0000');
}

export function deduplicateCandidates(candidates: ImportCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function collectInputFiles(files: FileList | Iterable<File>) {
  const candidates = Array.from(files).map((file) => ({
    file,
    relativePath: normalizeRelativePath(file.webkitRelativePath || file.name)
  }));
  return deduplicateCandidates(candidates);
}

function readFileEntry(entry: LegacyFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

function readEntryBatch(reader: LegacyDirectoryReader) {
  return new Promise<LegacyEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
}

async function readAllDirectoryEntries(entry: LegacyDirectoryEntry) {
  const reader = entry.createReader();
  const entries: LegacyEntry[] = [];
  while (true) {
    const batch = await readEntryBatch(reader);
    if (batch.length === 0) break;
    entries.push(...batch);
  }
  return entries;
}

async function walkEntry(entry: LegacyEntry): Promise<ImportCandidate[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    return [{
      file,
      relativePath: normalizeRelativePath(entry.fullPath || file.name)
    }];
  }

  const children = await readAllDirectoryEntries(entry);
  const nested = await Promise.all(children.map(walkEntry));
  return nested.flat();
}

export async function collectDroppedFiles(dataTransfer: DataTransfer) {
  const entryTasks: Promise<ImportCandidate[]>[] = [];
  const directFiles: ImportCandidate[] = [];

  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.() as LegacyEntry | null | undefined;
    if (entry) {
      entryTasks.push(walkEntry(entry));
      continue;
    }
    const file = item.getAsFile();
    if (file) directFiles.push({ file, relativePath: normalizeRelativePath(file.name) });
  }

  if (entryTasks.length === 0 && directFiles.length === 0) {
    return collectInputFiles(dataTransfer.files);
  }

  const entryFiles = (await Promise.all(entryTasks)).flat();
  return deduplicateCandidates([...entryFiles, ...directFiles]);
}

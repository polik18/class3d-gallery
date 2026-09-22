import type { AssetKind } from './types.ts';
import type { ImportCandidate } from './ingest.ts';

export interface ClassifiedCandidate extends ImportCandidate {
  kind: AssetKind;
  extension: string;
  detectedBy: 'signature' | 'mime' | 'extension' | 'unknown';
}

const EXTENSION_KIND: Record<string, AssetKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', avif: 'image',
  mp4: 'video', m4v: 'video', webm: 'video', ogv: 'video', mov: 'video',
  mp3: 'audio', m4a: 'audio', aac: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
  pdf: 'pdf',
  glb: 'model3d', gltf: 'model3d'
};

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function mimeKind(mime: string): AssetKind | null {
  const normalized = mime.toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'model/gltf+json' || normalized === 'model/gltf-binary') return 'model3d';
  return null;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function signatureKind(bytes: Uint8Array, extension: string): AssetKind | null {
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image';
  if (ascii(bytes, 0, 8) === '\u0089PNG\r\n\u001a\n') return 'image';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image';
  if (ascii(bytes, 0, 4) === 'glTF') return 'model3d';
  if (ascii(bytes, 0, 4) === 'OggS') return extension === 'ogv' ? 'video' : 'audio';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'audio';
  if (ascii(bytes, 4, 4) === 'ftyp') return ['m4a', 'aac'].includes(extension) ? 'audio' : 'video';
  return null;
}

export async function classifyCandidate(candidate: ImportCandidate): Promise<ClassifiedCandidate> {
  const extension = extensionOf(candidate.file.name);
  const bytes = new Uint8Array(await candidate.file.slice(0, 16).arrayBuffer());
  const signature = signatureKind(bytes, extension);
  if (signature) return { ...candidate, kind: signature, extension, detectedBy: 'signature' };
  const byMime = mimeKind(candidate.file.type);
  if (byMime) return { ...candidate, kind: byMime, extension, detectedBy: 'mime' };
  const byExtension = EXTENSION_KIND[extension];
  if (byExtension) return { ...candidate, kind: byExtension, extension, detectedBy: 'extension' };
  return { ...candidate, kind: 'unsupported', extension, detectedBy: 'unknown' };
}

export async function classifyCandidates(candidates: ImportCandidate[]) {
  return Promise.all(candidates.map(classifyCandidate));
}

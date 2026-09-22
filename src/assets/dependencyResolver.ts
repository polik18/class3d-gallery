import type { ClassifiedCandidate } from './classifier.ts';
import { normalizeRelativePath } from './ingest.ts';

export interface AssetBundle {
  primary: ClassifiedCandidate;
  dependencies: ClassifiedCandidate[];
  missingDependencies: string[];
  externalDependencies: string[];
  errors: string[];
}

function decodeUri(uri: string) {
  try {
    return decodeURIComponent(uri.split(/[?#]/, 1)[0]);
  } catch {
    return uri.split(/[?#]/, 1)[0];
  }
}

function isEmbedded(uri: string) {
  return uri.startsWith('data:') || uri.startsWith('blob:');
}

function isExternal(uri: string) {
  return /^https?:\/\//i.test(uri) || uri.startsWith('//');
}

function directoryOf(relativePath: string) {
  const index = relativePath.lastIndexOf('/');
  return index >= 0 ? relativePath.slice(0, index) : '';
}

function baseName(relativePath: string) {
  return relativePath.split('/').pop() ?? relativePath;
}

function collectGltfUris(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const document = value as { buffers?: Array<{ uri?: unknown }>; images?: Array<{ uri?: unknown }> };
  return [...(document.buffers ?? []), ...(document.images ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
}

export async function resolveAssetBundles(candidates: ClassifiedCandidate[]): Promise<AssetBundle[]> {
  const indexed = candidates.map((candidate, index) => ({ candidate, index }));
  const byPath = new Map(indexed.map(({ candidate }) => [candidate.relativePath.toLowerCase(), candidate]));
  const byName = new Map(indexed.map(({ candidate }) => [candidate.file.name.toLowerCase(), candidate]));
  const claimed = new Set<ClassifiedCandidate>();
  const bundles: Array<AssetBundle & { order: number }> = [];

  for (const { candidate, index } of indexed) {
    if (candidate.extension !== 'gltf') continue;
    claimed.add(candidate);
    const bundle: AssetBundle & { order: number } = {
      primary: candidate,
      dependencies: [],
      missingDependencies: [],
      externalDependencies: [],
      errors: [],
      order: index
    };
    try {
      const document = JSON.parse(await candidate.file.text()) as unknown;
      const baseDirectory = directoryOf(candidate.relativePath);
      for (const uri of collectGltfUris(document)) {
        if (isEmbedded(uri)) continue;
        if (isExternal(uri)) {
          bundle.externalDependencies.push(uri);
          continue;
        }
        const decoded = decodeUri(uri).replace(/\\/g, '/');
        const resolvedPath = normalizeRelativePath([baseDirectory, decoded].filter(Boolean).join('/'));
        const dependency = byPath.get(resolvedPath.toLowerCase()) ?? byName.get(baseName(decoded).toLowerCase());
        if (!dependency) {
          bundle.missingDependencies.push(uri);
          continue;
        }
        if (!bundle.dependencies.includes(dependency)) bundle.dependencies.push(dependency);
        claimed.add(dependency);
      }
    } catch (error) {
      bundle.errors.push(error instanceof Error ? error.message : String(error));
    }
    bundles.push(bundle);
  }

  for (const { candidate, index } of indexed) {
    if (claimed.has(candidate)) continue;
    bundles.push({
      primary: candidate,
      dependencies: [],
      missingDependencies: [],
      externalDependencies: [],
      errors: [],
      order: index
    });
  }

  return bundles.sort((left, right) => left.order - right.order).map(({ order: _order, ...bundle }) => bundle);
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCandidate, classifyCandidates } from '../src/assets/classifier.ts';
import { resolveAssetBundles } from '../src/assets/dependencyResolver.ts';
import { parseArtworkFileName } from '../src/assets/fileNameParser.ts';

function candidate(name: string, data: BlobPart = name, type = '') {
  return { file: new File([data], name, { type, lastModified: 1 }), relativePath: name };
}

test('classifies common multimedia types by MIME and extension', async () => {
  const classified = await classifyCandidates([
    candidate('photo.jpg', 'photo', 'image/jpeg'),
    candidate('movie.mp4'),
    candidate('music.mp3'),
    candidate('document.pdf'),
    candidate('model.gltf'),
    candidate('archive.zip')
  ]);
  assert.deepEqual(classified.map((item) => item.kind), ['image', 'video', 'audio', 'pdf', 'model3d', 'unsupported']);
});

test('file signatures override incorrect extensions', async () => {
  const pdf = await classifyCandidate(candidate('wrong.jpg', '%PDF-1.7', 'image/jpeg'));
  const glb = await classifyCandidate(candidate('wrong.bin', new Uint8Array([0x67, 0x6c, 0x54, 0x46])));
  assert.equal(pdf.kind, 'pdf');
  assert.equal(pdf.detectedBy, 'signature');
  assert.equal(glb.kind, 'model3d');
});

test('structured filename yields seat number, title, author and description', () => {
  assert.deepEqual(parseArtworkFileName('座號１２__未來城市__王小明__使用回收材料製作.glb'), {
    originalFileName: '座號１２__未來城市__王小明__使用回收材料製作.glb',
    displayNumber: 12,
    numberType: 'seat',
    title: '未來城市',
    author: '王小明',
    description: '使用回收材料製作'
  });
});

test('plain filename becomes both title and description', () => {
  const parsed = parseArtworkFileName('我的_聲音_作品.mp3');
  assert.equal(parsed.title, '我的 聲音 作品');
  assert.equal(parsed.description, '我的 聲音 作品');
});

test('GLTF dependencies are grouped and removed from standalone bundles', async () => {
  const gltf = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'scene.bin' }],
    images: [{ uri: 'textures/color%20map.png' }]
  });
  const raw = [
    { ...candidate('scene.gltf', gltf, 'model/gltf+json'), relativePath: 'work/scene.gltf' },
    { ...candidate('scene.bin'), relativePath: 'work/scene.bin' },
    { ...candidate('color map.png', 'image', 'image/png'), relativePath: 'work/textures/color map.png' },
    candidate('poster.jpg', 'image', 'image/jpeg')
  ];
  const bundles = await resolveAssetBundles(await classifyCandidates(raw));
  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].primary.file.name, 'scene.gltf');
  assert.deepEqual(bundles[0].dependencies.map((item) => item.file.name), ['scene.bin', 'color map.png']);
  assert.equal(bundles[1].primary.file.name, 'poster.jpg');
});

test('missing and external GLTF dependencies are reported without network access', async () => {
  const gltf = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'missing.bin' }],
    images: [{ uri: 'https://example.com/remote.png' }]
  });
  const bundles = await resolveAssetBundles(await classifyCandidates([candidate('scene.gltf', gltf)]));
  assert.deepEqual(bundles[0].missingDependencies, ['missing.bin']);
  assert.deepEqual(bundles[0].externalDependencies, ['https://example.com/remote.png']);
});

test('invalid GLTF JSON becomes a bundle error instead of aborting the batch', async () => {
  const classified = await classifyCandidates([candidate('broken.gltf', '{not-json'), candidate('photo.jpg', 'image', 'image/jpeg')]);
  const bundles = await resolveAssetBundles(classified);
  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].errors.length, 1);
  assert.equal(bundles[1].primary.kind, 'image');
});

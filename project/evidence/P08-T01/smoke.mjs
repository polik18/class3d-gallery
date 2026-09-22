import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9228);
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173/class3d-gallery/';
const evidenceDir = path.resolve('project/evidence/P08-T01');
await mkdir(evidenceDir, { recursive: true });

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
assert(target?.webSocketDebuggerUrl, 'Chrome page target is unavailable');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let messageId = 0;
const pending = new Map();
const pageErrors = [];
const requests = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    pageErrors.push(details.exception?.description ?? details.text);
  }
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request);
});

function send(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostic = await evaluate("({ url: location.href, readyState: document.readyState, cards: document.querySelectorAll('.work-card').length, text: document.body?.innerText.slice(0, 300) })");
  throw new Error(`Timed out: ${message}; ${JSON.stringify(diagnostic)}; pageErrors=${JSON.stringify(pageErrors)}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && document.querySelector('#work-grid')", 'app shell ready');
await evaluate('localStorage.clear(); sessionStorage.clear(); location.reload()');
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'clean gallery ready');
await evaluate('document.fonts.ready.then(() => true)');
await new Promise((resolve) => setTimeout(resolve, 500));
requests.length = 0;

const firstAssetId = await evaluate("document.querySelector('.work-card').dataset.assetId");
const firstTitle = await evaluate("document.querySelector('.work-card h3').textContent");

await evaluate("document.querySelector('.work-card .card-like').click()");
await waitFor("document.querySelector('.work-card .card-like').textContent.trim() === '♥ 1'", 'first like');
await evaluate("document.querySelector('.work-card .card-like').click()");
await waitFor("document.querySelector('.work-card .card-like').textContent.trim() === '♡ 0'", 'cancel like');
await evaluate("document.querySelector('.work-card .card-like').click()");
await waitFor("document.querySelector('.work-card .card-like').textContent.trim() === '♥ 1'", 'restore like');

await evaluate("[...document.querySelectorAll('.work-card button')].find((button) => button.textContent.startsWith('留言')).click()");
await waitFor("document.querySelector('#engagement-dialog').open", 'engagement dialog open');
await evaluate(`(() => {
  const dialog = document.querySelector('#engagement-dialog');
  dialog.querySelector('[name="displayName"]').value = '小明';
  dialog.querySelector('[name="body"]').value = '作品很有想像力！';
  dialog.querySelector('.comment-form').requestSubmit();
})()`);
await waitFor("document.querySelector('[data-role=status]').textContent.includes('等待教師核准')", 'pending moderation');
assert.equal(await evaluate("document.querySelectorAll('[data-role=pending] .comment-item').length"), 1);
assert.equal(await evaluate("document.querySelector('[data-role=comment-count]').textContent"), '0 則公開留言');

await evaluate("[...document.querySelectorAll('[data-role=pending] button')].find((button) => button.textContent === '核准').click()");
await waitFor("document.querySelector('[data-role=comment-count]').textContent === '1 則公開留言'", 'approved comment');
assert.equal(await evaluate("document.querySelectorAll('[data-role=approved] .comment-item').length"), 1);

await evaluate("document.querySelector('[data-action=new-visitor]').click()");
await waitFor("document.querySelector('[data-action=like]').textContent.trim() === '♡ 1'", 'new visitor session');
await evaluate("document.querySelector('[data-action=like]').click()");
await waitFor("document.querySelector('[data-action=like]').textContent.trim() === '♥ 2'", 'second visitor like');
await evaluate("document.querySelector('[data-action=close]').click()");
await waitFor("!document.querySelector('#engagement-dialog').open", 'dialog close');
assert.equal(await evaluate("document.querySelector('.work-card .card-like').textContent.trim()"), '♥ 2');
assert.equal(await evaluate("[...document.querySelectorAll('.work-card button')].find((button) => button.textContent.startsWith('留言')).textContent"), '留言 1');

await evaluate(`(() => {
  const select = document.querySelector('#gallery-sort');
  select.value = 'popularity';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
assert.equal(await evaluate("document.querySelector('.work-card').dataset.assetId"), firstAssetId);

const interactionRequests = requests.filter((request) => !request.url.startsWith('https://fonts.gstatic.com/'));
assert.equal(interactionRequests.length, 0, `visitor actions unexpectedly caused network requests: ${interactionRequests.map((request) => request.url).join(', ')}`);

await send('Page.reload', { ignoreCache: true });
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'reloaded gallery');
await waitFor("document.querySelector('.work-card .card-like').textContent.trim() === '♥ 2'", 'likes survive reload');
assert.equal(await evaluate("[...document.querySelectorAll('.work-card button')].find((button) => button.textContent.startsWith('留言')).textContent"), '留言 1');

await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidenceDir, eventsEnabled: true });
await evaluate("[...document.querySelectorAll('.work-card button')].find((button) => button.textContent.startsWith('留言')).click()");
await waitFor("document.querySelector('#engagement-dialog').open", 'dialog reopened');
await evaluate("document.querySelector('[data-action=json]').click(); document.querySelector('[data-action=csv]').click()");
await waitFor(`(async () => {
  const names = await (await fetch('data:application/json,[]')).json().catch(() => []);
  return true;
})()`, 'download dispatch');
for (let index = 0; index < 50; index += 1) {
  const names = await readdir(evidenceDir);
  if (names.includes('class3d-engagement.json') && names.includes('class3d-comments.csv')) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const downloaded = await readdir(evidenceDir);
assert(downloaded.includes('class3d-engagement.json'), 'JSON export was not downloaded');
assert(downloaded.includes('class3d-comments.csv'), 'CSV export was not downloaded');
const exportedJson = JSON.parse(await readFile(path.join(evidenceDir, 'class3d-engagement.json'), 'utf8'));
assert.equal(exportedJson.assets[firstAssetId].likedBy.length, 2);
assert.match(await readFile(path.join(evidenceDir, 'class3d-comments.csv'), 'utf8'), /作品很有想像力/);

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await new Promise((resolve) => setTimeout(resolve, 150));
const mobileLayout = await evaluate(`({
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: document.documentElement.clientWidth,
  dialogRight: Math.round(document.querySelector('#engagement-dialog').getBoundingClientRect().right),
  dialogLeft: Math.round(document.querySelector('#engagement-dialog').getBoundingClientRect().left)
})`);
assert(mobileLayout.documentWidth <= mobileLayout.viewportWidth, `mobile overflow: ${JSON.stringify(mobileLayout)}`);
assert(mobileLayout.dialogLeft >= 0 && mobileLayout.dialogRight <= mobileLayout.viewportWidth, `dialog overflow: ${JSON.stringify(mobileLayout)}`);

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await new Promise((resolve) => setTimeout(resolve, 150));
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(path.join(evidenceDir, 'local-engagement.png'), Buffer.from(screenshot.data, 'base64'));

assert.deepEqual(pageErrors, []);
const result = {
  browser: 'Google Chrome headless',
  appUrl,
  assetId: firstAssetId,
  assetTitle: firstTitle,
  likesAfterTwoVisitors: 2,
  approvedComments: 1,
  persistedAfterReload: true,
  actionNetworkRequests: 0,
  mobileLayout,
  pageErrors
};
console.log(JSON.stringify(result, null, 2));
socket.close();

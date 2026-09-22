import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9228);
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173/class3d-gallery/';
const evidenceDir = path.resolve('project/evidence/P09-T01');
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
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const state = await evaluate("({ phase: document.querySelector('.showcase-stage')?.className, hidden: document.querySelector('#showcase-overlay')?.hidden, text: document.body.innerText.slice(0, 180) })");
  throw new Error(`Timed out: ${message}; ${JSON.stringify(state)}; errors=${JSON.stringify(pageErrors)}`);
}

async function screenshot(name) {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(evidenceDir, name), Buffer.from(capture.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'gallery ready');
await evaluate('localStorage.clear(); sessionStorage.clear(); location.reload()');
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'clean gallery ready');
await evaluate('document.fonts.ready.then(() => true)');
await new Promise((resolve) => setTimeout(resolve, 300));
requests.length = 0;

await evaluate("document.querySelector('#open-settings').click()");
await waitFor("document.querySelector('#settings-dialog').open", 'settings dialog');
await evaluate(`(() => {
  const form = document.querySelector('#exhibition-settings-form');
  const values = { idleDelay: '5', titleDuration: '1', carouselDuration: '4', overviewDuration: '2', popularDuration: '1', imageDuration: '1', modelDuration: '1', videoMaxDuration: '1' };
  for (const [name, value] of Object.entries(values)) {
    form.elements.namedItem(name).value = value;
    form.elements.namedItem(name).dispatchEvent(new Event('input', { bubbles: true }));
  }
  form.elements.namedItem('autoShowcaseEnabled').checked = true;
  form.elements.namedItem('autoShowcaseEnabled').dispatchEvent(new Event('input', { bubbles: true }));
  form.requestSubmit();
})()`);
await waitFor("document.querySelector('.settings-status').textContent.includes('已保存')", 'settings saved');
await evaluate("document.querySelector('.settings-close').click()");
await waitFor("!document.querySelector('#settings-dialog').open", 'settings closed');

await waitFor("document.querySelector('.showcase-stage--title')", 'idle title entry', 7_000);
const enteredAfterConfiguredIdle = true;
await waitFor("document.querySelector('.showcase-stage--carousel')", 'carousel phase', 2_000);
await new Promise((resolve) => setTimeout(resolve, 850));
await screenshot('auto-carousel.png');
await waitFor("document.querySelector('.showcase-stage--overview')", 'overview phase', 5_000);
await new Promise((resolve) => setTimeout(resolve, 850));
await screenshot('auto-overview.png');
await waitFor("document.querySelector('.showcase-stage--popular')", 'popular phase', 3_000);
await waitFor("document.querySelector('.showcase-stage--title')", 'second title cycle', 2_000);

const engagementAfterAutomaticCycle = await evaluate("localStorage.getItem('class3d-gallery:engagement:v1')");
assert.equal(engagementAfterAutomaticCycle, null, 'automatic showcase must not persist human popularity');

await evaluate("document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
await waitFor("document.querySelector('#showcase-overlay').hidden", 'human activity exits showcase');

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await evaluate("document.querySelector('#start-showcase').click()");
await waitFor("document.querySelector('.showcase-stage--title.transition-none')", 'reduced motion title');

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await new Promise((resolve) => setTimeout(resolve, 100));
const mobileLayout = await evaluate(`({
  documentWidth: document.documentElement.scrollWidth,
  viewportWidth: document.documentElement.clientWidth,
  overlayWidth: Math.round(document.querySelector('#showcase-overlay').getBoundingClientRect().width)
})`);
assert(mobileLayout.documentWidth <= mobileLayout.viewportWidth, `mobile overflow: ${JSON.stringify(mobileLayout)}`);
assert.equal(mobileLayout.overlayWidth, mobileLayout.viewportWidth);

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
const interactionRequests = requests.filter((request) => !request.url.startsWith('https://fonts.gstatic.com/'));
assert.equal(interactionRequests.length, 0, `showcase/settings unexpectedly caused network requests: ${interactionRequests.map((request) => request.url).join(', ')}`);
assert.deepEqual(pageErrors, []);

console.log(JSON.stringify({
  browser: 'Google Chrome headless',
  enteredAfterConfiguredIdle,
  phases: ['title', 'carousel', 'overview', 'popular', 'title'],
  activityExit: true,
  reducedMotionTransition: 'none',
  automaticPopularityWrites: 0,
  actionNetworkRequests: interactionRequests.length,
  mobileLayout,
  pageErrors
}, null, 2));
socket.close();

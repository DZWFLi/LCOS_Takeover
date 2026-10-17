import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformRendererHtml, transformRendererScript } from '../lab/startup-transform.mjs';
import {
  handleStartupFixture,
  OFFLINE_FIXTURE_BILLING_API_PATH,
  OFFLINE_FIXTURE_CANVAS_API_PATH,
  OFFLINE_FIXTURE_CANVAS_ID
} from '../lab/startup-fixtures.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundlePath = path.join(root, 'reference', 'tapnow-installed', 'resources', 'web', 'assets', 'index-BAQXnPag.js');
const source = await readFile(bundlePath, 'utf8');
const transformed = transformRendererScript(path.basename(bundlePath), source);
assert.notEqual(transformed, source, 'installed entry bundle should receive the in-memory seam');
assert.equal(transformed.split('window.__LCOS_OFFLINE_TAKEOVER__.bootstrap(Cr);hFl();').length - 1, 1);
assert.ok(transformed.includes('VITE_API_BASE_URL:window.location.origin'));
assert.ok(transformed.includes('VITE_FILE_UPLOAD_URL:"https://app.tapnow.ai"'),
  'only the API base should become same-origin');
assert.equal(transformRendererScript('vendor-chunk.js', 'export const value = 1;'), 'export const value = 1;');

const html = transformRendererHtml('<html><head><script src="/renderer-diagnostics.js"></script></head><body></body></html>');
assert.ok(html.indexOf('/renderer-diagnostics.js') < html.indexOf('/startup-fixture.js'));
assert.equal(transformRendererHtml(html), html, 'HTML transform should be idempotent');

const fixture = handleStartupFixture({ method: 'GET', pathname: OFFLINE_FIXTURE_CANVAS_API_PATH });
assert.equal(fixture.status, 200);
assert.equal(fixture.body.data.id, OFFLINE_FIXTURE_CANVAS_ID);
assert.ok(Array.isArray(fixture.body.data.nodes));
assert.ok(Array.isArray(fixture.body.data.connections));
assert.equal(fixture.body.lcos_adapter.core_connected, false);
assert.equal(handleStartupFixture({ method: 'POST', pathname: OFFLINE_FIXTURE_CANVAS_API_PATH }).status, 501);
assert.equal(handleStartupFixture({ method: 'GET', pathname: '/api/canvas/v1/canvases/another-id' }), null);

const billing = handleStartupFixture({ method: 'GET', pathname: OFFLINE_FIXTURE_BILLING_API_PATH });
assert.equal(billing.status, 200);
assert.equal(billing.body.data.wallet.available, 0);
assert.equal(billing.body.data.subscription, null);
assert.equal(billing.body.data.payingCustomer.isPayingCustomer, false);
assert.equal(billing.body.lcos_adapter.billing_connected, false);
assert.equal(handleStartupFixture({ method: 'POST', pathname: OFFLINE_FIXTURE_BILLING_API_PATH }).status, 501);

console.log('Startup smoke passed: narrow API origin transform, fixture Canvas/billing reads, and explicit mutation failures.');

import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.argv[2];
if (!base || new URL(base).hostname !== '127.0.0.1') throw new Error('Browser tests require an isolated localhost server.');
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1024, height: 768}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/admin`);
  await page.locator('#new').click();
  await page.locator('#project-form').waitFor();
  await page.locator('#tab-properties').click();
  await page.locator('#new-property').click();
  await page.locator('#property-form').waitFor();
  await page.locator('#tab-content').click();
  await page.locator('#content-form').waitFor();
  await page.locator('#tab-projects').click();
  await page.locator('#new').waitFor();

  await page.goto(`${base}/proyectos/browser-gallery`);
  const items = page.locator('.project-gallery-item');
  assert.equal(await items.count(), 2);
  await items.first().click();
  const viewer = page.locator('.gallery-viewer');
  assert.equal(await viewer.evaluate(element => element.open), true);
  assert.equal(await page.locator('.gallery-viewer-count').textContent(), '1 / 2');
  await page.locator('.gallery-viewer-next').click();
  assert.equal(await page.locator('.gallery-viewer-count').textContent(), '2 / 2');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.gallery-viewer-count').textContent(), '1 / 2');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.gallery-viewer').open);
  assert.equal(await items.first().evaluate(element => element === document.activeElement), true);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: admin tabs and gallery navigation.');
} finally {
  await browser.close();
}

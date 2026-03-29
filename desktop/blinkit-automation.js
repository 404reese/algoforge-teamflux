/**
 * zepto-automation.js (kept as blinkit-automation.js for compatibility)
 * Playwright-based automation for Zepto grocery ordering.
 *
 * Strategy:
 *  1. Open Zepto, press Escape to dismiss any location modal (no location flow)
 *  2. For each item: navigate DIRECTLY to zepto.com/search?query=ITEM
 *  3. Click the first pink "ADD" button on the results page
 */

const { chromium } = require('playwright');

let browser = null;
let page    = null;

// ─── Open Zepto ───────────────────────────────────────────────────────────────

async function openBlinkit() {
  if (browser) await closeBlinkit();

  console.log('[Zepto] Launching browser...');
  browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  page = await context.newPage();

  console.log('[Zepto] Navigating to zepto.com...');
  await page.goto('https://www.zepto.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // Wait 2s then dismiss any location/onboarding modal with Escape
  await page.waitForTimeout(2000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  console.log('[Zepto] Ready — using direct search URLs per item');
  return 'Zepto opened';
}

// ─── Search & Add Item via Direct URL ────────────────────────────────────────

async function searchAndAddItem(itemName) {
  if (!page) throw new Error('Zepto not open. Call openBlinkit first.');

  const encoded   = encodeURIComponent(itemName.trim());
  const searchUrl = `https://www.zepto.com/search?query=${encoded}`;

  console.log(`[Zepto] Searching: ${searchUrl}`);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (err) {
    return { success: false, detail: `Navigation failed: ${err.message}` };
  }

  // Wait for product cards to render
  await page.waitForTimeout(2000);

  // ── Strategy 1: Playwright text locators ─────────────────────────────────
  const addSelectors = [
    'button:has-text("ADD")',
    'button:has-text("Add")',
    '[data-testid*="add"]',
    '[class*="AddBtn"]',
    '[class*="add-btn"]',
    '[class*="addToCart"]',
    '[class*="add_btn"]',
  ];

  for (const sel of addSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        console.log(`[Zepto] ✓ Added "${itemName}" via: ${sel}`);
        await page.waitForTimeout(700);
        return { success: true, detail: `"${itemName}" added to cart` };
      }
    } catch (_) {}
  }

  // ── Strategy 2: JS evaluate — finds any button with text "ADD" ───────────
  try {
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const addBtn  = buttons.find(b => b.innerText.trim().toUpperCase() === 'ADD');
      if (addBtn) { addBtn.click(); return true; }
      return false;
    });

    if (clicked) {
      console.log(`[Zepto] ✓ Added "${itemName}" via evaluate`);
      await page.waitForTimeout(700);
      return { success: true, detail: `"${itemName}" added to cart` };
    }
  } catch (e) {
    console.warn('[Zepto] evaluate fallback error:', e.message);
  }

  console.warn(`[Zepto] ✗ No ADD button for: ${itemName}`);
  return { success: false, detail: `Item may be out of stock or unavailable: "${itemName}"` };
}

// ─── Close ────────────────────────────────────────────────────────────────────

async function closeBlinkit() {
  try { if (browser) await browser.close(); } catch (_) {}
  browser = null;
  page    = null;
  console.log('[Zepto] Browser closed');
}

function isOpen() {
  return browser !== null && page !== null;
}

module.exports = { openBlinkit, searchAndAddItem, closeBlinkit, isOpen };

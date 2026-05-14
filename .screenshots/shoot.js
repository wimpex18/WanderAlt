/* Capture WanderAlt /map.html in mobile + desktop viewports.
   Saves PNGs into ./.screenshots/.                              */
const puppeteer = require('puppeteer');
const path = require('path');

const URL = process.env.WA_URL || 'http://localhost:5173/map.html';
const OUT = __dirname;

const VIEWS = [
  { name: 'mobile-390x844',  width: 390,  height: 844,  isMobile: true,  deviceScaleFactor: 2 },
  { name: 'desktop-1280x900', width: 1280, height: 900,  isMobile: false, deviceScaleFactor: 1 },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  for (const v of VIEWS) {
    const page = await browser.newPage();
    await page.setViewport({
      width: v.width, height: v.height,
      deviceScaleFactor: v.deviceScaleFactor,
      isMobile: v.isMobile, hasTouch: v.isMobile,
    });

    const consoleMsgs = [];
    page.on('console', msg => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleMsgs.push(`[PAGEERROR] ${err.message}`));

    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 });
    // wait long enough for wa:catalog-ready + pin render
    await new Promise(r => setTimeout(r, 2500));

    // 1) idle state
    const p1 = path.join(OUT, `${v.name}-1-idle.png`);
    await page.screenshot({ path: p1, fullPage: false });
    console.log('saved', p1);

    // 2) tap first pin to expose detail UI
    const hasPin = await page.$('.map-pin-new');
    if (hasPin) {
      await page.click('.map-pin-new');
      await new Promise(r => setTimeout(r, 600));
      const p2 = path.join(OUT, `${v.name}-2-pin-selected.png`);
      await page.screenshot({ path: p2, fullPage: false });
      console.log('saved', p2);
    } else {
      console.log('no .map-pin-new pin found on', v.name);
    }

    // pin count
    const pinCount = await page.$$eval('.map-pin-new', els => els.length);
    console.log(v.name, 'pins:', pinCount);

    // dump any console logs / errors
    if (consoleMsgs.length) {
      console.log('--- console for', v.name, '---');
      for (const m of consoleMsgs) console.log(m);
    }
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

import { chromium } from 'playwright';

const url = process.argv[2] || 'https://itmen-pipeline.nwlvl.ru/#sales/panel';
const errors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
});
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(15000);
  const authModal = await page.$eval('#auth-modal', (el) => ({
    exists: true,
    open: el.classList.contains('open'),
    text: el.textContent?.slice(0, 200),
  })).catch(() => ({ exists: false }));
  const syncBanner = await page.$eval('.sync-banner', (el) => el.textContent?.slice(0, 300)).catch(() => null);
  const panel = await page.$eval('#page-panel', (el) => ({
    classes: el.className,
    htmlLen: el.innerHTML.length,
    preview: el.innerHTML.slice(0, 300),
    hasError: el.innerHTML.includes('Ошибка отображения'),
    hasSkeleton: el.innerHTML.includes('app-skeleton'),
    hasMetrics: el.innerHTML.includes('metric-card'),
  })).catch((e) => ({ error: e.message }));
  const activePage = await page.evaluate(() => ({
    hash: location.hash,
    activePages: [...document.querySelectorAll('.page.active')].map((p) => p.id),
    title: document.getElementById('page-title')?.textContent,
    metricCardDrill: typeof window.metricCardDrill,
    dashDrillLinkClick: typeof window.dashDrillLinkClick,
    applyDealsReportSpec: typeof window.applyDealsReportSpec,
    apiBackend: window.ITMEN_API?.backend,
    apiEnabled: window.ITMEN_API?.enabled,
    dealsCount: window.state?.deals?.length,
    activePage: window.activePage,
  }));
  console.log(JSON.stringify({ url, errors, panel, activePage, authModal, syncBanner }, null, 2));
} finally {
  await browser.close();
}

import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

async function analyze(page, label, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  const info = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim()?.substring(0, 60) || 'N/A',
    headings: document.querySelectorAll('h1,h2,h3').length,
    sections: document.querySelectorAll('section,[class*="section"]').length,
    imgs: document.querySelectorAll('img').length,
    visibleImgs: [...document.querySelectorAll('img')].filter(i => i.offsetWidth > 0).length,
    links: document.querySelectorAll('a').length,
    bodyHeight: document.body.scrollHeight,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

  console.log(`\n📊 ${label} (${url})`);
  Object.entries(info).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
  return info;
}

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const local = await analyze(page, '本地', 'http://localhost:8080/apps/');
const remote = await analyze(page, '远程', 'https://mattermost.com/apps/');

console.log('\n--- 差异分析 ---');
const checks = [
  ['h1 内容', local.h1 === remote.h1, local.h1, remote.h1],
  ['标题数量', local.headings === remote.headings, local.headings, remote.headings],
  ['区块数量', local.sections === remote.sections, local.sections, remote.sections],
  ['图片总数', local.imgs === remote.imgs, local.imgs, remote.imgs],
  ['可见图片', local.visibleImgs === remote.visibleImgs, local.visibleImgs, remote.visibleImgs],
  ['链接数', local.links === remote.links, local.links, remote.links],
  ['背景色', local.bodyBg === remote.bodyBg, local.bodyBg, remote.bodyBg],
];

checks.forEach(([name, match, l, r]) => {
  const icon = match ? '✅' : '❌';
  console.log(`   ${icon} ${name}: 本地=${l} | 远程=${r}`);
});

await browser.close();

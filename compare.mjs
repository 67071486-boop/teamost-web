import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

try {
  // 截取本地版本
  const localPage = await browser.newPage();
  await localPage.setViewport({ width: 1440, height: 900 });
  await localPage.goto('http://localhost:8080/apps/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await localPage.screenshot({ path: 'local-apps.png', fullPage: false });
  console.log('📸 本地版本: local-apps.png');

  // 截取远程原版
  const remotePage = await browser.newPage();
  await remotePage.setViewport({ width: 1440, height: 900 });
  await remotePage.goto('https://mattermost.com/apps/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await remotePage.screenshot({ path: 'remote-apps.png', fullPage: false });
  console.log('📸 远程原版: remote-apps.png');

  // 比较两个页面的关键渲染差异
  const diff = await localPage.evaluate(() => {
    const body = document.body;
    const cs = getComputedStyle(body);
    return {
      bg: cs.backgroundColor,
      font: cs.fontFamily?.substring(0, 60),
      headerExists: !!document.querySelector('header, .header'),
      navLinks: document.querySelectorAll('header a, nav a, .nav a').length,
      headingCount: document.querySelectorAll('h1, h2, h3').length,
      sectionCount: document.querySelectorAll('section, [class*="section"]').length,
    };
  });

  const diffRemote = await remotePage.evaluate(() => {
    const body = document.body;
    const cs = getComputedStyle(body);
    return {
      bg: cs.backgroundColor,
      font: cs.fontFamily?.substring(0, 60),
      headerExists: !!document.querySelector('header, .header'),
      navLinks: document.querySelectorAll('header a, nav a, .nav a').length,
      headingCount: document.querySelectorAll('h1, h2, h3').length,
      sectionCount: document.querySelectorAll('section, [class*="section"]').length,
    };
  });

  console.log('\n📊 对比:');
  console.log(`              本地                   远程`);
  console.log(`   背景色:     ${diff.bg}          ${diffRemote.bg}`);
  console.log(`   字体:       ${diff.font}`);
  console.log(`              ${diffRemote.font}`);
  console.log(`   Header:     ${diff.headerExists}                      ${diffRemote.headerExists}`);
  console.log(`   导航链接:   ${diff.navLinks}                      ${diffRemote.navLinks}`);
  console.log(`   标题数:     ${diff.headingCount}                      ${diffRemote.headingCount}`);
  console.log(`   区块数:     ${diff.sectionCount}                      ${diffRemote.sectionCount}`);

} finally {
  await browser.close();
}

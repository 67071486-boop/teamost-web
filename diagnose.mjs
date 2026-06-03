import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:8080/apps/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  const diagnostics = await page.evaluate(() => {
    const info = {};

    // 1. Body 背景色
    const bodyStyle = getComputedStyle(document.body);
    info.bodyBg = bodyStyle.backgroundColor;
    info.bodyFont = bodyStyle.fontFamily;

    // 2. 是否有 header/nav
    const header = document.querySelector('header, .header, nav, .nav, .topnav, .navbar');
    info.hasHeader = !!header;
    info.headerHeight = header ? header.offsetHeight : 0;

    // 3. 是否有 hero section
    const hero = document.querySelector('.hero, .hero-section, [class*="hero"]');
    info.hasHero = !!hero;

    // 4. 检查 inline style 标签是否完整
    const styles = document.querySelectorAll('style');
    info.styleTags = styles.length;
    info.stylesTotalLength = Array.from(styles).reduce((sum, s) => sum + s.textContent.length, 0);

    // 5. 第一个可见元素的文字
    const h1 = document.querySelector('h1');
    info.h1Text = h1 ? h1.textContent.trim().substring(0, 80) : 'NO H1';

    // 6. 检查一些关键 CSS class
    const container = document.querySelector('.container');
    info.hasContainer = !!container;
    if (container) {
      const cs = getComputedStyle(container);
      info.containerMaxWidth = cs.maxWidth;
      info.containerPadding = cs.paddingLeft;
    }

    // 7. 检查 body class
    info.bodyClasses = document.body.className;

    // 8. 图片是否渲染
    const imgs = document.querySelectorAll('img');
    info.totalImages = imgs.length;
    info.visibleImages = Array.from(imgs).filter(img => {
      const cs = getComputedStyle(img);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && img.offsetWidth > 0;
    }).length;

    // 9. 页面可视高度
    info.bodyHeight = document.body.scrollHeight;

    return info;
  });

  console.log('📊 页面诊断结果:\n');
  Object.entries(diagnostics).forEach(([k, v]) => {
    console.log(`   ${k}: ${v}`);
  });

  // 再截个小图（首屏）
  await page.setViewport({ width: 1440, height: 800 });
  await page.screenshot({ path: 'screenshot-fold.png' });
  console.log('\n📸 首屏截图: screenshot-fold.png');

} finally {
  await browser.close();
}

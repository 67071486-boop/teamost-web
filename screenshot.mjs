import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 先截 apps 页面
  console.log('📸 截取 apps 页面...');
  await page.goto('http://localhost:8080/apps/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.screenshot({ path: 'screenshot-apps.png', fullPage: true });
  console.log('✅ screenshot-apps.png 已保存');

  // 检查控制台错误
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 重新加载并收集错误
  await page.goto('http://localhost:8080/apps/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  if (errors.length > 0) {
    console.log(`\n⚠️  浏览器控制台错误 (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log(`   ${e}`));
  } else {
    console.log('✅ 无控制台错误');
  }

  // 检查加载失败的资源
  const failedResources = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
      .filter(r => r.transferSize === 0 && r.responseStart === 0)
      .map(r => r.name)
      .filter(url => !url.startsWith('data:'));
  });

  if (failedResources.length > 0) {
    console.log(`\n⚠️  加载失败的资源 (${failedResources.length}):`);
    failedResources.slice(0, 10).forEach(r => console.log(`   ${r}`));
  }

} finally {
  await browser.close();
}

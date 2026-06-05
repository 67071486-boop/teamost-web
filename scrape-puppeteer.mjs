import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { replaceBrand } from './replace-brand.mjs';

const BASE_URL = 'https://mattermost.com';

const PAGES = [
  { url: '/', dir: '' },               // Homepage → static/index.html
  // 以下页面已抓取过，不再重复：
  // { url: '/apps/', dir: 'apps' },
  // { url: '/mobile/', dir: 'mobile' },
  // { url: '/download/', dir: 'download' },
];

// 静态资源扩展名
const STATIC_EXTS = new Set([
  '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.mp4', '.webm', '.json',
]);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox'],
});

async function getPageHTML(page, url) {
  const fullUrl = `${BASE_URL}${url}`;
  console.log(`📥 加载页面: ${fullUrl}`);
  await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  // 等 lazyload 执行
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    // 滚动触发懒加载
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 1000));
    window.scrollTo(0, 0);
  });
  // 等图片懒加载完成
  await page.waitForFunction(() => {
    const lazyImgs = document.querySelectorAll('[data-lazy-src]');
    return lazyImgs.length === 0;
  }, { timeout: 10000 }).catch(() => {});

  await new Promise(r => setTimeout(r, 1000));

  const html = await page.content();
  return html;
}

async function downloadResource(page, url, outputDir) {
  try {
    const resp = await page.evaluate(async (resourceUrl) => {
      const response = await fetch(resourceUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onloadend = () => resolve({
          dataUrl: reader.result,
          contentType: blob.type,
          size: blob.size,
        });
        reader.readAsDataURL(blob);
      });
    }, url);

    if (!resp) return null;

    // 从 data URL 中提取 buffer
    const base64 = resp.dataUrl.split(',')[1];
    if (!base64) return null;
    const buffer = Buffer.from(base64, 'base64');

    const pathname = new URL(url).pathname;
    let localPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    if (!localPath) return null;

    const fullPath = join(outputDir, localPath);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, buffer);
    return { url, localPath, size: buffer.length };
  } catch (e) {
    return null;
  }
}

function extractResources(html) {
  const resources = new Set();

  // 匹配所有 URL
  const urlPattern = /(?:src|href|srcset|data-lazy-src|data-lazy-srcset|imagesrcset|data-src|data-srcset)=["']([^"']+)["']/gi;
  let match;
  while ((match = urlPattern.exec(html)) !== null) {
    let val = match[1];
    // 跳过 data: SVG placeholders
    if (val.startsWith('data:')) continue;
    if (val.startsWith('javascript:')) continue;
    if (val.startsWith('mailto:')) continue;
    if (val.startsWith('#')) continue;
    if (val.startsWith('//')) continue;

    // srcset can have multiple URLs
    if (val.includes(',')) {
      val.split(',').forEach(part => {
        const trimmed = part.trim().split(' ')[0];
        if (trimmed) resources.add(trimmed);
      });
    } else {
      resources.add(val);
    }
  }

  // URL in inline CSS
  const cssUrlPattern = /url\(["']?([^)"']+)["']?\)/gi;
  while ((match = cssUrlPattern.exec(html)) !== null) {
    const url = match[1];
    if (!url.startsWith('data:') && !url.startsWith('https://')) {
      resources.add(url);
    }
  }

  // Resolve and filter
  const resolved = new Set();
  for (const url of resources) {
    try {
      let resolvedUrl;
      if (url.startsWith('https://')) {
        resolvedUrl = url;
      } else if (url.startsWith('http://')) {
        continue; // skip
      } else {
        resolvedUrl = new URL(url, BASE_URL + '/').href;
      }

      if (!resolvedUrl.includes('mattermost.com')) continue;
      if (!resolvedUrl.startsWith('https://')) continue;

      const ext = extname(new URL(resolvedUrl).pathname).toLowerCase();
      if (!STATIC_EXTS.has(ext)) continue;

      resolved.add(resolvedUrl);
    } catch (e) { /* skip */ }
  }

  return [...resolved];
}

function getExt(url) {
  try { return extname(new URL(url).pathname).toLowerCase(); } catch { return ''; }
}

function getRelativePath(pageDir, resourcePath) {
  const depth = pageDir.split('/').filter(Boolean).length;
  const prefix = depth === 0 ? '.' : Array(depth).fill('..').join('/');
  return prefix ? `${prefix}/${resourcePath}` : resourcePath;
}

async function main() {
  const outputDir = './static';
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let totalResources = 0;
  let totalSize = 0;

  for (const pg of PAGES) {
    console.log(`\n🔍 === ${pg.url} ===`);

    // 1. 获取 JS 渲染后的完整 HTML
    const html = await getPageHTML(page, pg.url);

    // 2. 提取静态资源
    const resources = extractResources(html);
    console.log(`   📦 ${resources.length} 个资源`);

    const cssCount = resources.filter(r => getExt(r) === '.css').length;
    const jsCount = resources.filter(r => getExt(r) === '.js').length;
    const imgCount = resources.filter(r => ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(getExt(r))).length;
    console.log(`   CSS:${cssCount} JS:${jsCount} IMG:${imgCount}`);

    // 3. 下载资源
    const results = [];
    for (const url of resources) {
      process.stdout.write('.');
      const result = await downloadResource(page, url, outputDir);
      if (result) {
        results.push(result);
        totalSize += result.size;
      }
    }
    console.log(`\n   ✅ ${results.length}/${resources.length}`);

    // 4. 更新 HTML 路径
    let updatedHtml = html;
    for (const r of results) {
      const relativePath = getRelativePath(pg.dir, r.localPath);
      updatedHtml = updatedHtml.split(r.url).join(relativePath);
      try {
        const encoded = encodeURI(r.url);
        if (encoded !== r.url) updatedHtml = updatedHtml.split(encoded).join(relativePath);
      } catch {}
    }

    // 5. 去掉外部 CDN 脚本
    updatedHtml = updatedHtml.replace(
      /<script[^>]*src=["']https:\/\/[^"']*(?:mutiny|otSDKStub|cookielaw|googletagmanager|google-analytics|bizible|typekit)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
      '<!-- external script removed -->'
    );

    // 6. 品牌名替换: Mattermost → Teamost
    updatedHtml = replaceBrand(updatedHtml);

    // 7. 保存
    const pageDir = join(outputDir, pg.dir);
    if (!existsSync(pageDir)) mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'index.html'), updatedHtml, 'utf-8');
    console.log(`   📄 ${pg.dir}/index.html (${updatedHtml.length}B)`);

    totalResources += results.length;
  }

  await browser.close();

  console.log(`\n🎉 完成！`);
  console.log(`📁 ${outputDir}/`);
  console.log(`📊 ${totalResources} 资源 | ${(totalSize/1024/1024).toFixed(1)}MB`);
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});

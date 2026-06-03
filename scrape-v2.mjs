import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';

const BASE_URL = 'https://mattermost.com';

// 要扒的页面
const PAGES = [
  { url: '/apps/', dir: 'apps' },
  { url: '/mobile/', dir: 'mobile' },
  { url: '/download/', dir: 'download' },
];

// 静态资源扩展名
const STATIC_EXTS = new Set([
  '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.mp4', '.webm', '.json',
  '.xml', '.txt', '.md', '.map',
]);

async function fetchPage(url) {
  const fullUrl = `${BASE_URL}${url}`;
  console.log(`📥 下载页面: ${fullUrl}`);
  const resp = await fetch(fullUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  const html = await resp.text();
  return { html, finalUrl: resp.url };
}

function extractResources(html, pageUrl) {
  const resources = new Set();

  const patterns = [
    /<link[^>]+href=["']([^"']+)["']/gi,
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<img[^>]+srcset=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+srcset=["']([^"']+)["']/gi,
    /url\(["']?([^)"']+)["']?\)/gi,
    /data-src=["']([^"']+)["']/gi,
    /data-srcset=["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('data:')) continue;
      if (url.startsWith('javascript:')) continue;
      if (url.startsWith('mailto:')) continue;
      if (url.startsWith('#')) continue;
      if (url.startsWith('//')) continue;

      if (url.includes(',')) {
        url.split(',').forEach(part => {
          const trimmed = part.trim().split(' ')[0];
          if (trimmed) resources.add(trimmed);
        });
      } else {
        resources.add(url);
      }
    }
  }

  const resolved = new Set();
  for (const url of resources) {
    try {
      let resolvedUrl;
      if (url.startsWith('https://')) {
        resolvedUrl = url;
      } else {
        resolvedUrl = new URL(url, `${BASE_URL}${pageUrl}`).href;
      }
      // 只要 mattermost.com 的静态资源
      if (!resolvedUrl.includes('mattermost.com')) continue;
      const ext = extname(new URL(resolvedUrl).pathname).toLowerCase();
      // 必须是静态资源扩展名
      if (!STATIC_EXTS.has(ext)) continue;
      resolved.add(resolvedUrl);
    } catch (e) { /* skip */ }
  }

  return [...resolved];
}

function getExt(url) {
  try {
    return extname(new URL(url).pathname).toLowerCase();
  } catch { return ''; }
}

async function downloadResource(url, outputDir) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!resp.ok) return null;

    const buffer = Buffer.from(await resp.arrayBuffer());
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
  } catch (e) { return null; }
}

// 计算从 pageDir 到 resourcePath 的相对路径
function getRelativePath(pageDir, resourcePath) {
  // 从 pageDir 往上走的层数
  const depth = pageDir.split('/').filter(Boolean).length;
  const prefix = depth === 0 ? '.' : Array(depth).fill('..').join('/');
  const relPath = prefix ? `${prefix}/${resourcePath}` : resourcePath;
  return relPath.replace(/\\/g, '/');
}

async function main() {
  const outputDir = './static';
  let totalResources = 0;
  let totalSize = 0;

  // 确保输出目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const page of PAGES) {
    console.log(`\n🔍 === 处理页面: ${page.url} ===`);

    // 1. 下载页面 HTML
    const { html, finalUrl } = await fetchPage(page.url);

    // 2. 提取静态资源
    const resources = extractResources(html, page.url);
    console.log(`   📦 发现 ${resources.length} 个静态资源`);

    const cssFiles = resources.filter(r => getExt(r) === '.css');
    const jsFiles = resources.filter(r => getExt(r) === '.js');
    const imgFiles = resources.filter(r => ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(getExt(r)));
    const fontFiles = resources.filter(r => ['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(getExt(r)));
    console.log(`   CSS: ${cssFiles.length} | JS: ${jsFiles.length} | 图片: ${imgFiles.length} | 字体: ${fontFiles.length}`);

    // 3. 下载所有资源
    const results = [];
    for (const url of resources) {
      process.stdout.write('.');
      const result = await downloadResource(url, outputDir);
      if (result) {
        results.push(result);
        totalSize += result.size;
      }
    }
    console.log(`\n   ✅ 下载 ${results.length}/${resources.length} 个资源`);

    if (results.length < resources.length) {
      const failed = resources.filter(r => !results.find(d => d.url === r));
      failed.forEach(f => console.log(`   ⚠️  失败: ${f}`));
    }

    // 4. 更新 HTML 中的链接为本地相对路径
    let updatedHtml = html;
    for (const r of results) {
      const relativePath = getRelativePath(page.dir, r.localPath);
      // 替换绝对 URL
      updatedHtml = updatedHtml.split(r.url).join(relativePath);
      // 也替换 URL 的编码版本
      try {
        const encodedUrl = encodeURI(r.url);
        if (encodedUrl !== r.url) {
          updatedHtml = updatedHtml.split(encodedUrl).join(relativePath);
        }
      } catch {}
    }

    // 5. 替换外部 CDN 脚本为空（避免 404）
    updatedHtml = updatedHtml.replace(
      /<script[^>]+src=["']https:\/\/[^"']*(?:mutiny|otSDKStub|cookielaw)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
      '<!-- external CDN script removed -->'
    );

    // 6. 保存 HTML
    const pageDir = join(outputDir, page.dir);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }
    writeFileSync(join(pageDir, 'index.html'), updatedHtml, 'utf-8');
    console.log(`   📄 保存: ${page.dir}/index.html`);

    totalResources += results.length;
  }

  console.log(`\n\n🎉 全部完成！`);
  console.log(`📁 输出目录: ${outputDir}/`);
  console.log(`📊 总计下载 ${totalResources} 个资源文件`);
  console.log(`💾 总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📂 结构: apps/  mobile/  download/`);
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});

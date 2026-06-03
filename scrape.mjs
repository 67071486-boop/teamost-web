import scrape from 'website-scraper';

const SITE_URL = 'https://mattermost.com';

// 只扒这几个页面，不递归
const pages = [
  '/apps/',
  '/mobile/',
  '/download/',
];

const urls = pages.map(p => `${SITE_URL}${p}`);

const options = {
  urls,
  directory: './www',

  // 不递归！只下载指定页面 + 页面引用的静态资源
  recursive: false,

  // URL 过滤：只下载静态资源，排除二进制安装包
  urlFilter: (url) => {
    if (!url.includes('mattermost.com')) return false;
    if (url.includes('javascript:void')) return false;
    if (url.includes('mailto:')) return false;

    // 排除二进制安装包
    const lower = url.toLowerCase();
    if (lower.endsWith('.msi')) return false;
    if (lower.endsWith('.exe')) return false;
    if (lower.endsWith('.tar.gz')) return false;
    if (lower.endsWith('.zip')) return false;
    if (lower.endsWith('.dmg')) return false;
    if (lower.endsWith('.deb')) return false;
    if (lower.endsWith('.rpm')) return false;
    if (lower.endsWith('.apk')) return false;

    return true;
  },

  // 下载所有静态资源
  sources: [
    { selector: 'img', attr: 'src' },
    { selector: 'img', attr: 'srcset' },
    { selector: 'img', attr: 'data-src' },
    { selector: 'img', attr: 'data-srcset' },
    { selector: 'link[rel="stylesheet"]', attr: 'href' },
    { selector: 'script', attr: 'src' },
    { selector: 'source', attr: 'src' },
    { selector: 'source', attr: 'srcset' },
    { selector: 'video', attr: 'src' },
    { selector: 'link[rel="icon"]', attr: 'href' },
    { selector: 'link[rel="shortcut icon"]', attr: 'href' },
    { selector: 'link[rel="preload"]', attr: 'href' },
    // WordPress 主题资源
    { selector: 'link[href*="wp-content"]', attr: 'href' },
  ],

  // 请求头模拟浏览器
  request: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
    },
  },

  // 资源按类型分目录
  subdirectories: [
    { directory: 'img', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'] },
    { directory: 'css', extensions: ['.css'] },
    { directory: 'js', extensions: ['.js'] },
    { directory: 'fonts', extensions: ['.woff', '.woff2', '.ttf', '.eot', '.otf'] },
    { directory: 'video', extensions: ['.mp4', '.webm'] },
  ],
};

console.log('🚀 开始扒取 Mattermost 页面...');
console.log(`📄 目标页面: ${urls.join(', ')}`);
console.log('⏳ 模式: 不递归，仅下载指定页面 + 静态资源');
console.log('');

try {
  const result = await scrape(options);

  console.log('✅ 扒取完成！');
  console.log(`📁 文件保存到: ./www/`);
  console.log(`📊 共下载 ${result.length} 个文件`);

  // 统计文件类型
  const types = {};
  result.forEach(r => {
    const url = r.url || r;
    const ext = url.split('.').pop()?.split('?')[0] || 'html';
    types[ext] = (types[ext] || 0) + 1;
  });
  console.log('📊 文件类型统计:');
  Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([ext, count]) => {
    console.log(`   .${ext}: ${count}`);
  });
} catch (err) {
  console.error('❌ 扒取出错:', err.message);
  process.exit(1);
}

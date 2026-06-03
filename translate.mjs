import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const API_BASE = 'https://api.deepseek.com/v1/chat/completions';
const API_KEY = 'sk-ecd7241e612241d2a1c057376280050a';
const MODEL = 'deepseek-chat'; // deepseek-v4-flash

const PAGES = ['apps', 'mobile', 'download'];

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'code', 'pre', 'kbd', 'svg', 'math', 'iframe']);

// 收集需要翻译的文本块（按父元素分组，保持上下文）
function collectTextBlocks($) {
  const blocks = []; // { selector: string, texts: string[] }

  // Title
  const title = $('title').text().trim();
  if (title) blocks.push({ selector: 'title', texts: [title] });

  // Meta description
  const desc = $('meta[name="description"]').attr('content');
  if (desc) blocks.push({ selector: 'meta[name="description"]', texts: [desc] });

  // 遍历每个有意义的文本容器
  const seen = new Set();

  $('body').find('h1, h2, h3, h4, h5, h6, p, li, a, span, label, button, figcaption, dt, dd, th, td').each((i, el) => {
    if (SKIP_TAGS.has(el.tagName?.toLowerCase())) return;

    // 检查是否在跳过元素内
    let parent = el.parent;
    let skip = false;
    while (parent) {
      if (SKIP_TAGS.has(parent.tagName?.toLowerCase())) { skip = true; break; }
      parent = parent.parent;
    }
    if (skip) return;

    // 获取元素的直接文本（不包括子元素的文本）
    const ownText = [];
    $(el).contents().each((j, node) => {
      if (node.type === 'text') {
        const t = node.data?.trim();
        if (t && t.length > 1) ownText.push(t);
      }
    });

    if (ownText.length > 0) {
      const key = ownText.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        blocks.push({
          selector: getSelector(el, $),
          texts: ownText,
          element: el,
        });
      }
    }
  });

  // 也处理纯 div 文本块（但优先级低）
  $('body').find('div').each((i, el) => {
    const children = $(el).children();
    if (children.length === 0) {
      const text = $(el).text().trim();
      if (text && text.length > 5 && !seen.has(text)) {
        seen.add(text);
        blocks.push({ selector: getSelector(el, $), texts: [text] });
      }
    }
  });

  return blocks;
}

function getSelector(el, $) {
  const tag = el.tagName?.toLowerCase();
  const id = $(el).attr('id');
  if (id) return `#${id}`;
  const cls = $(el).attr('class')?.split(/\s+/)[0];
  if (cls) return `${tag}.${cls}`;
  return tag;
}

async function translateBatch(items) {
  // 用特殊分隔符，不易被翻译文本包含
  const SEP = '\n---NEXT---\n';
  const input = items.map((item, i) => `[${i}] ${item.text}`).join(SEP);

  try {
    const resp = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.1,
        messages: [{
          role: 'system',
          content: 'Translate each item to Simplified Chinese. Keep product names and technical terms. Return exactly: [N] translation for each item. No extra text.',
        }, {
          role: 'user',
          content: input,
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error(`  API ${resp.status}: ${err.substring(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const result = data?.choices?.[0]?.message?.content || '';

    // 解析 [N] text 格式
    const map = {};
    const lines = result.split('\n');
    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.+)/);
      if (match) {
        const idx = parseInt(match[1]);
        if (idx >= 0 && idx < items.length) {
          const translated = match[2].trim();
          if (translated && translated !== items[idx].text) {
            map[items[idx].text] = translated;
          }
        }
      }
    }

    return map;
  } catch (e) {
    console.error(`  API error: ${e.message}`);
    return null;
  }
}

async function processPage(dir, batchSize = 20) {
  console.log(`\n📄 ${dir}/index.html`);

  const html = readFileSync(`static/${dir}/index.html`, 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  const blocks = collectTextBlocks($);
  console.log(`  ${blocks.length} 个待翻译文本块`);

  // 收集所有唯一文本
  const allTexts = [];
  const seen = new Set();
  for (const block of blocks) {
    for (const t of block.texts) {
      if (!seen.has(t)) {
        seen.add(t);
        allTexts.push(t);
      }
    }
  }
  console.log(`  ${allTexts.length} 个唯一文本`);

  // 分批翻译
  let translationMap = {};
  const batchItems = allTexts.map((text, i) => ({ id: i, text }));
  const totalBatches = Math.ceil(batchItems.length / batchSize);

  for (let i = 0; i < batchItems.length; i += batchSize) {
    const batch = batchItems.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    process.stdout.write(`  [${batchNum}/${totalBatches}] 翻译 ${i+1}-${Math.min(i+batchSize, batchItems.length)}...`);

    const result = await translateBatch(batch);
    if (result) {
      Object.assign(translationMap, result);
      console.log(` ✅ ${Object.keys(result).length}`);
    } else {
      console.log(' ❌ 失败，重试中...');
      // 重试一次
      await new Promise(r => setTimeout(r, 2000));
      const retry = await translateBatch(batch);
      if (retry) {
        Object.assign(translationMap, retry);
        console.log('   ✅ 重试成功');
      }
    }

    // 限速
    await new Promise(r => setTimeout(r, 500));
  }

  // 应用翻译 — cheerio DOM 操作
  let replacedCount = 0;

  // 翻译 title
  const titleEl = $('head > title');
  if (titleEl.length) {
    const titleText = titleEl.text().trim();
    if (translationMap[titleText]) {
      titleEl.text(translationMap[titleText]);
      replacedCount++;
    }
  }

  // 翻译 meta
  const descEl = $('meta[name="description"]');
  if (descEl.length) {
    const descText = descEl.attr('content');
    if (descText && translationMap[descText]) {
      descEl.attr('content', translationMap[descText]);
      replacedCount++;
    }
  }

  // 翻译 og:title
  const ogTitle = $('meta[property="og:title"]');
  if (ogTitle.length) {
    const ogText = ogTitle.attr('content');
    if (ogText && translationMap[ogText]) {
      ogTitle.attr('content', translationMap[ogText]);
    }
  }

  // 遍历 body 文本节点替换
  $('body *').each((i, el) => {
    if (SKIP_TAGS.has(el.tagName?.toLowerCase())) return;

    // 获取所有子节点
    const childNodes = $(el).contents();
    childNodes.each((j, node) => {
      if (node.type === 'text') {
        const trimmed = node.data?.trim();
        if (trimmed && translationMap[trimmed] && translationMap[trimmed] !== trimmed) {
          const leading = node.data.match(/^(\s*)/)[1] || '';
          const trailing = node.data.match(/(\s*)$/)[1] || '';
          $(node).replaceWith(leading + translationMap[trimmed] + trailing);
          replacedCount++;
        }
      }
    });
  });

  const output = $.html();
  writeFileSync(`static/${dir}/index.html`, output, 'utf-8');
  console.log(`  📁 已保存 (${(output.length/1024).toFixed(0)}KB) | ${Object.keys(translationMap).length} 条翻译 | ${replacedCount} 处替换`);
}

async function main() {
  console.log('🌐 DeepSeek v4 Flash 翻译中...\n');

  for (const dir of PAGES) {
    await processPage(dir, 15);
  }

  console.log('\n🎉 翻译完成！刷新 http://localhost:8080/apps/ 查看');
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});

import * as cheerio from 'cheerio';

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'code', 'pre']);

/**
 * Replace "Mattermost" with "Teamost" in visible text nodes of an HTML string.
 * Does NOT modify:
 *   - Content inside <script>, <style>, <noscript>, <code>, <pre>
 *   - URLs in attributes (href, src, etc.)
 */
export function replaceBrand(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  // Replace in <title>
  $('title').each((i, el) => {
    const text = $(el).text();
    if (text.includes('Mattermost')) {
      $(el).text(text.replaceAll('Mattermost', 'Teamost'));
    }
  });

  // Replace in JSON-LD structured data (safe text, not executable)
  $('script[type="application/ld+json"]').each((i, el) => {
    const text = $(el).html();
    if (text?.includes('Mattermost')) {
      $(el).html(text.replaceAll('Mattermost', 'Teamost'));
    }
  });

  // Replace in meta tags' content attribute
  $('meta').each((i, el) => {
    const content = $(el).attr('content');
    if (content && content.includes('Mattermost')) {
      $(el).attr('content', content.replaceAll('Mattermost', 'Teamost'));
    }
  });

  // Text-containing attributes to replace (NOT href, src, action, etc.)
  const TEXT_ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];

  // Walk text nodes and attributes in the tree
  function walk(el) {
    const children = $(el).contents();
    children.each((j, node) => {
      if (node.type === 'text') {
        if (node.data?.includes('Mattermost')) {
          node.data = node.data.replaceAll('Mattermost', 'Teamost');
        }
      } else if (node.type === 'tag') {
        if (!SKIP_TAGS.has(node.tagName?.toLowerCase())) {
          // Replace in text-containing attributes
          for (const attr of TEXT_ATTRS) {
            const val = $(node).attr(attr);
            if (val?.includes('Mattermost')) {
              $(node).attr(attr, val.replaceAll('Mattermost', 'Teamost'));
            }
          }
          walk(node);
        }
      }
    });
  }

  // Walk both head and body
  $('head').each((i, el) => walk(el));
  $('body').each((i, el) => walk(el));

  return $.html();
}

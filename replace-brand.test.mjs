import { describe, it } from 'node:test';
import assert from 'node:assert';
import { replaceBrand } from './replace-brand.mjs';

describe('replaceBrand', () => {
  it('replaces Mattermost in visible text nodes', () => {
    const html = '<p>Mattermost is great</p>';
    const result = replaceBrand(html);
    assert.ok(result.includes('Teamost is great'));
    assert.ok(!result.includes('Mattermost'));
  });

  it('does not replace text inside <script> tags', () => {
    const html = '<script>const name = "Mattermost";</script>';
    const result = replaceBrand(html);
    assert.ok(result.includes('"Mattermost"'));
  });

  it('does not replace text inside <style> tags', () => {
    const html = '<style>.Mattermost-header { color: red; }</style>';
    const result = replaceBrand(html);
    assert.ok(result.includes('.Mattermost-header'));
  });

  it('replaces in <title> tag', () => {
    const html = '<title>Mattermost Download</title>';
    const result = replaceBrand(html);
    assert.ok(result.includes('<title>Teamost Download</title>'),
      'title text should be replaced');
  });

  it('replaces in meta description content', () => {
    const html = '<meta name="description" content="Download Mattermost apps">';
    const result = replaceBrand(html);
    assert.ok(result.includes('content="Download Teamost apps"'));
  });

  it('does not replace mattermost in href URLs', () => {
    const html = '<a href="https://mattermost.com/about/">About Mattermost</a>';
    const result = replaceBrand(html);
    assert.ok(result.includes('href="https://mattermost.com/about/"'),
      'URL should stay unchanged');
    assert.ok(result.includes('>About Teamost<'),
      'link text should be replaced');
  });

  it('replaces in JSON-LD structured data', () => {
    const html = '<script type="application/ld+json">{"name":"Mattermost","url":"https://mattermost.com"}</script>';
    const result = replaceBrand(html);
    assert.ok(result.includes('"name":"Teamost"'), 'JSON-LD name should be replaced');
    assert.ok(result.includes('"url":"https://mattermost.com"'), 'JSON-LD URL should stay');
  });

  it('does not replace in non-JSON-LD script tags', () => {
    const html = '<script>const x = "Mattermost";</script><script type="text/javascript">const y = "Mattermost";</script>';
    const result = replaceBrand(html);
    // Both should stay unchanged
    const count = (result.match(/Mattermost/g) || []).length;
    assert.equal(count, 2, 'executable script content should never be touched');
  });

  it('handles multiple occurrences across nested elements', () => {
    const html = '<div><h1>Mattermost</h1><p>Try Mattermost today. Mattermost rocks.</p></div>';
    const result = replaceBrand(html);
    assert.ok(!result.includes('Mattermost'));
    const count = (result.match(/Teamost/g) || []).length;
    assert.equal(count, 3);
  });
});

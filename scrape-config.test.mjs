import { describe, it } from 'node:test';
import assert from 'node:assert';
import { replaceBrand } from './replace-brand.mjs';

// Test the brand replacement integration with realistic scraped HTML
describe('scrape pipeline - brand replacement', () => {
  it('handles a realistic scraped page with multiple Mattermost mentions', () => {
    const html = `<!DOCTYPE html><html lang="en-US"><head>
      <title>Download Mattermost Apps | Mattermost</title>
      <meta name="description" content="Download Mattermost desktop and mobile apps.">
      <meta property="og:title" content="Mattermost Apps Download">
      <script>window.mattermostConfig = { version: "Mattermost-9.0" };</script>
      <style>.mattermost-logo { color: blue; }</style>
    </head><body>
      <h1>Mattermost Applications</h1>
      <p>Mattermost is a secure collaboration platform.</p>
      <a href="https://mattermost.com/about/">Learn more about Mattermost</a>
      <img src="../wp-content/img/mattermost-hero.webp" alt="Mattermost hero image">
      <footer>&copy; 2024 Mattermost, Inc.</footer>
    </body></html>`;

    const result = replaceBrand(html);

    // Visible text should be replaced
    assert.ok(result.includes('Teamost Applications'), 'h1 should be replaced');
    assert.ok(result.includes('Teamost is a secure'), 'p should be replaced');
    assert.ok(result.includes('>Learn more about Teamost<'), 'link text should be replaced');
    assert.ok(result.includes('2024 Teamost, Inc.'), 'footer should be replaced');

    // Script and style contents should NOT be replaced
    assert.ok(result.includes('"Mattermost-9.0"'), 'script content should stay');
    assert.ok(result.includes('.mattermost-logo'), 'style content should stay');

    // alt text should be replaced
    assert.ok(result.includes('alt="Teamost hero image"'), 'alt text should be replaced');

    // title and meta should be replaced
    assert.ok(result.includes('<title>Download Teamost Apps | Teamost</title>'), 'title should be replaced');
    assert.ok(result.includes('content="Download Teamost desktop and mobile apps."'), 'meta desc should be replaced');
    assert.ok(result.includes('content="Teamost Apps Download"'), 'og:title should be replaced');
  });

  it('handles the homepage hero section', () => {
    const html = `<!DOCTYPE html><html><head>
      <title>Mattermost: The Secure Collaboration Platform</title>
    </head><body>
      <section class="hero">
        <h1>Welcome to Mattermost</h1>
        <p class="lead">Mattermost is your team&rsquo;s secure command center.</p>
        <a href="/download/" class="cta">Download Mattermost</a>
      </section>
    </body></html>`;

    const result = replaceBrand(html);

    assert.ok(!result.includes('Mattermost'), 'no Mattermost should remain');
    assert.ok(result.includes('Welcome to Teamost'), 'hero h1 should be replaced');
    assert.ok(result.includes('Teamost is your team'), 'hero p should be replaced');
    assert.ok(result.includes('>Download Teamost<'), 'CTA button text should be replaced');
    assert.ok(result.includes('<title>Teamost: The Secure Collaboration Platform</title>'));
  });
});

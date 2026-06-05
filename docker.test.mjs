import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

const IMAGE = 'teamost:test';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
}

describe('Docker image', () => {
  it('builds successfully', () => {
    const out = run(`docker build -t ${IMAGE} .`);
    assert.ok(out.includes('naming to'), 'should finish build');
  });

  it('nginx config is valid', () => {
    const out = run(`docker run --rm ${IMAGE} nginx -t`);
    assert.ok(out.includes('syntax is ok') || out.includes('successful'),
      'nginx config should be valid');
  });

  it('contains static HTML files', () => {
    const out = run(`docker run --rm ${IMAGE} sh -c "ls /usr/share/nginx/html/apps/index.html"`);
    assert.ok(out.includes('index.html'), 'should have apps/index.html');
  });

  it('has gzip enabled in config', () => {
    const out = run(`docker run --rm ${IMAGE} sh -c "cat /etc/nginx/conf.d/default.conf"`);
    assert.ok(out.includes('gzip on'), 'nginx config should enable gzip');
  });

  it('has 404 error page configured', () => {
    const out = run(`docker run --rm ${IMAGE} sh -c "cat /etc/nginx/conf.d/default.conf"`);
    assert.ok(out.includes('error_page 404'), 'should configure custom 404');
  });

  it('has cache headers for images', () => {
    const out = run(`docker run --rm ${IMAGE} sh -c "cat /etc/nginx/conf.d/default.conf"`);
    assert.ok(out.includes('expires 1y'), 'should set long image cache');
  });

  it('has SSL config for HTTPS', () => {
    const out = run(`docker run --rm ${IMAGE} sh -c "cat /etc/nginx/conf.d/default.conf"`);
    assert.ok(out.includes('443 ssl'), 'should listen on 443 with SSL');
    assert.ok(out.includes('ssl_certificate'), 'should configure SSL certs');
    assert.ok(out.includes('HSTS'), 'should set HSTS header');
  });

  it('redirects HTTP to HTTPS', () => {
    const out = run(`docker run --rm ${IMAGE} sh -c "cat /etc/nginx/conf.d/default.conf"`);
    assert.ok(out.includes('301 https'), 'port 80 should redirect to HTTPS');
  });
});

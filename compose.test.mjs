import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

describe('docker-compose.yml', () => {
  it('exists', () => {
    assert.ok(existsSync('docker-compose.yml'), 'should exist');
  });

  it('defines teamost-website service', () => {
    const content = readFileSync('docker-compose.yml', 'utf-8');
    assert.ok(content.includes('teamost-website'), 'should have teamost-website service');
    assert.ok(content.includes('image:') || content.includes('build:'),
      'should specify image or build');
  });

  it('exposes port 443', () => {
    const content = readFileSync('docker-compose.yml', 'utf-8');
    assert.ok(content.includes('443'), 'should expose HTTPS port');
  });

  it('includes Watchtower for auto-update', () => {
    const content = readFileSync('docker-compose.yml', 'utf-8');
    assert.ok(content.includes('watchtower') || content.includes('containrrr/watchtower'),
      'should include Watchtower service');
  });

  it('mounts SSL certificate volume', () => {
    const content = readFileSync('docker-compose.yml', 'utf-8');
    assert.ok(content.includes('ssl') || content.includes('cert') || content.includes('443:443'),
      'should reference SSL configuration');
  });
});

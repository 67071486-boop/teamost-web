import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_PATH = join(import.meta.dirname, '.github', 'workflows', 'deploy.yml');

describe('GitHub Actions deploy workflow', () => {
  it('workflow file exists', () => {
    assert.ok(existsSync(WORKFLOW_PATH), '.github/workflows/deploy.yml should exist');
  });

  it('triggers on push to master', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.ok(content.includes('push'), 'should trigger on push');
    assert.ok(content.includes("branches: ['master']") || content.includes('branches: ["master"]')
      || content.includes("branches:\n      - master"),
      'should target master branch');
  });

  it('has a Docker build step', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.ok(content.includes('docker/build-push-action'),
      'should use docker/build-push-action');
    assert.ok(content.includes('docker build') || content.includes('build-push'),
      'should have a docker build step');
  });

  it('has a push to container registry step', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.ok(content.includes('push: true') || content.includes('push: true'),
      'should push image');
    assert.ok(
      content.includes('registry') || content.includes('REGISTRY') || content.includes('aliyun'),
      'should reference a container registry'
    );
  });

  it('has registry credentials configured', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.ok(content.includes('username:') && content.includes('password:'),
      'should have docker login credentials');
  });
});

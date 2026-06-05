import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'http://127.0.0.1:3001';

// We'll start the server as a child process via the module itself
let serverProcess;
let authToken;

async function login() {
  const res = await fetch(`${BASE}/admin/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const json = await res.json();
  authToken = json.token;
}

async function authFetch(path, options = {}) {
  const headers = { ...options.headers, Authorization: `Bearer ${authToken}` };
  return fetchAPI(path, { ...options, headers });
}

async function fetchAPI(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = null; }
  return { status: res.status, headers: res.headers, body, json };
}

describe('Admin Server', () => {
  before(async () => {
    // Use a test database
    const { spawn } = await import('node:child_process');
    serverProcess = spawn('node', ['admin-server.mjs'], {
      env: { ...process.env, PORT: '3001', DB_PATH: ':memory:' },
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    // Wait for server to be ready
    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`${BASE}/admin/api/health`);
        break;
      } catch {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });

  describe('Auth', () => {
    it('POST /admin/api/login returns token for valid credentials', async () => {
      const res = await fetchAPI('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      });
      assert.equal(res.status, 200);
      assert.ok(res.json.token, 'should have token');
      assert.equal(typeof res.json.token, 'string');
    });

    it('POST /admin/api/login rejects invalid password', async () => {
      const res = await fetchAPI('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      });
      assert.equal(res.status, 401);
    });

    it('POST /admin/api/login rejects missing fields', async () => {
      const res = await fetchAPI('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    it('protected endpoints reject unauthenticated requests', async () => {
      const res = await fetchAPI('/admin/api/licenses');
      assert.equal(res.status, 401);
    });
  });

  describe('License CRUD', () => {
    before(async () => {
      await login();
    });

    it('POST /admin/api/licenses creates a license', async () => {
      const res = await authFetch('/admin/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'ACME Corp',
          product: 'Teamost Enterprise',
          license_key: 'TEAM-XXXX-YYYY-ZZZZ',
          seats: 50,
          issued_date: '2026-06-05',
          expiry_date: '2027-06-05',
          notes: '年度订阅',
        }),
      });
      assert.equal(res.status, 201);
      assert.ok(res.json.id, 'should return created license id');
      assert.equal(res.json.customer_name, 'ACME Corp');
      assert.equal(res.json.status, 'active');
    });

    it('POST rejects duplicate license_key', async () => {
      const res = await authFetch('/admin/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'Another Corp',
          product: 'Teamost Starter',
          license_key: 'TEAM-XXXX-YYYY-ZZZZ',
          seats: 10,
          issued_date: '2026-06-05',
        }),
      });
      assert.equal(res.status, 409);
    });

    it('GET /admin/api/licenses returns list', async () => {
      const res = await authFetch('/admin/api/licenses');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.json), 'should be array');
      assert.equal(res.json.length, 1);
      assert.equal(res.json[0].customer_name, 'ACME Corp');
    });

    it('GET /admin/api/licenses?search= filters by customer', async () => {
      const res = await authFetch('/admin/api/licenses?search=ACME');
      assert.equal(res.status, 200);
      assert.equal(res.json.length, 1);

      const res2 = await authFetch('/admin/api/licenses?search=NONEXIST');
      assert.equal(res2.status, 200);
      assert.equal(res2.json.length, 0);
    });

    it('GET /admin/api/licenses?status= filters by status', async () => {
      const res = await authFetch('/admin/api/licenses?status=active');
      assert.equal(res.status, 200);
      assert.equal(res.json.length, 1);

      const res2 = await authFetch('/admin/api/licenses?status=revoked');
      assert.equal(res2.status, 200);
      assert.equal(res2.json.length, 0);
    });

    it('PUT /admin/api/licenses/:id updates a license', async () => {
      const list = await authFetch('/admin/api/licenses');
      const id = list.json[0].id;

      const res = await authFetch(`/admin/api/licenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: 100, notes: '扩容' }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.seats, 100);
      assert.equal(res.json.notes, '扩容');
      // unchanged fields preserved
      assert.equal(res.json.customer_name, 'ACME Corp');
    });

    it('PUT returns 404 for nonexistent id', async () => {
      const res = await authFetch('/admin/api/licenses/99999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: 10 }),
      });
      assert.equal(res.status, 404);
    });

    it('DELETE /admin/api/licenses/:id revokes (soft-deletes) a license', async () => {
      const list = await authFetch('/admin/api/licenses');
      const id = list.json[0].id;

      const res = await authFetch(`/admin/api/licenses/${id}`, {
        method: 'DELETE',
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.status, 'revoked');

      // Still appears in list by default? No — default shows active only
      const list2 = await authFetch('/admin/api/licenses');
      assert.equal(list2.json.length, 0);
    });
  });

  describe('Frontend pages', () => {
    it('GET /admin/ returns login page HTML', async () => {
      const res = await fetchAPI('/admin/');
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('<!DOCTYPE html>') || res.body.includes('<html'), 'should be HTML');
      assert.ok(res.body.includes('登录') || res.body.includes('login'), 'should have login');
    });

    it('GET /admin/dashboard without auth redirects to login', async () => {
      const res = await fetchAPI('/admin/dashboard', { redirect: 'manual' });
      assert.ok(res.status === 302 || res.status === 401, 'should redirect or reject');
    });

    it('GET /admin/dashboard with auth cookie returns dashboard', async () => {
      // Login to get token
      const loginRes = await fetch(`${BASE}/admin/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      });
      const { token } = await loginRes.json();

      const res = await fetch(`${BASE}/admin/dashboard`, {
        headers: { Cookie: `token=${token}` },
        redirect: 'manual',
      });
      assert.equal(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes('管理') || body.includes('dashboard') || body.includes('授权'), 'should have dashboard content');
    });
  });
});

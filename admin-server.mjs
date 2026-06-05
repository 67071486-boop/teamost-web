import express from 'express';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/opt/teamost/data/licenses.db';
const JWT_SECRET = process.env.JWT_SECRET || 'teamost-admin-secret-change-me';

// ── Database ────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    product TEXT NOT NULL,
    license_key TEXT NOT NULL UNIQUE,
    seats INTEGER NOT NULL DEFAULT 1,
    issued_date TEXT NOT NULL,
    expiry_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed default admin user
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
}

// ── Auth middleware ──────────────────────────────────────────────────────────
function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// Page auth: redirects to login instead of returning JSON
function pageAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.redirect('/admin/');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.redirect('/admin/');
  }
}

// ── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/admin/api/health', (req, res) => res.json({ ok: true }));

// ── Login page ──────────────────────────────────────────────────────────────
app.get('/admin/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Teamost 授权管理 — 登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);width:100%;max-width:400px}
h1{text-align:center;color:#1a1a2e;margin-bottom:8px;font-size:24px}
.sub{text-align:center;color:#888;margin-bottom:32px;font-size:14px}
label{display:block;margin-bottom:6px;font-weight:500;color:#333;font-size:14px}
input{width:100%;padding:10px 14px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px;margin-bottom:20px;outline:none;transition:border-color .2s}
input:focus{border-color:#1677ff}
button{width:100%;padding:10px;background:#1677ff;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:500;transition:background .2s}
button:hover{background:#4096ff}
.error{color:#ff4d4f;text-align:center;margin-bottom:16px;font-size:13px;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>Teamost</h1>
  <p class="sub">授权管理系统</p>
  <div class="error" id="error"></div>
  <form id="loginForm">
    <label>用户名</label>
    <input type="text" id="username" placeholder="请输入用户名" required>
    <label>密码</label>
    <input type="password" id="password" placeholder="请输入密码" required>
    <button type="submit">登 录</button>
  </form>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('error');
  errorEl.style.display = 'none';
  try {
    const res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error; errorEl.style.display = 'block'; return; }
    document.cookie = 'token=' + data.token + ';path=/;max-age=28800';
    window.location.href = '/admin/dashboard';
  } catch (err) {
    errorEl.textContent = '网络错误，请重试';
    errorEl.style.display = 'block';
  }
});
</script>
</body>
</html>`);
});

// ── Dashboard page ──────────────────────────────────────────────────────────
app.get('/admin/dashboard', pageAuth, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Teamost 授权管理</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100vh}
header{background:#fff;padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 4px rgba(0,0,0,.08);position:sticky;top:0;z-index:100}
header h2{font-size:18px;color:#1a1a2e}
header .user{display:flex;align-items:center;gap:12px;font-size:14px;color:#666}
header .user button{background:none;border:1px solid #d9d9d9;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:13px;color:#666}
main{padding:24px;max-width:1200px;margin:0 auto}
.toolbar{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.toolbar input,.toolbar select{ padding:8px 12px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px;outline:none}
.toolbar input{flex:1;min-width:200px}
.toolbar button{padding:8px 16px;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:background .2s}
.btn-create{background:#1677ff;color:#fff}
.btn-create:hover{background:#4096ff}
table{width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);border-collapse:collapse}
th{background:#fafafa;padding:12px 16px;text-align:left;font-size:13px;font-weight:600;color:#555;border-bottom:1px solid #f0f0f0}
td{padding:12px 16px;font-size:14px;color:#333;border-bottom:1px solid #f5f5f5}
.status{display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:500}
.status-active{background:#f6ffed;color:#52c41a;border:1px solid #b7eb8f}
.status-revoked{background:#fff2f0;color:#ff4d4f;border:1px solid #ffccc7}
.status-expired{background:#fffbe6;color:#faad14;border:1px solid #ffe58f}
td button{padding:3px 10px;border:1px solid #d9d9d9;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;margin-right:6px}
td button.revoke{color:#ff4d4f;border-color:#ffccc7}
td button.revoke:hover{background:#fff2f0}
.license-key{font-family:monospace;font-size:12px;background:#f5f5f5;padding:2px 6px;border-radius:4px}
.modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:200}
.modal{background:#fff;border-radius:12px;padding:32px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.12)}
.modal h3{margin-bottom:24px;font-size:18px;color:#1a1a2e}
.modal label{display:block;margin-bottom:6px;font-weight:500;color:#333;font-size:14px}
.modal input,.modal select,.modal textarea{width:100%;padding:8px 12px;border:1px solid #d9d9d9;border-radius:8px;font-size:14px;margin-bottom:16px;outline:none;font-family:inherit}
.modal textarea{resize:vertical;min-height:60px}
.modal .actions{display:flex;gap:12px;justify-content:flex-end;margin-top:8px}
.modal .actions button{padding:8px 20px;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:500}
.modal .btn-save{background:#1677ff;color:#fff}
.modal .btn-cancel{background:#f5f5f5;color:#666}
</style>
</head>
<body>
<header>
  <h2>Teamost 授权管理</h2>
  <div class="user">
    <span id="username"></span>
    <button onclick="logout()">退出</button>
  </div>
</header>
<main>
  <div class="toolbar">
    <input type="text" id="search" placeholder="搜索客户名 / 授权码 / 产品...">
    <select id="statusFilter">
      <option value="">全部状态</option>
      <option value="active" selected>有效</option>
      <option value="revoked">已撤销</option>
      <option value="expired">已过期</option>
    </select>
    <button class="btn-create" onclick="openCreate()">+ 创建授权</button>
  </div>
  <table>
    <thead>
      <tr>
        <th>客户名称</th>
        <th>产品版本</th>
        <th>授权码</th>
        <th>用户数</th>
        <th>签发日期</th>
        <th>到期日期</th>
        <th>状态</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody id="licenseTable"><tr><td colspan="8" style="text-align:center;color:#999;padding:40px">加载中...</td></tr></tbody>
  </table>
</main>

<!-- Create/Edit Modal -->
<div class="modal-overlay" id="modal" style="display:none">
  <div class="modal">
    <h3 id="modalTitle">创建授权</h3>
    <form id="licenseForm">
      <input type="hidden" id="editId">
      <label>客户名称 *</label>
      <input type="text" id="customer_name" required placeholder="公司或客户名称">
      <label>产品版本 *</label>
      <input type="text" id="product" required placeholder="如 Teamost Enterprise 5.0">
      <label>授权码 *</label>
      <input type="text" id="license_key" required placeholder="如 TEAM-XXXX-YYYY-ZZZZ">
      <label>授权用户数</label>
      <input type="number" id="seats" value="1" min="1">
      <div style="display:flex;gap:12px">
        <div style="flex:1">
          <label>签发日期 *</label>
          <input type="date" id="issued_date" required>
        </div>
        <div style="flex:1">
          <label>到期日期</label>
          <input type="date" id="expiry_date">
        </div>
      </div>
      <label>备注</label>
      <textarea id="notes" placeholder="可选备注信息"></textarea>
      <div class="actions">
        <button type="button" class="btn-cancel" onclick="closeModal()">取消</button>
        <button type="submit" class="btn-save">保存</button>
      </div>
    </form>
  </div>
</div>

<script>
const API = '/admin/api/licenses';
let currentUser = null;

function getStatusClass(s) {
  return s === 'active' ? 'active' : s === 'revoked' ? 'revoked' : 'expired';
}
function getStatusLabel(s) {
  return s === 'active' ? '有效' : s === 'revoked' ? '已撤销' : '已过期';
}

async function fetchUser() {
  try {
    const res = await fetch('/admin/api/licenses');
    if (res.status === 401) { window.location.href = '/admin/'; return; }
    currentUser = { username: 'admin' }; // from token payload
    document.getElementById('username').textContent = currentUser.username;
    loadLicenses();
  } catch (e) {
    window.location.href = '/admin/';
  }
}

async function loadLicenses() {
  const search = document.getElementById('search').value;
  const status = document.getElementById('statusFilter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const url = API + (params.toString() ? '?' + params.toString() : '');
  const res = await fetch(url);
  if (res.status === 401) { window.location.href = '/admin/'; return; }
  const data = await res.json();
  const tbody = document.getElementById('licenseTable');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:40px">暂无授权记录</td></tr>'; return; }
  tbody.innerHTML = data.map(l => {
    const expiry = l.expiry_date || '永不过期';
    // Mask license key partially
    const masked = l.license_key.length > 12 ? l.license_key.slice(0, 8) + '...' : l.license_key;
    return '<tr>' +
      '<td>' + escapeHtml(l.customer_name) + '</td>' +
      '<td>' + escapeHtml(l.product) + '</td>' +
      '<td><span class="license-key" title="' + escapeHtml(l.license_key) + '">' + masked + '</span></td>' +
      '<td>' + l.seats + '</td>' +
      '<td>' + l.issued_date + '</td>' +
      '<td>' + expiry + '</td>' +
      '<td><span class="status status-' + getStatusClass(l.status) + '">' + getStatusLabel(l.status) + '</span></td>' +
      '<td>' +
        (l.status === 'active' ? '<button onclick="openEdit(' + l.id + ')">编辑</button><button class="revoke" onclick="revokeLicense(' + l.id + ')">撤销</button>' : '') +
      '</td>' +
      '</tr>';
  }).join('');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Modal
function openCreate() {
  document.getElementById('modalTitle').textContent = '创建授权';
  document.getElementById('editId').value = '';
  document.getElementById('licenseForm').reset();
  document.getElementById('seats').value = 1;
  document.getElementById('issued_date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('modal').style.display = 'flex';
}

async function openEdit(id) {
  const res = await fetch(API);
  const list = await res.json();
  const l = list.find(x => x.id === id);
  if (!l) return;
  document.getElementById('modalTitle').textContent = '编辑授权';
  document.getElementById('editId').value = l.id;
  document.getElementById('customer_name').value = l.customer_name;
  document.getElementById('product').value = l.product;
  document.getElementById('license_key').value = l.license_key;
  document.getElementById('seats').value = l.seats;
  document.getElementById('issued_date').value = l.issued_date;
  document.getElementById('expiry_date').value = l.expiry_date || '';
  document.getElementById('notes').value = l.notes || '';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; }

document.getElementById('licenseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const body = {
    customer_name: document.getElementById('customer_name').value,
    product: document.getElementById('product').value,
    license_key: document.getElementById('license_key').value,
    seats: parseInt(document.getElementById('seats').value) || 1,
    issued_date: document.getElementById('issued_date').value,
    expiry_date: document.getElementById('expiry_date').value || null,
    notes: document.getElementById('notes').value,
  };
  const method = id ? 'PUT' : 'POST';
  const url = id ? API + '/' + id : API;
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) { closeModal(); loadLicenses(); return; }
  const data = await res.json();
  alert(data.error || '保存失败');
});

async function revokeLicense(id) {
  if (!confirm('确定要撤销此授权吗？撤销后不可恢复。')) return;
  const res = await fetch(API + '/' + id, { method: 'DELETE' });
  if (res.ok) { loadLicenses(); return; }
  const data = await res.json();
  alert(data.error || '操作失败');
}

function logout() {
  document.cookie = 'token=;path=/;max-age=0';
  window.location.href = '/admin/';
}

// Init
document.getElementById('search').addEventListener('input', loadLicenses);
document.getElementById('statusFilter').addEventListener('change', loadLicenses);
fetchUser();
</script>
</body>
</html>`);
});

// ── Auth routes ─────────────────────────────────────────────────────────────
app.post('/admin/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// ── License routes ───────────────────────────────────────────────────────────

// List licenses (with optional search & status filter)
app.get('/admin/api/licenses', authMiddleware, (req, res) => {
  const { search, status } = req.query;
  let sql = 'SELECT * FROM licenses WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  } else {
    sql += ' AND status = ? ';
    params.push('active');
  }

  if (search) {
    sql += ' AND (customer_name LIKE ? OR license_key LIKE ? OR product LIKE ? OR notes LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Create license
app.post('/admin/api/licenses', authMiddleware, (req, res) => {
  const { customer_name, product, license_key, seats, issued_date, expiry_date, notes } = req.body;
  if (!customer_name || !product || !license_key || !issued_date) {
    return res.status(400).json({ error: '缺少必填字段：客户名称、产品、授权码、签发日期' });
  }

  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const result = db.prepare(`
      INSERT INTO licenses (customer_name, product, license_key, seats, issued_date, expiry_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customer_name,
      product,
      license_key,
      seats || 1,
      issued_date,
      expiry_date || null,
      notes || '',
      now,
      now
    );

    const created = db.prepare('SELECT * FROM licenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '授权码已存在' });
    }
    throw err;
  }
});

// Update license
app.put('/admin/api/licenses/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '授权记录不存在' });
  }

  const allowed = ['customer_name', 'product', 'license_key', 'seats', 'issued_date', 'expiry_date', 'status', 'notes'];
  const updates = [];
  const params = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }

  if (updates.length === 0) {
    return res.json(existing);
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  try {
    db.prepare(`UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '授权码已存在' });
    }
    throw err;
  }

  const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  res.json(updated);
});

// Delete (soft-delete: set status to revoked)
app.delete('/admin/api/licenses/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '授权记录不存在' });
  }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE licenses SET status = ? , updated_at = ? WHERE id = ?').run('revoked', now, id);
  const updated = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  res.json(updated);
});

// ── Start ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`Admin server running on http://localhost:${PORT}`);
});

// Graceful shutdown for tests
process.on('SIGTERM', () => {
  server.close(() => { db.close(); process.exit(0); });
});
process.on('SIGINT', () => {
  server.close(() => { db.close(); process.exit(0); });
});

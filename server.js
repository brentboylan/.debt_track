const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'accounts.json');
const DEFAULT_ACCOUNTS = [
  { id: 1, name: 'Chase Visa', balance: 5200, apr: 18.99, payment: 180 },
  { id: 2, name: 'Amex', balance: 3400, apr: 24.99, payment: 160 },
  { id: 3, name: 'Auto Loan', balance: 9800, apr: 7.5, payment: 330 },
  { id: 4, name: 'Student Loan', balance: 14500, apr: 5.2, payment: 260 },
];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_ACCOUNTS, null, 2), 'utf8');
  }
}

function readAccounts() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Unable to read accounts JSON. Resetting to defaults.', error);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_ACCOUNTS, null, 2), 'utf8');
  return DEFAULT_ACCOUNTS.map((account) => ({ ...account }));
}

function writeAccounts(accounts) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2), 'utf8');
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function serveStaticFile(response, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(ROOT, safePath));

  if (!resolved.startsWith(ROOT)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const extension = path.extname(resolved).toLowerCase();
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon',
    }[extension] || 'application/octet-stream';

    response.writeHead(200, { 'Content-Type': mime });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/accounts') {
    if (request.method === 'GET') {
      sendJson(response, 200, readAccounts());
      return;
    }

    if (request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        try {
          const payload = JSON.parse(body || '[]');
          if (!Array.isArray(payload)) {
            sendJson(response, 400, { error: 'Accounts payload must be an array.' });
            return;
          }
          writeAccounts(payload);
          sendJson(response, 200, { ok: true, accounts: payload });
        } catch (error) {
          sendJson(response, 400, { error: 'Invalid JSON payload.' });
        }
      });
      return;
    }
  }

  serveStaticFile(response, url.pathname);
});

const port = process.env.PORT || 8000;
server.listen(port, () => {
  console.log(`Debt planner server running at http://localhost:${port}`);
});

/* Academy OS 발송 서버
 * - POST /api/messages/send     알림톡 발송 (실패 시 SOLAPI가 문자로 대체) + MessageLog 기록
 * - GET  /api/messages?leadId=  리드별 발송 이력
 * - POST /api/solapi/webhook    SOLAPI 발송 결과 반영 (?key=WEBHOOK_KEY)
 * - GET  /api/health            연결 확인 (테스트 모드 여부)
 * - 그 밖의 경로                 ../dist 정적 파일 (React 빌드 결과: npm run build. 클라우드에서는 앱과 서버를 한 주소로 띄운다)
 * 설정은 환경변수(.env). 기본은 DRY_RUN=1: 실제로 보내지 않고 기록만 남긴다. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dbm = require('./db');

const APP_DIR = path.join(__dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const DUP_MINUTES = 5; // G4: 같은 리드·같은 템플릿 재발송 차단 시간
const PHONE = /^01\d{8,9}$/;

function createApp(env, deps) {
  const dryRun = env.DRY_RUN !== '0';
  if (!dryRun) {
    const need = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PFID', 'SENDER_PHONE', 'API_TOKEN'].filter((k) => !env[k]);
    if (need.length) throw new Error('실제 발송 모드(DRY_RUN=0)에 필요한 환경변수가 없습니다: ' + need.join(', '));
  }
  const db = (deps && deps.db) || dbm.open(env.DB_FILE || path.join(__dirname, 'data', 'messages.db'));
  const provider = dryRun ? null : (deps && deps.provider) || require('./adapters/solapi').create(env);
  const parser = (deps && deps.provider) || (dryRun ? null : provider);

  const authorized = (req) => {
    if (!env.API_TOKEN) return true; // 토큰을 정하지 않은 테스트 모드
    const got = Buffer.from(String(req.headers.authorization || ''));
    const want = Buffer.from('Bearer ' + env.API_TOKEN);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  };

  function send(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }
  function readJson(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => { raw += c; if (raw.length > 200000) { reject(new Error('요청이 너무 큽니다')); req.destroy(); } });
      req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error('JSON 형식이 아닙니다')); } });
      req.on('error', reject);
    });
  }

  async function sendMessage(req, res) {
    const b = await readJson(req);
    const to = String(b.to || '').replace(/\D/g, '');
    if (!b.leadId || !b.template) return send(res, 400, { error: 'leadId와 template이 필요합니다' });
    if (!PHONE.test(to)) return send(res, 400, { error: '학부모 전화번호 형식이 올바르지 않습니다' });
    if (!dryRun && !b.templateId) return send(res, 400, { error: '승인된 알림톡 템플릿 ID가 없습니다' });
    if (db.recentSame(b.leadId, b.template, DUP_MINUTES)) return send(res, 409, { error: '같은 안내를 ' + DUP_MINUTES + '분 안에 이미 보냈습니다' });

    const base = { leadId: b.leadId, template: b.template, templateId: b.templateId, channel: 'alimtalk', to: to, variables: b.variables, text: b.text };
    if (dryRun) {
      const logId = db.insert(Object.assign({}, base, { status: 'test' }));
      return send(res, 200, { logId: logId, status: 'test' });
    }
    const r = await provider.sendAlimtalk({ to: to, templateId: b.templateId, variables: b.variables || {} });
    const logId = db.insert(Object.assign({}, base, { status: r.status, reason: r.reason, providerMessageId: r.providerMessageId, providerGroupId: r.providerGroupId }));
    return send(res, 200, { logId: logId, status: r.status, reason: r.reason || null });
  }

  async function webhook(req, res, url) {
    if (!env.WEBHOOK_KEY || url.searchParams.get('key') !== env.WEBHOOK_KEY) return send(res, 403, { error: 'forbidden' });
    const b = await readJson(req);
    const items = Array.isArray(b) ? b : Array.isArray(b.messages) ? b.messages : [b];
    let updated = 0;
    items.forEach((it) => {
      const r = parser && parser.parseReport(it);
      if (r && r.messageId) updated += db.updateByProvider(r.messageId, r);
    });
    return send(res, 200, { updated: updated });
  }

  function serveStatic(req, res, url) {
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', env.APP_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      if (url.pathname === '/api/health') return send(res, 200, { ok: true, dryRun: dryRun });
      if (url.pathname === '/api/solapi/webhook' && req.method === 'POST') return await webhook(req, res, url);
      if (url.pathname.startsWith('/api/')) {
        if (!authorized(req)) return send(res, 401, { error: '접속 토큰이 올바르지 않습니다' });
        if (url.pathname === '/api/messages/send' && req.method === 'POST') return await sendMessage(req, res);
        if (url.pathname === '/api/messages' && req.method === 'GET') return send(res, 200, { logs: db.byLead(url.searchParams.get('leadId') || '') });
        return send(res, 404, { error: 'not found' });
      }
      if (req.method === 'GET') return serveStatic(req, res, url);
      return send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  return { handle, db, dryRun };
}

if (require.main === module) {
  try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* .env 없음: 환경변수 또는 기본값(테스트 모드) */ }
  const app = createApp(process.env);
  const port = Number(process.env.PORT || 8787);
  http.createServer(app.handle).listen(port, () => {
    console.log('Academy OS 발송 서버: http://localhost:' + port + (app.dryRun ? '  [테스트 모드: 실제 발송 안 함]' : '  [실제 발송]'));
  });
}

module.exports = { createApp };

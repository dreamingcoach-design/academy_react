/* MessageLog 저장소 (CORE-DATA-11: 채널 독립 발송 기록). Node 내장 SQLite 사용 — 별도 설치 없음.
 * 학부모 전화번호가 들어가므로 DB 파일(data/)은 git에 올리지 않는다. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT, template TEXT, template_id TEXT,
    channel TEXT NOT NULL,            -- alimtalk | lms
    to_phone TEXT NOT NULL,
    variables TEXT, text TEXT,
    status TEXT NOT NULL,             -- test | accepted | delivered | fallback | failed
    reason TEXT,
    provider_message_id TEXT, provider_group_id TEXT,
    requested_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_logs_lead ON message_logs(lead_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_logs_provider ON message_logs(provider_message_id)');

  const now = () => new Date().toISOString();
  const ins = db.prepare(`INSERT INTO message_logs (lead_id, template, template_id, channel, to_phone, variables, text, status, reason, provider_message_id, provider_group_id, requested_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  return {
    insert(r) {
      const t = now();
      const res = ins.run(r.leadId || null, r.template || null, r.templateId || null, r.channel, r.to, JSON.stringify(r.variables || {}), r.text || '',
        r.status, r.reason || null, r.providerMessageId || null, r.providerGroupId || null, t, t);
      return Number(res.lastInsertRowid);
    },
    // 웹훅 결과 반영: 공급사 메시지 ID 기준
    updateByProvider(messageId, fields) {
      return db.prepare('UPDATE message_logs SET status = ?, channel = COALESCE(?, channel), reason = ?, updated_at = ? WHERE provider_message_id = ?')
        .run(fields.status, fields.channel || null, fields.reason || null, now(), messageId).changes;
    },
    byLead(leadId) { return db.prepare('SELECT * FROM message_logs WHERE lead_id = ? ORDER BY id DESC').all(leadId); },
    // G4 중복 방지: 같은 리드·같은 템플릿을 최근 N분 안에 (실패가 아닌 상태로) 보냈는지
    recentSame(leadId, template, minutes) {
      const since = new Date(Date.now() - minutes * 60000).toISOString();
      return db.prepare("SELECT id FROM message_logs WHERE lead_id = ? AND template = ? AND status != 'failed' AND requested_at >= ? LIMIT 1").get(leadId, template, since) || null;
    },
    close() { db.close(); },
  };
}

module.exports = { open };

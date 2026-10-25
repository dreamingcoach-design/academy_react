/* 도메인 계산: 규칙(영어 pack)에서 온 값과 파생 계산. 화면은 여기를 호출하고 저장은 store 에 맡긴다 */
import { D, store } from './store.js';

// 정규반 일지 항목 (core/09 §9-4, 2026-10-17 확정). testRegular=정규반에서 테스트 통과 칸이 있는 항목
const ITEMS = [
  { code: 'VOCA', area: '단어', short: '단어', testRegular: true },
  { code: '리딩VOCA', area: '단어', short: '리딩단어', testRegular: false },
  { code: '듣기VOCA', area: '듣기', short: '듣기단어', testRegular: false },
  { code: '직독직해', area: '독해', short: '직독직해', testRegular: false },
  { code: '영작', area: '영작', short: '영작', testRegular: false },
  { code: '듣기 교재', area: '듣기', short: '듣기', testRegular: true },
  { code: '문법교재', area: '문법', short: '문법', testRegular: true },
  { code: '리딩교재', area: '독해', short: '리딩', testRegular: true },
];
const ALIASES = {
  '그래머': '문법교재', '문법': '문법교재', '문법교재': '문법교재', '문법 교재': '문법교재',
  '듣기': '듣기 교재', '듣기교재': '듣기 교재', '듣기 교재': '듣기 교재',
  '리딩': '리딩교재', '리딩교재': '리딩교재', '리딩 교재': '리딩교재',
  '단어': 'VOCA', '보카': 'VOCA', 'VOCA': 'VOCA', 'voca': 'VOCA',
  '리딩VOCA': '리딩VOCA', '리딩 VOCA': '리딩VOCA', '듣기VOCA': '듣기VOCA', '듣기 VOCA': '듣기VOCA',
  '직독직해': '직독직해', '영작': '영작',
};
const NAESHIN_WEEKS_DAYS = 35; // ENG-TEST-07: 시험 4~5주 전. 기본값은 5주(미결) — 설정에서 바꿀 수 있게 상수로 분리

function itemOf(code) { return ITEMS.find((i) => i.code === code); }
function activeStudents() { return store.list('students', (s) => s.status === '재원'); }
function guardianOf(sid) { return store.list('guardians', (g) => g.student_id === sid)[0] || null; }
function typeName(code) { const t = store.get('errorTypes', code); return t ? t.name + ' (' + code + ')' : code; }

// 시험 D-n: 학생의 학교·학년과 일치하는 가장 가까운 시험
function nextExam(student, date) {
  const list = store.list('examPeriods', (e) => e.school === student.school && e.grade === student.grade && D.diff(e.date, date) >= 0);
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  return list[0] || null;
}
function mode(student, date) {
  const ex = nextExam(student, date);
  if (ex && D.diff(ex.date, date) <= NAESHIN_WEEKS_DAYS) return { kind: 'naeshin', exam: ex, dn: D.diff(ex.date, date) };
  return { kind: 'regular', exam: ex, dn: ex ? D.diff(ex.date, date) : null };
}
function hasTest(item, m) { return m.kind === 'naeshin' ? true : item.testRegular; }

function planFor(className, date) {
  return store.list('assignmentPlans', (p) => p.className === className && p.date === date)[0] || null;
}
// 오늘 점검 대상 항목: 배정 범위가 있는 항목, 없으면 전체
function activeItems(student, date) {
  const p = planFor(student.className, date);
  const codes = p ? Object.keys(p.ranges).filter((c) => p.ranges[c]) : [];
  return ITEMS.filter((i) => !codes.length || codes.includes(i.code));
}
function entryFor(sid, date) { return store.list('coachingEntries', (e) => e.student_id === sid && e.date === date)[0] || null; }

// 칸 채움에서 상태를 계산한다 (저장하지 않음)
function status(student, date) {
  const e = entryFor(student.id, date);
  if (!e) return 'wait';
  const m = mode(student, date);
  const items = activeItems(student, date);
  const hwDone = items.every((i) => e.items[i.code] && e.items[i.code].hw);
  const hwAny = items.some((i) => e.items[i.code] && e.items[i.code].hw);
  const testItems = items.filter((i) => hasTest(i, m));
  const testDone = testItems.every((i) => e.items[i.code] && e.items[i.code].test);
  if (!hwAny) return 'wait';
  if (!hwDone) return 'hw';
  if (!testDone) return 'test';
  return 'done';
}
const STATUS_LABEL = { wait: '대기', hw: '숙제 검사 중', test: '테스트 중', done: '완료' };

function weaknesses(sid) {
  const count = {};
  store.list('errorItems', (x) => x.student_id === sid).forEach((x) => { count[x.type] = (count[x.type] || 0) + 1; });
  return Object.keys(count).map((t) => ({ type: t, n: count[t] })).sort((a, b) => b.n - a.n);
}

function hwRate(sid, fromDate, toDate) {
  let ok = 0, all = 0;
  store.list('coachingEntries', (e) => e.student_id === sid && e.date >= fromDate && e.date <= toDate).forEach((e) => {
    Object.keys(e.items).forEach((c) => { const v = e.items[c].hw; if (v) { all++; if (v === 'o') ok++; } });
  });
  return all ? Math.round((ok / all) * 100) : null;
}
function testRate(sid, fromDate, toDate) {
  let ok = 0, all = 0;
  store.list('coachingEntries', (e) => e.student_id === sid && e.date >= fromDate && e.date <= toDate).forEach((e) => {
    Object.keys(e.items).forEach((c) => { const v = e.items[c].test; if (v) { all++; if (v === 'o') ok++; } });
  });
  return all ? Math.round((ok / all) * 100) : null;
}

// 학원친구용 브리핑 문구 (core/09 §9-3). 발송이 아니라 복사용 텍스트
function briefing(student, date) {
  const e = entryFor(student.id, date);
  const m = mode(student, date);
  const items = activeItems(student, date);
  const hwMiss = [], testFail = [], retestPass = [], passNames = [];
  items.forEach((i) => {
    const c = (e && e.items[i.code]) || {};
    if (c.hw === 'x') hwMiss.push(i.short);
    if (hasTest(i, m)) {
      if (c.test === 'x') testFail.push(i.short);
      else if (c.test === 'o' && c.retest) retestPass.push(i.short + ' 구두 재시험 후 통과');
      else if (c.test === 'o') passNames.push(i.short);
    }
  });
  const head = '[SNP영어학원] ' + D.md(date) + ' 코칭 현황 · ' + student.name + ' 학생';
  const issue = hwMiss.length || testFail.length || retestPass.length;
  const lines = [head];
  lines.push(hwMiss.length ? '⚠️ 숙제: ' + hwMiss.join(', ') + ' 미완료' : '✅ 숙제: 전부 제출');
  if (!hwMiss.length && !testFail.length && !retestPass.length) {
    lines.push('✅ 테스트: ' + (passNames.length ? passNames.join(' / ') + ' 모두 통과' : '진행 항목 없음'));
  } else {
    const parts = retestPass.concat(testFail.map((n) => n + ' 미통과'));
    if (passNames.length) parts.push(passNames.join(' / ') + ' 통과');
    lines.push('⚠️ 테스트: ' + parts.join(' / '));
  }
  // Q-04: 숙제·테스트 중 하나라도 미완료면 다음 날 오후 5시 등원
  if (hwMiss.length || testFail.length) lines.push('📌 안내: 내일 오후 5시 등원 후 진행합니다');
  if (!issue) lines.push('오늘도 수고했습니다 😊');
  return lines.join('\n');
}

// 강사 공지 한 줄 파싱: "반이름 / 그래머 P.32~40 / 듣기 1과 P.117~121" (core/09 §9-5)
function parseNotice(text) {
  const out = { className: '', ranges: {}, unclassified: [] };
  const parts = text.split('/').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return out;
  out.className = parts.shift();
  const keys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  parts.forEach((p) => {
    const k = keys.find((x) => p.toLowerCase().startsWith(x.toLowerCase()));
    if (k) out.ranges[ALIASES[k]] = p.slice(k.length).trim();
    else out.unclassified.push(p);
  });
  return out;
}

export const dom = { ITEMS, itemOf, activeStudents, guardianOf, typeName, nextExam, mode, hasTest, planFor, activeItems, entryFor, status, STATUS_LABEL, weaknesses, hwRate, testRate, briefing, parseNotice, NAESHIN_WEEKS_DAYS };

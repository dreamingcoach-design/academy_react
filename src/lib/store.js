/* 데이터 계층 (P11: 데이터와 화면 분리)
 * 화면은 store 의 list/get/upsert/remove 만 쓴다. 지금은 localStorage 에 저장하지만,
 * 클라우드 서버가 붙으면 이 파일의 저장 구현만 API 호출로 바꾸면 화면은 그대로 쓴다.
 * 컬렉션 이름은 core/01-data-model.md 의 엔티티를 따른다.
 * React 화면은 subscribe/version 으로 변경을 구독한다 (useStore, lib/hooks.js). */
import builtinForms from '../data/leveltestForms.js';
import ltDemo50 from '../data/leveltestDemo.js';

const KEY = 'academy-os:v1'; // academy-os(app/)와 같은 키 — 내보내기 파일을 그대로 주고받는다
const COLLECTIONS = [
  'students', 'guardians', 'leads', 'assessments', 'examPeriods', 'assignmentPlans',
  'coachingEntries', 'errorItems', 'itemMaps', 'errorTypes', 'remediations', 'messageLogs', 'schoolPlans',
  'surveyRounds', 'surveyLinks', 'surveyResponses',
  'academicPeriods', 'taskTemplates', 'taskChecks', 'timetables', 'timetableSlots', 'handouts', 'handoutChecks',
  'testForms', 'msgTemplates',
];

export const D = {
  fmt(d) {
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  },
  today() { return D.fmt(new Date()); },
  add(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return D.fmt(d); },
  diff(a, b) { return Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000); },
  md(dateStr) { const p = dateStr.split('-'); return +p[1] + '/' + +p[2]; },
  // 일시 값은 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM'(10분 단위). 시간이 없으면 날짜만 쓴다
  dateOf(v) { return v ? v.slice(0, 10) : ''; },
  mdhm(v) { if (!v) return '—'; return D.md(v.slice(0, 10)) + (v.length > 10 ? ' ' + v.slice(11, 16) : ''); },
  ymdhm(v) { if (!v) return '—'; return v.slice(0, 10) + (v.length > 10 ? ' ' + v.slice(11, 16) : ''); },
};

let data = null;
let version = 0;
const listeners = new Set();

function empty() {
  const o = { meta: { version: 1, demo: false, seq: 0 } };
  COLLECTIONS.forEach((c) => { o[c] = []; });
  return o;
}

// 내장 테스트지 키(data/leveltestForms.js)를 저장소에 채운다. 이미 있는 키는 내장본의 form.version이 더 높을 때만 바꾼다 (키는 가져오기로도 추가된다)
function syncForms() {
  let changed = false;
  builtinForms.forEach((f) => {
    const id = f.form.id, i = data.testForms.findIndex((x) => x.id === id);
    if (i < 0) { data.testForms.push(Object.assign({ id: id }, f)); changed = true; }
    else if ((f.form.version || 0) > ((data.testForms[i].form || {}).version || 0)) { data.testForms[i] = Object.assign({ id: id }, f); changed = true; }
  });
  return changed;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장소 사용 불가: 메모리만 사용 */ }
  version += 1;
  listeners.forEach((fn) => fn());
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      data = JSON.parse(raw);
      COLLECTIONS.forEach((c) => { if (!data[c]) data[c] = []; });
      // 2026-10-22: 학부모 이름 폐지, 식별은 학생 이름 하나로 통일
      data.leads.forEach((l) => { if (l.guardian !== undefined) { if (!l.student) l.student = l.guardian; delete l.guardian; }
        if (l.student) l.student = l.student.replace(/\s*학부모$/, ''); });
      data.guardians.forEach((g) => { delete g.name; if (g.phone !== undefined) { if (!g.parentPhone) g.parentPhone = g.phone; delete g.phone; } });
      // 2026-10-22: 전화번호를 학부모/학생으로 구분 (문의·보호자: parentPhone, 학생: studentPhone)
      // 2026-10-22: 레벨테스트일·상담일을 일시(10분 단위)로 확장. 기존 날짜 값은 시간 없이 그대로 이어받는다
      data.leads.forEach((l) => { if (l.testDate !== undefined) { if (!l.testAt) l.testAt = l.testDate; delete l.testDate; } if (l.consultDate !== undefined) { if (!l.consultAt) l.consultAt = l.consultDate; delete l.consultDate; } });
      // 2026-10-22: 레벨테스트 점수를 영역별 {총 문제 수, 맞은 개수}로 변경. 예전 숫자(0~100)는 100문제 중 맞은 개수로 이어받는다
      data.leads.forEach((l) => { Object.keys(l.scores || {}).forEach((a) => { if (typeof l.scores[a] === 'number') l.scores[a] = { total: 100, correct: l.scores[a] }; }); });
      data.leads.forEach((l) => { if (l.phone !== undefined) { if (!l.parentPhone) l.parentPhone = l.phone; delete l.phone; } });
      // 강사 평가 설문(F12) 추가 전에 만든 데모 데이터에도 설문 데모를 채운다
      if (data.meta.demo && !data.meta.surveySeeded) { seedSurvey(); persist(); }
      // 학사 일정·주기 업무(F13)는 운영 원본이라 데모 여부와 무관하게 채운다. 시간표·유인물 데모는 데모일 때만
      if (!data.meta.calendarSeeded && !data.taskTemplates.length) { seedCalendar(); if (data.meta.demo) { seedTimetable(); seedHandouts(); } persist(); }
      if (data.meta.demo && !data.leads.some((l) => l.id === 'lea-demo-6') && !data.meta.ltDemoSeeded) { seedLeveltestDemo(); persist(); }
      if (data.meta.demo && !data.leads.some((l) => l.id === 'lea-demo-7') && !data.meta.ltDemo50Seeded) { seedLeveltestDemo50(); persist(); }
      // 2026-10-24: 레벨테스트 부분 점수 폐지 — 틀린 문항은 모두 0점. 50점대 데모는 부분 점수 없는 52점 버전으로 바꾼다
      data.leads.forEach((l) => { Object.keys(l.wrong || {}).forEach((n) => { l.wrong[n].earned = 0; }); });
      if (!data.meta.ltDemo50v2) { const d7 = data.leads.find((l) => l.id === 'lea-demo-7'); if (d7) Object.assign(d7, demo50Wrong(), { reportEdits: {} }); data.meta.ltDemo50v2 = true; persist(); }
      if (syncForms()) persist();
      if (toVisits()) persist();
      return;
    }
  } catch (e) { /* 무시하고 새로 시작 */ }
  data = empty();
  seed();
  seedCalendar();
  seedTimetable();
  seedHandouts();
  syncForms();
  toVisits();
  persist();
}

// 2026-10-25: 레벨테스트 일시(testAt)·상담 일시(consultAt) 두 칸 → 방문 일정 목록(visits, 유형 4종·최대 상담 2회·테스트 1회).
// 같은 날이면 '테스트+상담' 1건, 다른 날이면 '레벨테스트만' + '상담만' 2건, 한쪽만 있으면 그 유형 1건. 단계 '레벨테스트 예약'은 '방문 예약'으로
function toVisits() {
  let changed = false;
  data.leads.forEach((l) => {
    if (l.stage === '레벨테스트 예약') { l.stage = '방문 예약'; changed = true; }
    if (l.visits) return;
    const done = l.stage === '상담 완료' || l.stage === '등록';
    const v = [];
    if (l.testAt && l.consultAt && l.testAt.slice(0, 10) === l.consultAt.slice(0, 10)) v.push({ at: l.testAt, type: 'test+consult' });
    else {
      if (l.testAt) v.push({ at: l.testAt, type: l.consultAt ? 'test' : 'test+consult' });
      if (l.consultAt) v.push({ at: l.consultAt, type: 'consult' });
    }
    l.visits = v.map((x, i) => ({ id: 'vis-' + (i + 1), at: x.at, type: x.type, status: done ? '완료' : '예정' }));
    delete l.testAt; delete l.consultAt;
    changed = true;
  });
  return changed;
}

function uid(prefix) {
  data.meta.seq += 1;
  return prefix + '-' + Date.now().toString(36) + data.meta.seq.toString(36);
}

export const store = {
  load: load,
  uid: uid,
  // React 구독용: 저장할 때마다 version 이 오른다
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  version() { return version; },
  list(c, filter) { return filter ? data[c].filter(filter) : data[c].slice(); },
  get(c, id) { return data[c].find((x) => x.id === id) || null; },
  upsert(c, obj) {
    if (!obj.id) obj.id = uid(c.slice(0, 3));
    const i = data[c].findIndex((x) => x.id === obj.id);
    if (i >= 0) data[c][i] = Object.assign({}, data[c][i], obj); else data[c].push(obj);
    persist();
    return store.get(c, obj.id);
  },
  remove(c, id) { data[c] = data[c].filter((x) => x.id !== id); persist(); },
  removeWhere(c, fn) { data[c] = data[c].filter((x) => !fn(x)); persist(); },
  isDemo() { return !!data.meta.demo; },
  exportJSON() { return JSON.stringify(data, null, 2); },
  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.meta) throw new Error('academy-os 데이터 파일이 아닙니다');
    data = parsed;
    COLLECTIONS.forEach((c) => { if (!data[c]) data[c] = []; });
    toVisits();
    persist();
  },
  resetDemo() { data = empty(); seed(); seedCalendar(); seedTimetable(); seedHandouts(); syncForms(); toVisits(); persist(); },
  clearAll() { data = empty(); syncForms(); persist(); },
};

/* ---------- 데모 데이터 (전부 가상 · 실제 학생 정보 아님) ---------- */
function seed() {
  const t = D.today();
  data.meta.demo = true;

  // 문제유형 마스터 v1 (subjects/english/report-spec.md §3-3)
  [
    ['WORD-SPELL', '스펠링', '단어'], ['WORD-MEAN', '뜻·미암기', '단어'], ['WORD-CONFUSE', '혼동어', '단어'],
    ['READ-SYNTAX', '구문 해석', '독해'], ['READ-CONTENT', '내용 파악', '독해'], ['READ-INFER', '추론(빈칸·삽입·순서)', '독해'],
    ['GRM-TENSE', '시제', '문법'], ['GRM-AGREE', '수일치·태', '문법'], ['GRM-VERBAL', '준동사', '문법'], ['GRM-CONN', '관계사·접속사', '문법'],
    ['WRT-SPELL', '스펠링', '영작'], ['WRT-ORDER', '어순', '영작'], ['WRT-GRAMMAR', '문법 오류', '영작'],
    ['LST-WORD', '단어 인지', '듣기'], ['LST-LINK', '연음·축약', '듣기'], ['LST-SPEED', '속도·내용 파악', '듣기'],
  ].forEach((r) => data.errorTypes.push({ id: r[0], code: r[0], name: r[1], area: r[2], active: true }));

  // 데모 문항 맵 (핵심 교재는 인계 후 선정 — 이 항목은 화면 확인용 가상 교재)
  const typeCycle = ['GRM-TENSE', 'GRM-AGREE', 'GRM-VERBAL', 'GRM-CONN'];
  const items = [];
  for (let n = 1; n <= 24; n++) items.push({ no: n, area: '문법', type: typeCycle[(n - 1) % 4] });
  data.itemMaps.push({ id: 'map-demo-grm1', book: '문법교재 (데모) Unit 1', kind: '교재', items: items });

  // 학생
  const stu = [
    ['김하준', '중2', '위례중', '중등 EXPERT 반'], ['이서연', '중2', '위례중', '중등 EXPERT 반'],
    ['박도윤', '중1', '문정중', '중등 BASIC 반'], ['최지우', '중1', '문정중', '중등 BASIC 반'],
    ['정유나', '중3', '위례중', '중등 EXPERT 반'], ['강민준', '초6', '위례초', '초등 6학년 반'],
    ['윤서아', '초5', '위례초', '초등 5학년 반'], ['임시우', '중3', '문정중', '중등 EXPERT 반'],
  ];
  stu.forEach((s, i) => {
    const id = 'stu-demo-' + (i + 1);
    data.students.push({
      id: id, name: s[0], studentPhone: '010-1111-' + String(1000 + i), grade: s[1], school: s[2], className: s[3], teacher: i % 2 ? '박강사' : '최강사',
      status: '재원', enrolledAt: D.add(t, -(40 + i * 25)), level: '', memo: '',
    });
    data.guardians.push({
      id: 'gua-demo-' + (i + 1), student_id: id, parentPhone: '010-0000-' + String(1000 + i), consent: i !== 3,
    });
  });

  // 학교 시험 기간
  data.examPeriods.push(
    { id: 'exp-demo-1', school: '위례중', grade: '중2', name: '2학기 기말고사', date: D.add(t, 21) },
    { id: 'exp-demo-2', school: '문정중', grade: '중1', name: '2학기 기말고사', date: D.add(t, 52) },
    { id: 'exp-demo-3', school: '위례중', grade: '중3', name: '2학기 기말고사', date: D.add(t, 19) },
  );
  data.schoolPlans.push({ id: 'plan-demo-1', school: '위례중', grade: '중2', text: '서술형 40% · 수행평가(영작) 20% — 데모 메모' });

  // 오늘 반별 배정 범위 (강사 공지 → 조교 입력)
  data.assignmentPlans.push(
    { id: 'ap-demo-1', date: t, className: '중등 EXPERT 반', ranges: { VOCA: 'Day 7-8', '리딩VOCA': 'Unit 4', '듣기VOCA': 'Unit 4', '직독직해': 'P.20~23', '영작': 'P.12', '듣기 교재': '1과 P.117~121', '문법교재': 'P.32~40', '리딩교재': 'P.50~55' } },
    { id: 'ap-demo-2', date: t, className: '중등 BASIC 반', ranges: { VOCA: 'Day 3-4', '문법교재': 'P.18~22', '리딩교재': 'P.30~33' } },
  );

  // 최근 코칭 기록 (이행률·약점 화면 확인용)
  const codes = ['VOCA', '리딩VOCA', '듣기VOCA', '직독직해', '영작', '듣기 교재', '문법교재', '리딩교재'];
  data.students.slice(0, 5).forEach((s, si) => {
    for (let d = 1; d <= 6; d++) {
      const date = D.add(t, -d);
      if (new Date(date + 'T00:00:00').getDay() === 0) continue;
      const it = {};
      codes.forEach((c, ci) => {
        it[c] = { hw: (si * 5 + d * 3 + ci * 7) % 31 === 0 ? 'x' : 'o', test: ['VOCA', '듣기 교재', '문법교재', '리딩교재'].includes(c) ? ((si * 3 + d + ci) % 7 === 0 ? 'x' : 'o') : null };
      });
      data.coachingEntries.push({ id: 'ce-demo-' + si + '-' + d, student_id: s.id, date: date, attend: true, items: it, briefed: true });
    }
  });

  // 약점(ErrorItem)
  const weakNos = [[3, 7, 11, 15], [2, 6, 10], [4, 8, 12, 16, 20], [1, 5, 9], [7, 11, 19]];
  data.students.slice(0, 5).forEach((s, si) => {
    weakNos[si].forEach((no, k) => {
      const row = items[no - 1];
      data.errorItems.push({
        id: 'err-demo-' + si + '-' + k, student_id: s.id, date: D.add(t, -(k + 1)), source: '숙제 오답',
        itemmap_id: 'map-demo-grm1', no: no, area: row.area, type: row.type, photo_name: '',
      });
    });
  });

  // 문의·상담 보드
  [
    ['신규 문의', '한○○', '중1', '위례중', '블로그', -1, null],
    ['신규 문의', '오○○', '초6', '', '지인 소개', 0, null],
    ['레벨테스트 예약', '송○○', '중2', '문정중', '인스타그램', -2, D.add(t, 2)],
    ['상담 완료', '조○○', '중3', '위례중', '블로그', -5, D.add(t, -2)],
    ['등록', '배○○', '중1', '위례중', '블로그', -20, D.add(t, -14)],
  ].forEach((l, i) => {
    data.leads.push({
      id: 'lea-demo-' + (i + 1), stage: l[0], student: l[1], grade: l[2], school: l[3], channel: l[4],
      createdAt: D.add(t, l[5]), testAt: l[0] === '레벨테스트 예약' ? l[6] + 'T16:30' : '', consultAt: l[0] === '상담 완료' ? l[6] + 'T17:10' : '',
      scores: {}, memo: '',
    });
  });

  seedLeveltestDemo();
  seedLeveltestDemo50();

  // 학교 시험 점수
  data.assessments.push(
    { id: 'as-demo-1', student_id: 'stu-demo-1', kind: '학교 시험', name: '1학기 기말고사', date: D.add(t, -120), score: 88, grade: '2등급' },
    { id: 'as-demo-2', student_id: 'stu-demo-2', kind: '학교 시험', name: '1학기 기말고사', date: D.add(t, -120), score: 94, grade: '1등급' },
  );

  // 약점 보강 대상
  data.remediations.push(
    { id: 'rem-demo-1', student_id: 'stu-demo-1', type: 'GRM-TENSE', basis: '공식 테스트', status: '영상 시청 중', createdAt: t },
    { id: 'rem-demo-2', student_id: 'stu-demo-3', type: 'GRM-VERBAL', basis: '평소 관찰', status: '대기', createdAt: t },
  );

  seedSurvey();
}

/* 채점 입력까지 끝난 데모 문의 (중1 레벨테스트 키 기준, 틀린 문항만 저장). 데모 데이터일 때만 쓰고, 이미 저장된 데모에도 한 번 추가한다 */
function seedLeveltestDemo() {
  const t = D.today();
  data.meta.ltDemoSeeded = true;
  data.leads.push({
    id: 'lea-demo-6', stage: '상담 완료', student: '서○○', grade: '중1', school: '위례중', channel: '블로그', createdAt: D.add(t, -6), testAt: D.add(t, -3) + 'T16:30',
    consultAt: D.add(t, -3) + 'T17:20', testPay: '입금', parentPhone: '010-0000-9999', memo: '',
    precall: { caller: '', trait: '', prevPlace: '', prevTypes: [], family: '', worries: ['자기주도', '문법 개념', '내신'], criteria: [], activities: '' },
    testFormId: 'MS1-2026-10', gradedAt: D.add(t, -3),
    scores: { '문법': { total: 32, correct: 26 }, '독해': { total: 8, correct: 6 }, '영작': { total: 2, correct: 1 }, '단어': { total: 2, correct: 2 } }, // 틀린 문항에서 계산한 값(채점 입력 저장 시 자동 갱신)
    wrong: {
      1: { pick: 4, earned: 0 }, 4: { pick: 4, earned: 0 }, 23: { pick: 1, earned: 0 }, 30: { pick: 2, earned: 0 }, 31: { pick: 3, earned: 0 },
      32: { earned: 0, err: ['GR-AGREE-SUBJ'] }, 35: { earned: 0, err: ['RD-CAUSE'] }, 38: { pick: 1, earned: 0 }, 41: { earned: 0, err: ['WR-CASE'] },
    },
  });
}

/* 실제 응시생에 가까운 50점대 데모 (44문항 중 23문항 정답, 52점, 부분 점수 없음). 문항 캡처 칸은 원본 테스트지 텍스트로 미리 채운다(data/leveltestDemo.js) */
function demo50Wrong() {
  const demo = ltDemo50 || { clips: {}, student: {} };
  const wrong = {
    1: { pick: 4 }, 2: { pick: 4 }, 3: { pick: 1 }, 4: { pick: 4 }, 7: { err: ['GR-QUESTION-FORM'] }, 10: { pick: 1 }, 13: { pick: 3 }, 16: { pick: 5 },
    23: { pick: 1 }, 25: { pick: 2 }, 27: { err: ['GR-TO-INF-NOUN'] }, 29: { pick: 3 }, 30: { pick: 2 }, 31: { pick: 2 }, 32: { err: ['GR-PASSIVE'] },
    34: { pick: 5 }, 35: { err: ['RD-CAUSE'] }, 36: { pick: 4 }, 38: { pick: 3 }, 41: { err: ['WR-CASE', 'WR-VERBFORM'] }, 43: { pick: 1 },
  };
  Object.keys(wrong).forEach((no) => { wrong[no].earned = 0; if (demo.student[no]) wrong[no].text = demo.student[no]; });
  const clips = {};
  Object.keys(demo.clips).forEach((no) => { clips[no] = { type: 'text', text: demo.clips[no] }; });
  return { wrong: wrong, clips: clips, scores: { '문법': { total: 32, correct: 17 }, '독해': { total: 8, correct: 4 }, '영작': { total: 2, correct: 1 }, '단어': { total: 2, correct: 1 } } };
}
function seedLeveltestDemo50() {
  const t = D.today();
  data.meta.ltDemo50Seeded = true; data.meta.ltDemo50v2 = true;
  data.leads.push(Object.assign({
    id: 'lea-demo-7', stage: '상담 완료', student: '한○○', grade: '중1', school: '위례중', channel: '지인 소개', createdAt: D.add(t, -5), testAt: D.add(t, -2) + 'T15:00',
    consultAt: D.add(t, -2) + 'T15:50', testPay: '입금', parentPhone: '010-0000-8888', memo: '',
    precall: { caller: '', trait: '', prevPlace: '', prevTypes: [], family: '', worries: ['문법 기초', '독해', '내신'], criteria: [], activities: '' },
    testFormId: 'MS1-2026-10', gradedAt: D.add(t, -2), reportEdits: {},
  }, demo50Wrong()));
}

/* 강사 평가 설문 데모 (F12) — 2회차 × 반 2개. 마지막 회차에 왜곡 의심 응답 1건 포함 */
function seedSurvey() {
  const t = D.today();
  data.meta.surveySeeded = true;
  const rounds = [{ id: 'sr-demo-1', name: '9월 평가', start: D.add(t, -45), end: D.add(t, -38) }, { id: 'sr-demo-2', name: '10월 평가', start: D.add(t, -8), end: D.add(t, -1) }];
  const links = [{ className: '중등 EXPERT 반', teacher: '최강사', target: 4 }, { className: '중등 BASIC 반', teacher: '박강사', target: 4 }];
  const C = [
    ['문법 설명할 때 예문을 여러 개 들어 주셔서 이해가 잘 돼요', '관계대명사 부분은 너무 빨리 넘어가서 어려웠어요', '판서가 정리돼 있어서 복습하기 좋아요'],
    ['떠드는 애들이 있을 때 바로 정리해 주세요', '분위기는 좋은데 뒤쪽이 가끔 시끄러워요', '집중이 잘 되는 편이에요'],
    ['조금 빠르다. 시험 범위 나갈 때 특히', '난이도는 딱 맞는 것 같아요', '독해 지문이 좀 어렵다'],
    ['평일 숙제가 많아서 다른 학원 숙제랑 겹쳐요', '단어 숙제는 도움이 되는데 직독직해가 오래 걸려요', '주말 숙제는 괜찮아요'],
    ['코칭쌤이 틀린 거 다시 물어봐 주셔서 좋아요', '구두 테스트 기다리는 시간이 길어요', '친절하게 봐 주세요'],
    ['단어 실력은 확실히 늘었어요', '문법은 늘었는데 서술형은 아직 모르겠어요', '늘고 있는 것 같기도 하고 아닌 것 같기도 해요'],
    ['평일 숙제 조금만 줄여 주세요', '지금처럼만 해 주세요', '시험 기간에 보충을 더 해 주면 좋겠어요'],
  ];
  rounds.forEach((r, ri) => {
    data.surveyRounds.push({ id: r.id, name: r.name, start: r.start, end: r.end, formVersion: 'v0.2', status: '마감' });
    links.forEach((l, li) => {
      const linkId = 'sl-demo-' + ri + '-' + li;
      data.surveyLinks.push({ id: linkId, round_id: r.id, className: l.className, teacher: l.teacher, token: 'demo' + ri + li, expires: r.end, target: l.target });
      for (let k = 0; k < 4; k++) {
        const scores = []; const comments = [];
        for (let q = 0; q < 7; q++) {
          scores.push(Math.max(2, Math.min(5, 4 + ((k + q + ri + li) % 3) - 1 + (ri && q === 1 ? 0 : 0))));
          comments.push((k + q) % 2 === 0 ? C[q][(k + ri + li) % 3] : '');
        }
        data.surveyResponses.push({ id: 'sres-demo-' + ri + '-' + li + '-' + k, round_id: r.id, link_id: linkId, grade: l.className.includes('BASIC') ? '중1' : (k % 2 ? '중2' : '중3'),
          scores: scores, comments: comments, submittedAt: D.add(r.start, k % 3) + ' 18:5' + k, source: '구글폼 가져오기', excluded: false, excludeReason: '' });
      }
    });
  });
  // 왜곡 의심 응답: 모든 문항 1점, 근거 없는 코멘트
  data.surveyResponses.push({ id: 'sres-demo-x', round_id: 'sr-demo-2', link_id: 'sl-demo-1-0', grade: '중3',
    scores: [1, 1, 1, 1, 1, 1, 1], comments: ['설명 하나도 이해 안 됨', '최악', '그냥 다 별로', '숙제 너무 많음', '', '하나도 안 늘었음', '선생님 바꿔 주세요'],
    submittedAt: D.add(rounds[1].start, 1) + ' 18:58', source: '구글폼 가져오기', excluded: false, excludeReason: '' });
}

/* 학사 기간·기간별 업무 (F13) — 원본: subjects/english/calendar-tasks.md
 * 날짜는 예시값이다. 학교 학사일정을 받으면 학사 일정 메뉴에서 고친다.
 * 내신 대비 기간은 examMatch 로 내신 관리의 시험일에서 자동 계산(시작 −35일, 끝 +7일), 시험 입력이 없으면 아래 날짜를 쓴다 */
function seedCalendar() {
  data.meta.calendarSeeded = true;
  [
    ['ap-2026-sum', '2026 여름방학', '방학', '2026-07-27', '2026-08-14'],
    ['ap-2026-2', '2026 2학기 정규', '정규', '2026-08-17', '2027-01-08'],
    ['ap-2026-2-mid', '2026 2학기 중간 대비', '내신대비', '2026-08-31', '2026-10-16', '2학기 중간'],
    ['ap-2026-2-fin', '2026 2학기 기말 대비', '내신대비', '2026-10-12', '2026-12-18', '2학기 기말'],
    ['ap-2026-trans', '중3 고등 전환기', '전환기', '2026-11-01', '2027-02-28'],
    ['ap-2026-sem', '설명회 시즌', '설명회', '2026-12-01', '2027-02-28'],
    ['ap-2027-win', '2027 겨울방학', '방학', '2027-01-04', '2027-02-26'],
    ['ap-2027-prep', '2027 신학기 준비', '신학기', '2027-02-01', '2027-02-28'],
    ['ap-2027-1', '2027 1학기 정규', '정규', '2027-03-02', '2027-07-23'],
    ['ap-2027-1-mid', '2027 1학기 중간 대비', '내신대비', '2027-03-23', '2027-05-07', '1학기 중간'],
    ['ap-2027-1-fin', '2027 1학기 기말 대비', '내신대비', '2027-05-24', '2027-07-09', '1학기 기말'],
  ].forEach((r) => data.academicPeriods.push({ id: r[0], name: r[1], kind: r[2], start: r[3], end: r[4], examMatch: r[5] || '', memo: '' }));

  // [id, 기간 종류, 기준(start/end/weekly/monthly), 오프셋(일), 업무, 담당, 출처, 바로가기]
  // 내신대비의 end 는 "마지막 시험 + 7일"이므로 end −21 = 시험 D-14 이다
  [
    ['tt-prep-1', '신학기', 'start', 0, '학교 사이트에서 학사일정·교과서 목록 내려받아 확인', '데스크 조교', 'ENG-EXAM-01', ''],
    ['tt-prep-2', '신학기', 'start', 7, '학교·학년별 시험 기간 입력', '원장', 'ENG-TEST-07', 'exam'],
    ['tt-prep-3', '신학기', 'start', 7, '새 학기 시간표 기간 시작 (이전 기간 보관)', '원장', 'F14', 'timetable'],
    ['tt-prep-4', '신학기', 'start', 7, '고교 배정 후 예비 고1 학부모 상담 대응', '원장', 'ENG-TERM-03', 'consult'],
    ['tt-prep-5', '신학기', 'start', 14, '반 편성·교재 준비', '원장', 'M7', ''],
    ['tt-reg-1', '정규', 'start', 0, '학교 학사일정·교과서 목록 재확인', '데스크 조교', 'ENG-EXAM-01', ''],
    ['tt-reg-2', '정규', 'start', 7, '이번 학기 시험 기간 입력·갱신', '원장', 'ENG-TEST-07', 'exam'],
    ['tt-reg-3', '정규', 'start', 30, '학교알리미 평가계획 공시 확인 → 수행평가 비율·서술형 갱신', '원장', 'ENG-EXAM-06', 'exam/plan'],
    ['tt-ex-1', '내신대비', 'start', 0, '내신 기준 전환 확인 (내신 양식·구두 강화·코칭 조교 2명)', '원장', 'ENG-TEST-07 · ENG-COACH-01', 'coaching'],
    ['tt-ex-2', '내신대비', 'start', 0, '내신 교재 제작 지시 (4종, 이전 교재 샘플) — 기말은 중간 직후부터', '원장', 'ENG-EXAM-02·04', ''],
    ['tt-ex-3', '내신대비', 'start', 0, '학교 유인물 학생별 수령 체크 시작 (전원 제출 확인)', '강사', 'ENG-EXAM-03', 'exam/handout'],
    ['tt-ex-4', '내신대비', 'start', 7, '수행평가 일정·평가계획 확인, 수업·코칭 대비', '강사', 'ENG-EXAM-07', 'exam/plan'],
    ['tt-ex-5', '내신대비', 'start', 7, '서술형 수작업 교재 요청 (강사→원장→조교), 내신계획서로 누락 확인', '원장', 'ENG-EXAM-04', ''],
    ['tt-ex-6', '내신대비', 'end', -28, '강사에게 시험 범위 확정·받아 온 유인물 확인 지시 (시험 D-21)', '원장', 'LES-20261015-MEMO-02', 'exam/handout'],
    ['tt-ex-7', '내신대비', 'end', -21, '유인물 하드카피 강사 수령 → 조교 취합·교재 반영 (시험 D-14)', '데스크 조교', 'ENG-EXAM-04', 'exam/handout'],
    ['tt-ex-8', '내신대비', 'end', -17, '외부지문 확인 — 고등 필수, 중등도 체크 (시험 D-10)', '강사', '사용자 지시 2026-10-19', 'exam/handout'],
    ['tt-ex-9', '내신대비', 'end', -14, '외부지문 하드카피 수령 → 조교 취합·교재 반영 (시험 D-7)', '데스크 조교', '사용자 지시 2026-10-19', 'exam/handout'],
    ['tt-ex-10', '내신대비', 'end', -14, '시험기간 기강 점검 · 주말 보강 없음 확인 (시험 D-7)', '원장', 'OPS-20261012-MEMO-01 · ENG-EXAM-05', ''],
    ['tt-ex-11', '내신대비', 'end', -4, '내신 성적 기록 (점수·등급, 시험 후 3일)', '강사', 'ENG-GRADE-01', 'grades'],
    ['tt-vac-1', '방학', 'start', -7, '휴원 일정 공지 (주말 포함 5일)', '원장', 'OPS-20261013-MEMO-01', 'send'],
    ['tt-vac-2', '방학', 'start', 0, '방학 첫 주 체크리스트 (DAY1~3)', '강사', 'CORE-VAC-01', ''],
    ['tt-vac-3', '방학', 'start', 7, '방학 진도 50% 점검', '강사', 'CORE-VAC-01', ''],
    ['tt-vac-4', '방학', 'end', 0, '결산 평가·재등록 제안', '원장', 'CORE-VAC-03 · CORE-RENEW-01', ''],
    ['tt-tr-1', '전환기', 'start', 0, '중3 학습 플랜을 고등 대비로 전환', '강사', 'LES-20261015-MEMO-03', 'students'],
    ['tt-tr-2', '전환기', 'start', 0, '중→고 전환 설명회 준비 (중3 기준)', '원장', 'OPS-20261015-MEMO-02', ''],
    ['tt-tr-3', '전환기', 'start', 30, '겨울방학 전 전환기 집중 상담', '원장', 'CORE-CHURN-03', 'students'],
    ['tt-sem-1', '설명회', 'start', 0, '설명회 일정 확정·홍보', '원장', 'ENG-TERM-03', 'send'],
    ['tt-sem-2', '설명회', 'start', 14, '설명회 참석자 개별 상담·등록 연결', '원장', 'OPS-20261012-MEMO-04', 'consult'],
    ['tt-w-1', '상시', 'weekly', 0, '강사 1:1 회의', '원장', 'HR-20261019-MEMO-01', ''],
    ['tt-w-2', '상시', 'weekly', 0, '블로그 주 3회 + 숏폼 주 2회', '데스크 조교', 'ENG-PROMO-01·05', 'content'],
    ['tt-w-3', '상시', 'weekly', 2, '수요일 약점 보강 세션', '강사', 'F10', 'remedial'],
    ['tt-w-4', '상시', 'weekly', 0, '초등 학습 결과물 확인 (조교 준비 → 원장 판단)', '데스크 조교', 'F16 (정의 중)', ''],
    ['tt-m-1', '상시', 'monthly', 0, '월간 학부모 리포트', '원장', 'ENG-REPORT-01', 'send'],
    ['tt-m-2', '상시', 'monthly', 0, '월초·월말 등록 변동 점검, 재등록 D-14 연락', '원장', 'OPS-20261012-MEMO-03', 'students'],
    ['tt-m-3', '상시', 'monthly', 0, '강사 평가 설문 (1~1.5개월 간격)', '원장', 'F12', 'teachereval'],
    ['tt-m-4', '상시', 'monthly', 0, '설명회 개최 검토 (매월 권장)', '원장', 'ENG-TERM-03', ''],
  ].forEach((r) => data.taskTemplates.push({ id: r[0], kind: r[1], rel: r[2], offset: r[3], title: r[4], owner: r[5], source: r[6], link: r[7] }));
}

/* 시간표 데모 (F14) — 실제 반·시간은 사용자가 입력한다. 시간 근거: LES-20261012-MEMO-01(초등 월수금 80분·화목 120분), 중1 prime 월수 4~7시 */
function seedTimetable() {
  const t = D.today();
  const ids = (names) => data.students.filter((s) => names.includes(s.name)).map((s) => s.id);
  data.timetables.push({ id: 'tt-demo-old', name: '2026 2학기 (9월~10월 중순)', from: '2026-08-17', to: D.add(t, -8) });
  data.timetables.push({ id: 'tt-demo-now', name: '2026 2학기 (10월 중순~)', from: D.add(t, -7), to: '' });
  const slot = (tt, day, start, end, cls, teacher, names) => data.timetableSlots.push({ id: 'ts-' + tt + '-' + day + '-' + start.replace(':', ''), timetable_id: tt, day: day, start: start, end: end, className: cls, teacher: teacher, student_ids: ids(names) });
  ['tt-demo-old', 'tt-demo-now'].forEach((tt) => {
    const now = tt === 'tt-demo-now';
    ['월', '수', '금'].forEach((d) => slot(tt, d, '14:30', '15:50', '초등 (1:1 태블릿)', '초등 강사', now ? ['강민준', '윤서아'] : ['윤서아']));
    ['화', '목'].forEach((d) => slot(tt, d, '14:30', '16:30', '초등 (1:1 태블릿)', '초등 강사', ['강민준']));
    ['월', '수'].forEach((d) => slot(tt, d, '16:00', '19:00', '중등 BASIC 반', '박강사', ['박도윤', '최지우']));
    ['화', '목'].forEach((d) => slot(tt, d, '17:30', '20:00', '중등 EXPERT 반', '최강사', now ? ['김하준', '이서연', '정유나', '임시우'] : ['김하준', '이서연', '정유나']));
  });
}

/* 유인물·외부지문 데모 (F15) — 첫 번째 데모 시험(위례중 중2) 기준 */
function seedHandouts() {
  const ex = data.examPeriods[0];
  if (!ex) return;
  const t = D.today();
  ex.externalStatus = '확인 전';
  [['5과 본문 프린트', '유인물', -12, true, true], ['6과 문법 프린트', '유인물', -5, false, false]].forEach((r, i) => {
    const id = 'ho-demo-' + i;
    data.handouts.push({ id: id, exam_id: ex.id, title: r[0], kind: r[1], issuedAt: D.add(t, r[2]), teacherReceived: r[3], compiled: r[4] });
    data.students.filter((s) => s.school === ex.school && s.grade === ex.grade).forEach((s, k) => {
      if (i === 0 || k === 0) data.handoutChecks.push({ id: 'hc-demo-' + i + '-' + k, handout_id: id, student_id: s.id, date: D.add(t, r[2] + 1) });
    });
  });
}

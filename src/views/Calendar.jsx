/* 학사 일정 (F13): 학사 기간 → 지금 기간 판정 → 기간별 업무. 원본 표는 subjects/english/calendar-tasks.md
 * HomeSection 은 홈 최상단(지금 기간·할 일)에서도 쓴다. 완료 체크는 taskChecks 에 "기간ID|업무ID"(상시는 주·월 키)로 쌓인다. */
import { useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { AlertCircle, ArrowUpRight, CalendarClock, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, GraduationCap, Headset, UserRound } from 'lucide-react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { Badge, Card, Empty, Field, Modal, PageHead, Select, Table, Tabs, confirmBox, openModal, toast } from '../ui.jsx';

const KINDS = ['내신대비', '방학', '신학기', '설명회', '전환기', '정규'];
const KIND_LABEL = { 내신대비: '내신 대비', 방학: '방학', 신학기: '신학기 준비', 설명회: '설명회', 전환기: '전환기', 정규: '정규' };
const KIND_TONE = { 내신대비: 'warn', 방학: 'ok', 신학기: '', 설명회: '', 전환기: '', 정규: 'gray' };
const OWNERS = ['원장', '강사', '코칭 조교', '데스크 조교'];
const NAESHIN = 35; // 내신 기준 시작 = 시험 35일 전 (domain.js 와 같은 값)

// 내신 대비 기간은 시험일에서 계산한다 (시작 = 가장 이른 시험 −35일, 끝 = 가장 늦은 시험 +7일)
export function range(p) {
  if (p.examMatch) {
    const exams = store.list('examPeriods', (e) => e.name.includes(p.examMatch) && e.date >= D.add(p.start, -30) && e.date <= D.add(p.end, 30));
    if (exams.length) {
      const ds = exams.map((e) => e.date).sort();
      return { start: D.add(ds[0], -NAESHIN), end: D.add(ds[ds.length - 1], 7), derived: true, exams: exams };
    }
  }
  return { start: p.start, end: p.end, derived: false, exams: [] };
}
export function active(date) {
  return store.list('academicPeriods').map((p) => Object.assign({ p: p }, range(p)))
    .filter((r) => r.start <= date && date <= r.end)
    .sort((a, b) => KINDS.indexOf(a.p.kind) - KINDS.indexOf(b.p.kind));
}
const isDone = (key) => !!store.get('taskChecks', key);
function toggle(key) {
  if (isDone(key)) store.remove('taskChecks', key);
  else store.upsert('taskChecks', { id: key, doneAt: D.today() });
}
function periodTasks(r) {
  return store.list('taskTemplates', (t) => t.kind === r.p.kind).map((t) => {
    const due = D.add(t.rel === 'end' ? r.end : r.start, t.offset);
    const key = r.p.id + '|' + t.id;
    return { t: t, due: due, key: key, done: isDone(key) };
  }).sort((a, b) => (a.due < b.due ? -1 : 1));
}
function monday(date) { const d = new Date(date + 'T00:00:00'); return D.add(date, -((d.getDay() + 6) % 7)); }
function recurringTasks(date) {
  const mon = monday(date);
  const month = date.slice(0, 7);
  return store.list('taskTemplates', (t) => t.kind === '상시').map((t) => {
    const weekly = t.rel === 'weekly';
    const key = t.id + '|' + (weekly ? 'W' + mon : 'M' + month);
    return { t: t, due: weekly ? D.add(mon, t.offset) : month + '-01', key: key, done: isDone(key), cycle: weekly ? '이번 주' : '이번 달' };
  });
}

// 업무별 실시간 현황 (유인물 미제출·외부지문 미확인)
function liveHint(t, r) {
  if (t.link !== 'exam/handout' || !r || !r.exams.length) return null;
  if (/외부지문/.test(t.title)) {
    const n = r.exams.filter((e) => (e.externalStatus || '확인 전') === '확인 전').length;
    return n ? <Badge tone="bad">{'외부지문 미확인 ' + n + '개 시험'}</Badge> : <Badge tone="ok">외부지문 확인 완료</Badge>;
  }
  let missing = 0;
  r.exams.forEach((e) => {
    const students = store.list('students', (s) => s.status === '재원' && s.school === e.school && s.grade === e.grade);
    store.list('handouts', (x) => x.exam_id === e.id).forEach((ho) => {
      missing += students.filter((s) => !store.list('handoutChecks', (c) => c.handout_id === ho.id && c.student_id === s.id).length).length;
    });
  });
  return missing ? <Badge tone="bad">{'유인물 미제출 ' + missing + '건'}</Badge> : <Badge tone="ok">유인물 전원 제출</Badge>;
}

/* ---------- 홈 할 일 목록: 기한별 묶음(지남 / 7일 안 / 예정) · 진행률 · 완료 접기 · 담당자 필터 ---------- */
const OWNER_ICON = { 원장: UserRound, 강사: GraduationCap, '코칭 조교': ClipboardCheck, '데스크 조교': Headset };
const GROUPS = [
  { id: 'late', label: '기한 지남', Icon: AlertCircle },
  { id: 'soon', label: '7일 안', Icon: CalendarClock },
  { id: 'later', label: '예정', Icon: CalendarDays },
];
const RECUR_GROUPS = [
  { id: 'week', label: '이번 주', Icon: CalendarClock },
  { id: 'month', label: '이번 달', Icon: CalendarDays },
];
function groupOf(x, today) {
  if (x.cycle) return x.cycle === '이번 주' ? 'week' : 'month';
  if (x.due < today) return 'late';
  return D.diff(x.due, today) <= 7 ? 'soon' : 'later';
}

function TaskRow({ x, today, r }) {
  const g = x.done ? 'done' : groupOf(x, today);
  const OwnerIcon = OWNER_ICON[x.t.owner] || UserRound;
  const due = x.cycle ? x.cycle : g === 'late' ? D.md(x.due) + ' · ' + D.diff(today, x.due) + '일 지남' : D.md(x.due) + (x.due === today ? ' · 오늘' : ' · D-' + D.diff(x.due, today));
  return (
    <li className={'task ' + g}>
      <input type="checkbox" checked={x.done} onChange={() => toggle(x.key)} aria-label={x.t.title + ' 완료'} />
      <div className="task-main">
        <span className="task-title">{x.t.title}</span>
        {x.done ? null : <span className="task-hint">{liveHint(x.t, r)}</span>}
      </div>
      <span className="task-owner" title="담당"><OwnerIcon size={13} />{x.t.owner}</span>
      <span className="task-due">{due}</span>
      {x.t.link ? <a className="task-open" href={'#/' + x.t.link} title="관련 화면 열기" aria-label="관련 화면 열기"><ArrowUpRight size={15} /></a> : <span className="task-open" />}
    </li>
  );
}

function TaskCard({ title, tasks, today, r, groups }) {
  const [showDone, setShowDone] = useState(false);
  const [listRef] = useAutoAnimate();
  const done = tasks.filter((x) => x.done);
  const open = tasks.filter((x) => !x.done);
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const lateN = open.filter((x) => groupOf(x, today) === 'late').length;
  return (
    <section className="card task-card">
      <div className="card-head">
        <h2>{title}</h2>
        <div className="task-progress">
          {lateN ? <Badge tone="bad">{'지남 ' + lateN}</Badge> : null}
          <span className="small muted">{done.length + ' / ' + tasks.length + ' 완료'}</span>
          <div className="task-bar"><i style={{ width: pct + '%' }} /></div>
        </div>
      </div>
      {!tasks.length ? <Empty>이 기간에 등록된 업무가 없습니다</Empty> : (
        <div ref={listRef}>
          {groups.map((g) => {
            const xs = open.filter((x) => groupOf(x, today) === g.id);
            if (!xs.length) return null;
            return (
              <div key={g.id} className={'task-group ' + g.id}>
                <div className="task-group-head"><g.Icon size={14} />{g.label}<span className="task-count">{xs.length}</span></div>
                <ul className="task-list">{xs.map((x) => <TaskRow key={x.key} x={x} today={today} r={r} />)}</ul>
              </div>
            );
          })}
          {!open.length ? <div className="task-alldone"><CheckCircle2 size={16} />모두 완료했습니다</div> : null}
          {done.length ? (
            <div key="done" className="task-group done">
              <button type="button" className="task-group-head task-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{'완료 ' + done.length + '개 ' + (showDone ? '접기' : '보기')}
              </button>
              {showDone ? <ul className="task-list">{done.map((x) => <TaskRow key={x.key} x={x} today={today} r={r} />)}</ul> : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* 홈 최상단: 지금 기간 + 기간별 할 일 + 상시 주기 업무 */
export function HomeSection({ today }) {
  const [st, set] = useViewState('home-tasks', { owner: '전체' });
  const mine = (xs) => (st.owner === '전체' ? xs : xs.filter((x) => x.t.owner === st.owner));
  const act = active(today);
  const primary = act[0];
  const next = store.list('academicPeriods').map((p) => Object.assign({ p: p }, range(p))).filter((r) => r.start > today).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  let examInfo = null;
  if (primary && primary.exams.length) {
    const up = primary.exams.filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (up.length) examInfo = '가장 가까운 시험 ' + up[0].school + ' ' + up[0].grade + ' D-' + D.diff(up[0].date, today);
  }
  const rec = recurringTasks(today);
  return (
    <div style={{ marginBottom: 18 }}>
      <section className="card" style={{ borderLeft: '5px solid var(--primary)', marginBottom: 14 }}>
        <div className="small muted">{'지금 기간 · ' + D.md(today) + ' 기준'}</div>
        {primary ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{primary.p.name}</span>
            <span className="muted">{D.md(primary.start) + ' ~ ' + D.md(primary.end) + (primary.derived ? ' (시험일에서 계산)' : '')}</span>
            {examInfo ? <Badge tone="warn">{examInfo}</Badge> : null}
          </div>
        ) : <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>등록된 기간 없음</div>}
        {act.length > 1 ? (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="small muted">함께 진행 중:</span>
            {act.slice(1).map((r) => <Badge key={r.p.id} tone={KIND_TONE[r.p.kind]}>{r.p.name + ' (~' + D.md(r.end) + ')'}</Badge>)}</div>
        ) : null}
        {next ? <div className="small muted" style={{ marginTop: 6 }}>{'다음 기간: ' + next.p.name + ' ' + D.md(next.start) + ' 시작 (D-' + D.diff(next.start, today) + ')'}</div> : null}
        <div className="small" style={{ marginTop: 6 }}><a href="#/calendar">전체 학사 일정 보기 ›</a></div>
      </section>
      <div className="task-filter" role="group" aria-label="담당자 필터">
        <span className="small muted">담당</span>
        {['전체'].concat(OWNERS).map((o) => {
          const Icon = OWNER_ICON[o];
          return <button key={o} type="button" className={'chip' + (st.owner === o ? ' on' : '')} onClick={() => set({ owner: o })}>{Icon ? <Icon size={13} /> : null}{o}</button>;
        })}
      </div>
      <div className="grid" style={{ gap: 14 }}>
        {act.map((r) => <TaskCard key={r.p.id} title={r.p.name + ' 할 일'} tasks={mine(periodTasks(r))} today={today} r={r} groups={GROUPS} />)}
        <TaskCard title="상시 주기 업무" tasks={mine(rec)} today={today} r={null} groups={RECUR_GROUPS} />
      </div>
    </div>
  );
}

/* ---------- 연간 일정 ---------- */
function PeriodModal({ p, close }) {
  p = p || {};
  const [f, setF] = useState({ name: p.name || '', kind: p.kind || '정규', start: p.start || '', end: p.end || '', match: p.examMatch || '' });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title={p.id ? '기간 수정' : '기간 추가'} onClose={close} actions={[{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (!f.name.trim() || !f.start || !f.end) { toast('이름과 날짜를 입력하세요'); return false; }
      store.upsert('academicPeriods', { id: p.id, name: f.name.trim(), kind: f.kind, start: f.start, end: f.end, examMatch: f.match.trim(), memo: p.memo || '' });
    } }]}>
      <Field label="이름"><input type="text" value={f.name} onChange={(e) => up('name')(e.target.value)} /></Field>
      <Field label="종류"><Select options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={f.kind} onChange={up('kind')} /></Field>
      <div className="row">
        <Field label="시작"><input type="date" value={f.start} onChange={(e) => up('start')(e.target.value)} /></Field>
        <Field label="끝"><input type="date" value={f.end} onChange={(e) => up('end')(e.target.value)} /></Field>
      </div>
      <Field label="시험 연결 (내신 대비만)" hint="내신 관리의 시험명에 이 글자가 들어 있으면 그 시험일로 기간을 자동 계산합니다(시작 −35일, 끝 +7일). 위 날짜는 시험 입력이 없을 때 쓰입니다.">
        <input type="text" value={f.match} placeholder="예: 2학기 기말" onChange={(e) => up('match')(e.target.value)} />
      </Field>
    </Modal>
  );
}
const editPeriod = (p) => openModal((close) => <PeriodModal p={p} close={close} />);

const GANTT_COLOR = { 내신대비: 'var(--warn)', 방학: 'var(--ok)', 신학기: 'var(--primary)', 설명회: 'var(--primary)', 전환기: 'var(--primary)', 정규: 'var(--muted)' };

function Year() {
  const today = D.today();
  const rows = store.list('academicPeriods').map((p) => Object.assign({ p: p }, range(p))).sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!rows.length) return <Card><Empty>등록된 기간이 없습니다</Empty></Card>;
  const min = rows[0].start; const max = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
  const span = D.diff(max, min) || 1;
  const pct = (d) => Math.max(0, Math.min(100, (D.diff(d, min) / span) * 100));
  const months = [];
  for (let d = min.slice(0, 7) + '-01'; d <= max; d = D.add(d, 32).slice(0, 7) + '-01') if (d >= min) months.push(d);
  return (
    <div>
      <Card title="연간 타임라인" right={<Badge tone="gray">빨간 선 = 오늘</Badge>}>
        <div style={{ overflowX: 'auto' }}><div style={{ minWidth: 640 }}>
          <div style={{ position: 'relative', paddingTop: 20 }}>
            {months.map((m) => <span key={m} className="small muted" style={{ position: 'absolute', top: 0, left: pct(m) + '%' }}>{+m.slice(5, 7) + '월'}</span>)}
            <div style={{ position: 'absolute', top: 18, bottom: 0, left: pct(today) + '%', borderLeft: '2px solid var(--bad)', zIndex: 1 }} title="오늘" />
            {rows.map((r) => (
              <div key={r.p.id} style={{ position: 'relative', height: 26, margin: '4px 0' }}>
                <div title={r.p.name + ' ' + r.start + ' ~ ' + r.end} style={{ position: 'absolute', height: 22, borderRadius: 6, opacity: 0.85, color: '#fff', fontSize: 11, lineHeight: '22px', padding: '0 6px', whiteSpace: 'nowrap', overflow: 'hidden',
                  background: GANTT_COLOR[r.p.kind], left: pct(r.start) + '%', width: Math.max(2, pct(r.end) - pct(r.start)) + '%' }}>{r.p.name}</div>
              </div>
            ))}
          </div>
        </div></div>
      </Card>
      <Card title="기간 목록" right={<span className="small muted">날짜는 예시값 — 학교 학사일정을 받으면 고치세요</span>}>
        <Table rows={rows} cols={[
          { label: '기간', render: (r) => <b>{r.p.name}</b> },
          { label: '종류', render: (r) => <Badge tone={KIND_TONE[r.p.kind]}>{KIND_LABEL[r.p.kind]}</Badge> },
          { label: '날짜', render: (r) => [r.start + ' ~ ' + r.end, r.derived ? <div key="d" className="small muted">{'시험 ' + r.exams.length + '건에서 계산'}</div> : (r.p.examMatch ? <div key="d" className="small muted">시험 미입력 — 기본 날짜</div> : null)] },
          { label: '상태', render: (r) => (r.end < today ? <Badge tone="gray">종료</Badge> : r.start > today ? <Badge>{'예정 D-' + D.diff(r.start, today)}</Badge> : <Badge tone="ok">진행 중</Badge>) },
          { label: '업무', class: 'num', render: (r) => { const ts = periodTasks(r); return ts.filter((x) => x.done).length + ' / ' + ts.length; } },
          { label: '', render: (r) => <span><button className="btn sm" onClick={() => editPeriod(r.p)}>수정</button>{' '}
            <button className="btn sm ghost" onClick={() => confirmBox('"' + r.p.name + '" 기간을 삭제할까요? 완료 체크 기록은 남습니다.', () => { store.remove('academicPeriods', r.p.id); }, true)}>삭제</button></span> },
        ]} />
      </Card>
    </div>
  );
}

/* ---------- 기간별 업무 (템플릿) ---------- */
function TemplateModal({ close }) {
  const [f, setF] = useState({ kind: '내신대비', rel: 'start', offset: 0, title: '', owner: '원장', source: '' });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title="업무 추가" onClose={close} actions={[{ label: '취소' }, { label: '추가', kind: 'primary', onClick: () => {
      if (!f.title.trim()) { toast('업무 내용을 입력하세요'); return false; }
      store.upsert('taskTemplates', { kind: f.kind, rel: f.rel, offset: +f.offset || 0, title: f.title.trim(), owner: f.owner, source: f.source.trim(), link: '' });
    } }]}>
      <Field label="업무"><input type="text" value={f.title} onChange={(e) => up('title')(e.target.value)} /></Field>
      <div className="row">
        <Field label="기간 종류"><Select options={KINDS.concat(['상시']).map((k) => ({ value: k, label: KIND_LABEL[k] || '상시 주기' }))} value={f.kind} onChange={up('kind')} /></Field>
        <Field label="담당"><Select options={OWNERS} value={f.owner} onChange={up('owner')} /></Field>
      </div>
      <div className="row">
        <Field label="기준"><Select options={[{ value: 'start', label: '기간 시작 기준' }, { value: 'end', label: '기간 끝 기준' }, { value: 'weekly', label: '매주' }, { value: 'monthly', label: '매월' }]} value={f.rel} onChange={up('rel')} /></Field>
        <Field label="며칠 뒤 (음수 = 전)"><input type="number" value={f.offset} onChange={(e) => up('offset')(e.target.value)} /></Field>
      </div>
      <Field label="출처"><input type="text" value={f.source} placeholder="근거 규칙 ID (선택)" onChange={(e) => up('source')(e.target.value)} /></Field>
    </Modal>
  );
}

function Templates() {
  const all = store.list('taskTemplates');
  const when = (t) => (t.rel === 'weekly' ? '매주' : t.rel === 'monthly' ? '매월' : (t.rel === 'end' ? '끝 ' : '시작 ') + (t.offset >= 0 ? '+' : '') + t.offset + '일');
  return (
    <div>
      {KINDS.concat(['상시']).map((k) => {
        const rows = all.filter((t) => t.kind === k);
        return (
          <Card key={k} title={(KIND_LABEL[k] || '상시 주기 업무') + ' (' + rows.length + ')'}>
            <Table rows={rows} empty="업무가 없습니다" cols={[
              { label: '언제', render: when }, { label: '업무', key: 'title' }, { label: '담당', render: (t) => <Badge tone="gray">{t.owner}</Badge> },
              { label: '출처', render: (t) => <span className="small muted">{t.source}</span> },
              { label: '', render: (t) => <button className="btn sm ghost" onClick={() => confirmBox('이 업무를 목록에서 뺄까요?', () => { store.remove('taskTemplates', t.id); }, true)}>삭제</button> },
            ]} />
          </Card>
        );
      })}
      <p className="small muted">원본 표: subjects/english/calendar-tasks.md (매뉴얼 행 ID·규칙 ID 출처 포함). 내신 대비의 "끝"은 마지막 시험 + 7일이라 끝 −21일 = 시험 D-14입니다.</p>
    </div>
  );
}

export default function Calendar() {
  const [st, set] = useViewState('calendar', { tab: 'year' });
  const t = [{ id: 'year', label: '연간 일정' }, { id: 'tpl', label: '기간별 업무' }];
  return (
    <div className="page">
      <PageHead title="학사 일정" sub="기간을 정해 두면 홈에 지금 기간과 해야 할 일이 뜹니다 (F13)">
        {st.tab === 'year'
          ? <button className="btn primary" onClick={() => editPeriod()}>+ 기간 추가</button>
          : <button className="btn primary" onClick={() => openModal((close) => <TemplateModal close={close} />)}>+ 업무 추가</button>}
      </PageHead>
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'year' ? <Year /> : <Templates />}
    </div>
  );
}

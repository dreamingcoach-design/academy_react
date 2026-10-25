/* 출결·숙제 — 코칭실 일지 (core/09 §9, F11 숙제 오답 수집 포함)
 * 저장 버튼 없음: 칸을 누를 때마다 즉시 저장된다 (§9-2). */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { Badge, Card, Empty, Field, Kpi, Modal, PageHead, Select, Table, Tabs, copyText, openModal, toast } from '../ui.jsx';

const state = () => ({ tab: 'log', date: D.today(), work: [], active: null, cls: '' });

function ensureEntry(student, date) {
  let e = dom.entryFor(student.id, date);
  if (!e) e = store.upsert('coachingEntries', { student_id: student.id, date: date, attend: true, items: {}, briefed: false });
  return e;
}
function setCell(student, date, code, field, value) {
  const e = ensureEntry(student, date);
  const items = Object.assign({}, e.items);
  const cur = Object.assign({}, items[code] || {});
  cur[field] = cur[field] === value ? null : value; // 같은 값을 다시 누르면 해제
  items[code] = cur;
  store.upsert('coachingEntries', { id: e.id, items: items, briefed: false });
}

function OX({ student, date, code, field, cur }) {
  return (
    <div className="ox">
      <button className={cur === 'o' ? 'on-o' : ''} aria-label="○" onClick={() => setCell(student, date, code, field, 'o')}>○</button>
      <button className={cur === 'x' ? 'on-x' : ''} aria-label="×" onClick={() => setCell(student, date, code, field, 'x')}>×</button>
    </div>
  );
}

/* F11: 틀린 문항 번호 그리드 */
function WrongGrid({ student, date, close }) {
  const maps = store.list('itemMaps');
  const [mapId, setMapId] = useState(maps[0].id);
  const map = store.get('itemMaps', mapId);
  const wrong = store.list('errorItems', (x) => x.student_id === student.id && x.date === date && x.itemmap_id === mapId && x.source === '숙제 오답');
  return (
    <Modal title={student.name + ' · 숙제 오답 입력'} onClose={close} actions={[{ label: '완료', kind: 'primary' }]}>
      <Field label="교재·시험"><Select options={maps.map((m) => ({ value: m.id, label: m.book }))} value={mapId} onChange={setMapId} /></Field>
      <p className="small muted">학생이 자가 채점한 숙제를 보고 틀린 번호를 누르세요. 누르는 즉시 저장되며, 영역·문제유형은 문항 맵에서 자동 부여됩니다.</p>
      <div className="numgrid">{map ? map.items.map((it) => {
        const hit = wrong.find((x) => x.no === it.no);
        return (
          <button key={it.no} className={hit ? 'on' : ''} title={dom.typeName(it.type)} onClick={() => {
            if (hit) store.remove('errorItems', hit.id);
            else store.upsert('errorItems', { student_id: student.id, date: date, source: '숙제 오답', itemmap_id: mapId, no: it.no, area: it.area, type: it.type, photo_name: '' });
          }}>{it.no}<span className="t">{it.type.split('-')[1]}</span></button>
        );
      }) : null}</div>
      <p className="small">오늘 틀린 문항: {wrong.length ? wrong.map((x) => x.no).sort((a, b) => a - b).join(', ') : '없음'}</p>
      <Field label="틀린 부분 사진 (선택 · AI 분석 없이 참고용 첨부)">
        <input type="file" accept="image/*" onChange={(ev) => {
          const f = ev.target.files[0];
          if (!f) return;
          wrong.forEach((x) => store.upsert('errorItems', { id: x.id, photo_name: f.name }));
          toast('사진 파일명을 기록했습니다 (이 버전은 파일 자체를 저장하지 않음)');
        }} />
      </Field>
    </Modal>
  );
}
function wrongGrid(student, date) {
  if (!store.list('itemMaps').length) { toast('등록된 문항 맵이 없습니다 (설정 › 문항 맵 관리)'); return; }
  openModal((close) => <WrongGrid student={student} date={date} close={close} />);
}

function FailTag({ student, date, code, item }) {
  const e = dom.entryFor(student.id, date);
  const cur = ((e && e.items[code]) || {}).errType || '';
  const types = store.list('errorTypes', (t) => t.active && t.area === item.area);
  return (
    <Select options={[{ value: '', label: '유형 태그(선택)' }].concat(types.map((t) => ({ value: t.code, label: t.name })))} value={cur} onChange={(v) => {
      const en = ensureEntry(student, date);
      const items = Object.assign({}, en.items);
      const c = Object.assign({}, items[code] || {});
      if (c.errId) store.remove('errorItems', c.errId);
      c.errType = v; c.errId = null;
      if (c.errType) {
        const row = store.upsert('errorItems', { student_id: student.id, date: date, source: '코칭 데일리', no: null, area: item.area, type: c.errType, photo_name: '' });
        c.errId = row.id;
      }
      items[code] = c;
      store.upsert('coachingEntries', { id: en.id, items: items });
    }} />
  );
}

function BriefModal({ student, date, close }) {
  const text = dom.briefing(student, date);
  return (
    <Modal title={student.name + ' 학원친구 브리핑'} onClose={close} actions={[{ label: '닫기' }, { label: '복사', kind: 'primary', onClick: () => {
      copyText(text);
      const e = ensureEntry(student, date);
      store.upsert('coachingEntries', { id: e.id, briefed: true });
      const g = dom.guardianOf(student.id);
      store.upsert('messageLogs', { student_id: student.id, guardian_id: g ? g.id : null, channel: '학원친구(수동 복사)', template: '코칭 브리핑', date: date, status: '복사' });
    } }]}>
      {dom.status(student, date) !== 'done' ? <p><Badge tone="warn">입력 미완료</Badge> 아직 채우지 않은 칸은 통과·제출로 표시됩니다. 모든 칸을 입력한 뒤 복사하세요.</p> : null}
      <p className="small muted">학원친구에 복사·붙여넣기 하세요. (발송이 아니라 복사용 텍스트입니다)</p>
      <pre>{text}</pre>
    </Modal>
  );
}

function Panel({ student, st, set }) {
  const date = st.date;
  const e = dom.entryFor(student.id, date);
  const m = dom.mode(student, date);
  const plan = dom.planFor(student.className, date);
  const items = dom.activeItems(student, date);
  return (
    <Card title={student.name + ' · ' + student.className}
      right={<button className="btn sm ghost" onClick={() => { const work = st.work.filter((x) => x !== student.id); set({ work: work, active: work[0] || null }); }}>닫기</button>}>
      <div>
        <div className="row" style={{ marginBottom: 10 }}>
          {m.kind === 'naeshin' ? <Badge tone="warn">{'내신기간 일지 · D-' + m.dn}</Badge> : <Badge>정규반 일지</Badge>}
          <label><input type="checkbox" checked={e ? e.attend !== false : true} onChange={(ev) => { const en = ensureEntry(student, date); store.upsert('coachingEntries', { id: en.id, attend: ev.target.checked }); }} /> 출석</label>
        </div>
        <div className="table-wrap"><table className="tbl">
          <thead><tr>{['항목', '범위', '숙제 이행', '테스트 통과'].map((t) => <th key={t}>{t}</th>)}</tr></thead>
          <tbody>{items.map((it) => {
            const c = (e && e.items[it.code]) || {};
            const test = dom.hasTest(it, m);
            const isGrm = it.code === '문법교재';
            return (
              <tr key={it.code}>
                <td><b>{it.code}</b></td>
                <td className="small muted">{(plan && plan.ranges[it.code]) || '—'}</td>
                <td><OX student={student} date={date} code={it.code} field="hw" cur={c.hw} />
                  {isGrm ? <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => wrongGrid(student, date)}>틀린 문항 입력</button>{' '}
                    <Badge tone="gray">{store.list('errorItems', (x) => x.student_id === student.id && x.date === date && x.source === '숙제 오답').length + '개'}</Badge></div> : null}</td>
                <td>{test ? [
                  <OX key="ox" student={student} date={date} code={it.code} field="test" cur={c.test} />,
                  it.code === 'VOCA' ? <label key="re" className="small" style={{ display: 'block', marginTop: 6 }}><input type="checkbox" checked={!!c.retest} onChange={(ev) => {
                    const en = ensureEntry(student, date); const items2 = Object.assign({}, en.items);
                    items2[it.code] = Object.assign({}, items2[it.code] || {}, { retest: ev.target.checked });
                    store.upsert('coachingEntries', { id: en.id, items: items2, briefed: false });
                  }} /> 구두 재시험</label> : null,
                  c.test === 'x' ? <div key="ft" style={{ marginTop: 6 }}><FailTag student={student} date={date} code={it.code} item={it} /></div> : null,
                ] : <span className="muted small">숙제만</span>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => openModal((close) => <BriefModal student={student} date={date} close={close} />)}>브리핑 만들기</button>
          {e && e.briefed ? <Badge tone="ok">복사함</Badge> : null}
        </div>
      </div>
    </Card>
  );
}

function LogTab({ st, set }) {
  const students = dom.activeStudents();
  const classes = ['전체'].concat(Array.from(new Set(students.map((s) => s.className))));
  const list = students.filter((s) => !st.cls || st.cls === '전체' || s.className === st.cls);
  const counts = { wait: 0, hw: 0, test: 0, done: 0 };
  students.forEach((s) => { counts[dom.status(s, st.date)]++; });
  const open = (s) => set({ work: st.work.includes(s.id) ? st.work : st.work.concat([s.id]), active: s.id });
  const active = st.active && store.get('students', st.active);
  return (
    <div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="대기" value={counts.wait} /><Kpi label="숙제 검사 중" value={counts.hw} tone="warn" /><Kpi label="테스트 중" value={counts.test} /><Kpi label="완료" value={counts.done} tone="ok" />
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Field label="날짜"><input type="date" value={st.date} onChange={(ev) => set({ date: ev.target.value || D.today(), work: [], active: null })} /></Field>
        <Field label="반"><Select options={classes} value={st.cls || '전체'} onChange={(v) => set({ cls: v })} /></Field>
      </div>
      {st.work.length ? <div className="worklist"><span className="small muted">작업 중:</span>{st.work.map((id) => {
        const s = store.get('students', id);
        return s ? <button key={id} className={'chip' + (st.active === id ? ' sel' : '')} onClick={() => set({ active: id })}>{s.name}</button> : null;
      })}</div> : null}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', alignItems: 'start' }}>
        <Card title={'오늘 온 학생 (' + list.length + '명)'}>
          <div className="cards">{list.map((s) => {
            const status = dom.status(s, st.date);
            const e = dom.entryFor(s.id, st.date);
            return (
              <button key={s.id} className={'scard st-' + status + (st.active === s.id ? ' sel' : '')} onClick={() => open(s)}>
                <div className="nm">{s.name} {e && e.attend === false ? <Badge tone="bad">결석</Badge> : null}</div>
                <div className="meta">{s.grade + ' · ' + s.className}</div>
                <div className="meta"><Badge tone={status === 'done' ? 'ok' : status === 'wait' ? 'gray' : 'warn'}>{dom.STATUS_LABEL[status]}</Badge>{e && e.briefed ? ' ' : ''}{e && e.briefed ? <Badge tone="ok">브리핑</Badge> : null}</div>
              </button>
            );
          })}</div>
        </Card>
        {active ? <Panel student={active} st={st} set={set} /> : <Card title="입력"><Empty>왼쪽에서 학생을 누르세요. 칸을 누를 때마다 자동 저장됩니다</Empty></Card>}
      </div>
    </div>
  );
}

function PlanTab({ st }) {
  const classes = Array.from(new Set(dom.activeStudents().map((s) => s.className)));
  const [text, setText] = useState('');
  const parsed = text ? dom.parseNotice(text) : null;
  const apply = () => {
    if (!parsed || !parsed.className) { toast('반 이름이 있는 공지를 붙여넣으세요'); return; }
    const cur = dom.planFor(parsed.className, st.date);
    store.upsert('assignmentPlans', { id: cur ? cur.id : undefined, date: st.date, className: parsed.className, ranges: Object.assign({}, cur ? cur.ranges : {}, parsed.ranges), source: text });
    toast('배정 범위를 저장했습니다');
  };
  return (
    <div>
      <Card title="강사 공지 붙여넣기 (0단계 배정 범위)">
        <div>
          <p className="small muted">형식: 반이름 / 항목 교재 범위 / 항목 회차 범위 — 항목명은 별칭(그래머=문법교재 등)으로 자동 분리됩니다. 확인 후 [적용]을 누르세요.</p>
          <textarea placeholder="중등 EXPERT 반/ 그래머 P.32~40 / 듣기 1과 P.117~121" value={text} onChange={(e) => setText(e.target.value)} />
          <div>{parsed ? [
            <p key="c">반: <b>{parsed.className || '(없음)'}</b></p>,
            Object.keys(parsed.ranges).length ? <ul key="r">{Object.keys(parsed.ranges).map((k) => <li key={k}>{k + ' → ' + parsed.ranges[k]}</li>)}</ul> : null,
            parsed.unclassified.length ? <p key="u" className="small"><Badge tone="warn">미분류</Badge>{' ' + parsed.unclassified.join(' | ') + ' (아래 표에서 직접 입력하세요)'}</p> : null,
          ] : null}</div>
          <button className="btn primary" onClick={apply}>적용</button>
        </div>
      </Card>
      <p className="muted small">{st.date + ' 기준 반별 배정 범위 (직접 수정 가능)'}</p>
      {classes.map((cn) => {
        const p = dom.planFor(cn, st.date);
        return (
          <Card key={cn} title={cn}>
            <div className="grid g4">{dom.ITEMS.map((it) => (
              <Field key={it.code + ':' + ((p && p.ranges[it.code]) || '')} label={it.code}>
                <input type="text" defaultValue={(p && p.ranges[it.code]) || ''} placeholder="범위" onBlur={(ev) => {
                  const cur = dom.planFor(cn, st.date);
                  if (((cur && cur.ranges[it.code]) || '') === ev.target.value) return;
                  const r = Object.assign({}, cur ? cur.ranges : {}); r[it.code] = ev.target.value;
                  store.upsert('assignmentPlans', { id: cur ? cur.id : undefined, date: st.date, className: cn, ranges: r }); toast('저장');
                }} />
              </Field>
            ))}</div>
          </Card>
        );
      })}
    </div>
  );
}

function AttendTab({ st }) {
  const rows = dom.activeStudents().map((s) => ({ id: s.id, s: s, e: dom.entryFor(s.id, st.date) }));
  return (
    <Card title={'출결 (' + st.date + ')'} right={<Badge tone="gray">결석 보강 기록(F8)은 사유·증빙 조건과 함께 다음 버전</Badge>}>
      <Table rows={rows} cols={[
        { label: '학생', render: (r) => r.s.name }, { label: '반', render: (r) => r.s.className },
        { label: '출석', render: (r) => (r.e ? (r.e.attend === false ? <Badge tone="bad">결석</Badge> : <Badge tone="ok">출석</Badge>) : <Badge tone="gray">미입력</Badge>) },
        { label: '', render: (r) => <button className="btn sm" onClick={() => { const en = r.e || ensureEntry(r.s, st.date); store.upsert('coachingEntries', { id: en.id, attend: !(en.attend !== false) }); }}>출석/결석 전환</button> },
      ]} />
    </Card>
  );
}

export default function Coaching() {
  const [st, set] = useViewState('coaching', state);
  const t = [{ id: 'log', label: '코칭실 일지' }, { id: 'plan', label: '배정 범위' }, { id: 'attend', label: '출결' }];
  return (
    <div className="page">
      <PageHead title="출결·숙제" sub="코칭실 일지 — 학생이 자가 채점해 온 숙제를 조교가 검사하며 입력합니다 (칸을 누르면 즉시 저장)" />
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'log' ? <LogTab st={st} set={set} /> : st.tab === 'plan' ? <PlanTab st={st} /> : <AttendTab st={st} />}
    </div>
  );
}

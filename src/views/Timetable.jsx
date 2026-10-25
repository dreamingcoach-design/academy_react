/* 학원 시간표 (F14): 시간표 기간(버전)별로 수업 칸을 쌓는다. 지금 기간 = 끝 날짜가 비어 있는 것.
 * 새 기간을 시작하면 현재 칸을 복사하고 이전 기간은 그 전날로 닫아 보관한다 → 기간별 기록이 누적된다. */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { Badge, Card, Empty, Field, Kpi, Modal, PageHead, Select, openModal, toast } from '../ui.jsx';

const DAYS = ['월', '화', '수', '목', '금', '토'];

const versions = () => store.list('timetables').sort((a, b) => (a.from < b.from ? 1 : -1));
const current = () => versions().find((v) => !v.to) || versions()[0] || null;
const slotsOf = (id) => store.list('timetableSlots', (s) => s.timetable_id === id);
const nameOf = (sid) => { const s = store.get('students', sid); return s ? s.name : '(삭제된 학생)'; };

function SlotModal({ tt, s, close }) {
  s = s || { day: '월', start: '16:00', end: '19:00', className: '', teacher: '', student_ids: [] };
  const students = store.list('students', (x) => x.status === '재원').sort((a, b) => (a.grade + a.name < b.grade + b.name ? -1 : 1));
  const [f, setF] = useState({ day: s.day, start: s.start, end: s.end, cls: s.className, teacher: s.teacher });
  const [picked, setPicked] = useState(() => new Set(s.student_ids));
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  const toggle = (id, on) => { const n = new Set(picked); if (on) n.add(id); else n.delete(id); setPicked(n); };
  return (
    <Modal title={s.id ? '수업 칸 수정' : '수업 칸 추가'} wide onClose={close} actions={(s.id ? [{ label: '삭제', kind: 'danger', onClick: () => { store.remove('timetableSlots', s.id); } }] : []).concat([{ label: '취소' }, { label: '저장', kind: 'primary', onClick: () => {
      if (!f.cls.trim() || f.start >= f.end) { toast('반 이름과 시간(시작 < 끝)을 확인하세요'); return false; }
      store.upsert('timetableSlots', { id: s.id, timetable_id: tt.id, day: f.day, start: f.start, end: f.end, className: f.cls.trim(), teacher: f.teacher.trim(), student_ids: Array.from(picked) });
    } }])}>
      <div className="row">
        <Field label="요일"><Select options={DAYS} value={f.day} onChange={up('day')} /></Field>
        <Field label="시작"><input type="time" value={f.start} onChange={(e) => up('start')(e.target.value)} /></Field>
        <Field label="끝"><input type="time" value={f.end} onChange={(e) => up('end')(e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="반·수업"><input type="text" value={f.cls} placeholder="예: 중등 EXPERT 반" onChange={(e) => up('cls')(e.target.value)} /></Field>
        <Field label="강사"><input type="text" value={f.teacher} onChange={(e) => up('teacher')(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
        <span className="field-label">수강 학생</span>
        <button className="btn sm" type="button" onClick={() => { const n = new Set(picked); students.filter((x) => x.className === f.cls.trim()).forEach((x) => n.add(x.id)); setPicked(n); }}>이 반 학생 모두 선택</button>
      </div>
      <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 4 }}>
        {students.map((x) => <label key={x.id} className="small"><input type="checkbox" value={x.id} checked={picked.has(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} />{' ' + x.name + ' (' + x.grade + ')'}</label>)}
      </div>
    </Modal>
  );
}
const editSlot = (tt, s) => openModal((close) => <SlotModal tt={tt} s={s} close={close} />);

function VersionModal({ set, close }) {
  const cur = current();
  const [f, setF] = useState({ name: '', from: D.today() });
  return (
    <Modal title="새 시간표 기간 시작" onClose={close} actions={[{ label: '취소' }, { label: '시작', kind: 'primary', onClick: () => {
      if (!f.name.trim() || !f.from) { toast('이름과 시작일을 입력하세요'); return false; }
      if (cur && f.from <= cur.from) { toast('시작일은 지금 기간 시작일(' + cur.from + ') 이후여야 합니다'); return false; }
      const nv = store.upsert('timetables', { name: f.name.trim(), from: f.from, to: '' });
      if (cur) {
        store.upsert('timetables', { id: cur.id, to: D.add(f.from, -1) });
        slotsOf(cur.id).forEach((s) => store.upsert('timetableSlots', { timetable_id: nv.id, day: s.day, start: s.start, end: s.end, className: s.className, teacher: s.teacher, student_ids: s.student_ids.slice() }));
      }
      set({ tt: nv.id }); toast('새 기간을 시작했습니다');
    } }]}>
      <Field label="이름"><input type="text" placeholder="예: 2027 1학기" value={f.name} onChange={(e) => setF(Object.assign({}, f, { name: e.target.value }))} /></Field>
      <Field label="적용 시작일"><input type="date" value={f.from} onChange={(e) => setF(Object.assign({}, f, { from: e.target.value }))} /></Field>
      <p className="small muted">{cur ? '지금 시간표("' + cur.name + '")의 칸과 학생을 그대로 복사해 시작합니다. 이전 기간은 시작일 전날로 닫혀 보관됩니다.' : '빈 시간표로 시작합니다.'}</p>
    </Modal>
  );
}

function Grid({ tt, editable }) {
  const slots = slotsOf(tt.id);
  const days = DAYS.filter((d) => d !== '토' || slots.some((s) => s.day === '토'));
  const times = Array.from(new Set(slots.map((s) => s.start))).sort();
  if (!times.length) return <Empty>수업 칸이 없습니다. "+ 수업 칸 추가"로 시작하세요.</Empty>;
  const cell = (s) => (
    <div key={s.id} style={{ background: 'var(--primary-soft)', borderRadius: 8, padding: 8, marginBottom: 6, cursor: editable ? 'pointer' : undefined }}
      onClick={editable ? () => editSlot(tt, s) : undefined} title={editable ? '눌러서 수정' : ''}>
      <div style={{ fontWeight: 600 }}>{s.className}</div>
      <div className="small muted">{s.start + '~' + s.end + (s.teacher ? ' · ' + s.teacher : '') + ' · ' + s.student_ids.length + '명'}</div>
      <div className="small" style={{ marginTop: 4, lineHeight: 1.6 }}>{s.student_ids.length ? s.student_ids.map(nameOf).join(', ') : <span className="muted">학생 없음</span>}</div>
    </div>
  );
  return (
    <div className="table-wrap"><table className="tbl" style={{ tableLayout: 'fixed', minWidth: 760 }}>
      <thead><tr><th style={{ width: 70 }}>시작</th>{days.map((d) => <th key={d}>{d}</th>)}</tr></thead>
      <tbody>{times.map((tm) => (
        <tr key={tm}><td style={{ verticalAlign: 'top', fontWeight: 600 }}>{tm}</td>
          {days.map((d) => <td key={d} style={{ verticalAlign: 'top' }}>{slots.filter((s) => s.day === d && s.start === tm).map(cell)}</td>)}</tr>
      ))}</tbody>
    </table></div>
  );
}

export default function Timetable() {
  const [st, set] = useViewState('timetable', { tt: null });
  const vs = versions();
  const cur = current();
  if (!st.tt || !store.get('timetables', st.tt)) st.tt = cur ? cur.id : null;
  const tt = st.tt ? store.get('timetables', st.tt) : null;
  const isCur = tt && cur && tt.id === cur.id;
  const slots = tt ? slotsOf(tt.id) : [];
  const kids = new Set(); slots.forEach((s) => s.student_ids.forEach((id) => kids.add(id)));
  const notIn = store.list('students', (s) => s.status === '재원' && !kids.has(s.id));
  return (
    <div className="page">
      <PageHead title="학원 시간표" sub="시간별 수강 학생 · 기간별로 누적 보관 (F14)">
        {tt ? <button className="btn" onClick={() => editSlot(tt)}>+ 수업 칸 추가</button> : null}
        <button className="btn primary" onClick={() => openModal((close) => <VersionModal set={set} close={close} />)}>+ 새 기간 시작</button>
      </PageHead>
      {vs.length ? (
        <div className="row" style={{ marginBottom: 12, alignItems: 'flex-end' }}>
          <Field label="시간표 기간"><Select options={vs.map((v) => ({ value: v.id, label: v.name + ' (' + v.from + ' ~ ' + (v.to || '현재') + ')' }))} value={st.tt} onChange={(v) => set({ tt: v })} /></Field>
          {isCur ? <Badge tone="ok">지금 적용 중</Badge> : <Badge tone="gray">지난 기간 (보관)</Badge>}
        </div>
      ) : null}
      {tt ? (
        <div>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <Kpi label="수업 칸" value={slots.length + '개'} /><Kpi label="배정 학생" value={kids.size + '명'} />
            <Kpi label="시간표에 없는 재원생" value={notIn.length + '명'} note={notIn.length ? notIn.map((s) => s.name).join(', ') : '모두 배정됨'} tone={notIn.length ? 'warn' : 'ok'} />
            <Kpi label="적용 기간" value={tt.from.slice(5).replace('-', '/') + ' ~'} note={tt.to || '현재'} />
          </div>
          <Card title={tt.name} right={<span className="small muted">칸을 누르면 시간·학생을 고칠 수 있습니다</span>}><Grid tt={tt} editable /></Card>
        </div>
      ) : <Card><Empty>시간표가 없습니다. "+ 새 기간 시작"으로 만드세요.</Empty></Card>}
    </div>
  );
}

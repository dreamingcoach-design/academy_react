/* 약점 보강 (F10, core/09 §10): 대상 지정 → 세션 현황 → 강사 구두 확인
 * 영상 시청·1차 점검 문제는 영상·문제은행(Q-08) 확정 후 연결한다. 지금은 단계 진행 상태만 관리한다. */
import { useState } from 'react';
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { Badge, Card, Field, Modal, PageHead, Select, Table, Tabs, openModal, toast } from '../ui.jsx';

const FLOW = ['대기', '영상 시청 중', '1차 점검 중', '2차 대기', '완료'];

function AssignModal({ students, types, close }) {
  const [f, setF] = useState({ s: students[0].id, t: types[0] ? types[0].code : '', b: '공식 테스트' });
  const up = (k) => (v) => setF(Object.assign({}, f, { [k]: v }));
  return (
    <Modal title="보강 대상 지정" onClose={close} actions={[{ label: '취소' }, { label: '지정', kind: 'primary', onClick: () => {
      store.upsert('remediations', { student_id: f.s, type: f.t, basis: f.b, status: '대기', createdAt: D.today() });
    } }]}>
      <Field label="학생"><Select options={students.map((s) => ({ value: s.id, label: s.name }))} value={f.s} onChange={up('s')} /></Field>
      <Field label="약점 유형"><Select options={types.map((t) => ({ value: t.code, label: t.area + ' · ' + t.name }))} value={f.t} onChange={up('t')} /></Field>
      <Field label="근거" hint="공식 테스트(내신·수행) 오답이 우선 근거입니다 (ENG-REM-01)"><Select options={['공식 테스트', '평소 관찰']} value={f.b} onChange={up('b')} /></Field>
    </Modal>
  );
}
function assign() {
  const students = dom.activeStudents();
  if (!students.length) return;
  const types = store.list('errorTypes', (t) => t.active);
  openModal((close) => <AssignModal students={students} types={types} close={close} />);
}

function Session() {
  const rows = store.list('remediations');
  return (
    <div>
      <div className="board" style={{ gridTemplateColumns: 'repeat(5,minmax(180px,1fr))' }}>
        {FLOW.map((st, i) => (
          <div key={st} className="col">
            <h3>{st}<Badge tone="gray">{String(rows.filter((r) => r.status === st).length)}</Badge></h3>
            {rows.filter((r) => r.status === st).map((r) => {
              const s = store.get('students', r.student_id);
              return (
                <div key={r.id} className="lead"><b>{s ? s.name : '(삭제됨)'}</b><span className="small muted">{dom.typeName(r.type)}</span>
                  <div className="small"><Badge tone={r.basis === '공식 테스트' ? 'warn' : 'gray'}>{r.basis}</Badge></div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    {i < FLOW.length - 1 ? <button className="btn sm" onClick={() => store.upsert('remediations', { id: r.id, status: FLOW[i + 1] })}>{FLOW[i + 1] + ' ›'}</button> : null}
                    <button className="btn sm ghost" onClick={() => store.remove('remediations', r.id)}>삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>수요일 보강 시간대 · 여러 학생 동시 · 최대 60분. 영상 시청·1차 점검(10문제 80%)은 영상과 문제은행이 준비되면 이 단계에 연결됩니다.</p>
    </div>
  );
}

function Targets({ set }) {
  const rows = dom.activeStudents().map((s) => ({ id: s.id, s: s, w: dom.weaknesses(s.id) })).filter((r) => r.w.length);
  return (
    <Card title="약점이 쌓인 학생">
      <Table rows={rows} empty="약점 기록이 있는 학생이 없습니다" cols={[
        { label: '학생', render: (r) => r.s.name }, { label: '주요 약점', render: (r) => r.w.slice(0, 3).map((x) => <Badge key={x.type} tone="warn">{dom.typeName(x.type) + ' ' + x.n}</Badge>) },
        { label: '', render: (r) => <button className="btn sm" onClick={() => { store.upsert('remediations', { student_id: r.s.id, type: r.w[0].type, basis: '평소 관찰', status: '대기', createdAt: D.today() }); toast('보강 대상으로 지정'); set({ tab: 'session' }); }}>최다 유형 지정</button> },
      ]} />
    </Card>
  );
}

export default function Remedial() {
  const [st, set] = useViewState('remedial', { tab: 'session' });
  const t = [{ id: 'session', label: '세션 현황' }, { id: 'targets', label: '대상 후보' }];
  return (
    <div className="page">
      <PageHead title="약점 보강" sub="약점 → 영상 시청 → 1차 시스템 점검 → 2차 강사 구두 확인"><button className="btn primary" onClick={assign}>+ 보강 대상 지정</button></PageHead>
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'session' ? <Session /> : <Targets set={set} />}
    </div>
  );
}

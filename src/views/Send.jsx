/* 발송 워크플로우 (F4, core/09 §7): 학부모 리포트 알림톡 발송 화면 — 현재는 A0(수동) 단계
 * 실제 알림톡 연동(채널·대행사·템플릿 승인)은 선결 조건 미충족이라 "복사 + 발송 기록"까지만 한다. */
import { D, store } from '../lib/store.js';
import { useViewState } from '../lib/hooks.js';
import { dom } from '../lib/domain.js';
import { Badge, Card, Field, PageHead, Select, Table, Tabs, copyText, toast } from '../ui.jsx';

const COMPONENTS = ['요약', '영역별 성취(5축)', '전월 대비', '약점 분석(사진 포함)', '강점', '향후 학습 플랜', '진도', '선생님 코멘트'];

function makeText(s, st) {
  const t = D.today();
  const from = D.add(t, -29);
  const hw = dom.hwRate(s.id, from, t), tp = dom.testRate(s.id, from, t);
  const weak = dom.weaknesses(s.id).slice(0, 2).map((w) => dom.typeName(w.type));
  const on = (k) => st.checks[k] !== false;
  const lines = ['[SNP영어학원] ' + s.name + ' 학생 월간 학습 리포트', D.md(from) + ' ~ ' + D.md(t)];
  if (on('요약')) lines.push('', '▶ 요약', '숙제 이행 ' + (hw == null ? '-' : hw + '%') + ' · 테스트 통과 ' + (tp == null ? '-' : tp + '%'));
  if (on('약점 분석(사진 포함)')) lines.push('', '▶ 집중 보완 유형', weak.length ? weak.join(', ') : '기록된 약점 없음');
  if (on('향후 학습 플랜')) lines.push('', '▶ 향후 학습 플랜', weak.length ? '약점 유형 중심 개별 보강(영상 시청 → 점검) 진행 예정' : '현재 진도 유지');
  if (on('선생님 코멘트') && st.comment) lines.push('', '▶ 선생님 코멘트', st.comment);
  lines.push('', '리포트 전체 보기 ▶ (일회성 링크)');
  return lines.join('\n');
}

function Report({ arg, st, set }) {
  const students = dom.activeStudents();
  if (arg && !st.sid) st.sid = arg;
  if (!st.sid && students[0]) st.sid = students[0].id;
  const s = store.get('students', st.sid);
  const g = s && dom.guardianOf(s.id);
  const text = s ? makeText(s, st) : '';
  const canSend = !!(s && g && g.consent && st.consent1 && st.consent2);
  return (
    <div className="grid g-side">
      <Card title="알림톡 발송 · 학습 리포트" right={<Badge tone="gray">A0 수동 단계</Badge>}>
        <div>
          <Field label="수신 대상"><Select options={students.map((x) => ({ value: x.id, label: x.name }))} value={st.sid} onChange={(v) => set({ sid: v, consent1: false, consent2: false })} /></Field>
          <div className="row"><Field label="수신번호 (학부모 전화번호)"><input type="text" value={g ? g.parentPhone : ''} disabled /></Field></div>
          <div className="row">
            <Field label="발신 채널"><input type="text" value="알림톡 (실패 시 문자) — 연동 전" disabled /></Field>
            <Field label="발송 방식"><Select options={['즉시', '예약']} defaultValue="즉시" /></Field>
          </div>
          <div className="field"><span className="field-label">구성 항목</span>
            <div className="row">{COMPONENTS.map((c) => (
              <label key={c}><input type="checkbox" checked={st.checks[c] !== false} onChange={(ev) => set({ checks: Object.assign({}, st.checks, { [c]: ev.target.checked }) })} />{' ' + c}</label>
            ))}</div>
          </div>
          <Field label="선생님 코멘트"><textarea value={st.comment} onChange={(ev) => set({ comment: ev.target.value })} /></Field>
          {g && !g.consent ? <p><Badge tone="bad">수신동의 미확인</Badge> 학부모 수신동의가 없으면 발송할 수 없습니다.</p> : null}
          <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={st.consent1} onChange={(ev) => set({ consent1: ev.target.checked })} /> 수신 동의·알림톡 발송 가능 여부를 확인했습니다</label>
          <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={st.consent2} onChange={(ev) => set({ consent2: ev.target.checked })} /> 실제 발송에 동의합니다 (발송 전 사람 승인)</label>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => copyText(text)}>문구 복사</button>
            <button className="btn primary" disabled={!canSend} onClick={() => {
              store.upsert('messageLogs', { student_id: s.id, guardian_id: g.id, channel: '알림톡(수동 발송)', template: '학습 리포트', date: D.today(), status: '발송 기록' });
              copyText(text); toast('발송 기록을 남겼습니다 (실제 발송은 카카오 연동 후)');
            }}>발송 기록 남기기</button>
          </div>
        </div>
      </Card>
      <Card title="미리보기">
        <div><div className="bubble">{text}</div><p className="small muted">알림톡은 3줄 안내 + 버튼, 본문은 학생별 일회성 링크(만료·재발급)로 연결됩니다. 링크 서버는 클라우드 구축 후 연결합니다.</p></div>
      </Card>
    </div>
  );
}

function Logs() {
  const rows = store.list('messageLogs').sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Card title="메시지 로그">
      <Table rows={rows} empty="발송·복사 기록이 없습니다" cols={[
        { label: '일자', key: 'date' }, { label: '학생', render: (m) => { const s = store.get('students', m.student_id); return s ? s.name : '—'; } },
        { label: '채널', key: 'channel' }, { label: '템플릿', key: 'template' }, { label: '상태', render: (m) => <Badge tone="gray">{m.status}</Badge> },
      ]} />
    </Card>
  );
}

function Recipes() {
  const rows = [
    ['레벨테스트 예약 안내', '예약 즉시 / 1일 전 / 30분 전', 'F1', '알림톡'], ['상담 결과 리포트', '상담 직후 (D+0)', 'F3', '알림톡'],
    ['상담 후속 클로징', 'D+1 · D+2 · D+3', 'F3', '알림톡'], ['학부모 학습 리포트', '월 1회 (신규 학생은 4주차)', 'F4', '알림톡'],
    ['코칭 브리핑', '코칭 종료 후 학생별', '§9-3', '학원친구 (복사)'],
  ];
  return (
    <Card title="레시피 (트리거 → 조건 → 액션)" right={<Badge tone="gray">자동 실행은 A1·A2 단계에서</Badge>}>
      <Table rows={rows} cols={[{ label: '이름', render: (r) => r[0] }, { label: '트리거·시점', render: (r) => r[1] }, { label: '기능', render: (r) => r[2] }, { label: '채널', render: (r) => <Badge tone="gray">{r[3]}</Badge> }]} />
    </Card>
  );
}

export default function Send({ arg }) {
  const [st, set] = useViewState('send', { tab: 'report', sid: '', checks: {}, comment: '', consent1: false, consent2: false });
  const t = [{ id: 'report', label: '학부모 리포트' }, { id: 'recipes', label: '레시피' }, { id: 'logs', label: '메시지 로그' }];
  return (
    <div className="page">
      <PageHead title="발송 워크플로우" sub="학부모 소통은 이곳에서 처리합니다 (모든 발송은 사람 승인 후)" />
      <Tabs items={t} active={st.tab} onChange={(id) => set({ tab: id })} />
      {st.tab === 'report' ? <Report arg={arg} st={st} set={set} /> : st.tab === 'recipes' ? <Recipes /> : <Logs />}
    </div>
  );
}

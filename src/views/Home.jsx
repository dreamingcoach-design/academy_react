/* 홈 — 오늘 할 일 (core/09 §2): 승인 대기 초안, 오늘 리마인더, 이탈 신호 카드, 대목 모드 */
import { D, store } from '../lib/store.js';
import { dom } from '../lib/domain.js';
import { visits as V } from '../lib/visits.js';
import { Badge, Card, Empty, Kpi, PageHead } from '../ui.jsx';
import { HomeSection } from './Calendar.jsx';

const Link = ({ route, children }) => <a href={'#/' + route}>{children}</a>;

export default function Home() {
  const t = D.today();
  const students = dom.activeStudents();
  const st = { wait: 0, hw: 0, test: 0, done: 0 };
  students.forEach((s) => { st[dom.status(s, t)]++; });
  const leads = store.list('leads');
  const newLeads = leads.filter((l) => l.stage === '신규 문의');
  const notBriefed = students.filter((s) => { const e = dom.entryFor(s.id, t); return e && !e.briefed && dom.status(s, t) === 'done'; });
  const upcomingExams = store.list('examPeriods').map((e) => ({ e: e, dn: D.diff(e.date, t) })).filter((x) => x.dn >= 0 && x.dn <= 35).sort((a, b) => a.dn - b.dn);

  // 이탈 신호(임시 기준): 최근 7일 숙제 미이행 3건 이상. 위험도 산식은 미정(CORE-CHURN-02)이라 단순 규칙으로 표시
  const risk = students.map((s) => {
    let miss = 0;
    store.list('coachingEntries', (e) => e.student_id === s.id && e.date >= D.add(t, -7)).forEach((e) => {
      Object.keys(e.items).forEach((c) => { if (e.items[c].hw === 'x') miss++; });
    });
    return { s: s, miss: miss };
  }).filter((r) => r.miss >= 3);

  // 상담 후속 D+1/2/3 (F3)
  // 마지막으로 끝난 상담 기준, 다음 방문(2차)이 잡혀 있으면 제외
  const follow = leads.filter((l) => l.stage === '상담 완료' && V.lastConsult(l) && !V.next(l))
    .map((l) => ({ l: l, d: D.diff(t, D.dateOf(V.consultAt(l))) })).filter((x) => x.d >= 1 && x.d <= 3);
  const ready = upcomingExams.some((x) => x.dn <= 35);

  return (
    <div className="page">
      <PageHead title="오늘 할 일" sub={D.md(t) + ' 기준'}>{ready ? <Badge tone="warn">내신 대목 모드</Badge> : null}</PageHead>
      <HomeSection today={t} />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="코칭 완료" value={st.done + ' / ' + students.length} note="오늘 온 학생 기준" tone="ok" />
        <Kpi label="진행 중" value={st.hw + st.test} note="숙제 검사·테스트" />
        <Kpi label="신규 문의" value={newLeads.length + '건'} note="응대 필요" tone={newLeads.length ? 'warn' : ''} />
        <Kpi label="이탈 신호" value={risk.length + '명'} note="최근 7일 숙제 미이행 3건+" tone={risk.length ? 'bad' : ''} />
      </div>
      <div className="grid g2">
        <Card title="승인 대기 (브리핑 복사 전)">
          {notBriefed.length ? <ul className="list">{notBriefed.map((s) => <li key={s.id}>{s.name + ' · ' + s.className}<Link route="coaching">코칭실 일지에서 열기</Link></li>)}</ul> : <Empty>복사 대기 중인 브리핑이 없습니다</Empty>}
        </Card>
        <Card title="오늘 리마인더">
          <ul className="list">
            {newLeads.map((l) => <li key={l.id}><span><Badge>문의</Badge>{' ' + l.student + ' (' + l.grade + ')'}</span><Link route="consult">상담·등록</Link></li>)}
            {follow.map((x) => <li key={'f' + x.l.id}><span><Badge tone="warn">{'후속 D+' + x.d}</Badge>{' ' + x.l.student}</span><Link route="consult">상담·등록</Link></li>)}
            {!newLeads.length && !follow.length ? <li><span className="muted">오늘 처리할 상담 일정이 없습니다</span></li> : null}
          </ul>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="이탈 신호 카드 (임시 기준)" right={<Badge tone="gray">산식 미정(CORE-CHURN-02)</Badge>}>
          {risk.length ? <ul className="list">{risk.map((r) => <li key={r.s.id}><span>{r.s.name + ' · 7일간 숙제 미이행 ' + r.miss + '건'}</span><Link route={'students/' + r.s.id}>프로필</Link></li>)}</ul> : <Empty>이탈 신호가 있는 학생이 없습니다</Empty>}
        </Card>
        <Card title="시험 D-day">
          {upcomingExams.length ? <ul className="list">{upcomingExams.map((x) => <li key={x.e.id}><span>{x.e.school + ' ' + x.e.grade + ' · ' + x.e.name}</span><Badge tone={x.dn <= 35 ? 'warn' : 'gray'}>{'D-' + x.dn}</Badge></li>)}</ul> : <Empty>입력된 시험 일정이 없습니다 (내신 관리)</Empty>}
        </Card>
      </div>
    </div>
  );
}

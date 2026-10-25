/* 레이아웃·라우터: 좌측 메뉴(계층) + 우측 콘텐츠. 메뉴 구조는 core/09-system-structure.md §2 */
import { Component, useEffect, useState } from 'react';
import { store } from './lib/store.js';
import { useStore, useHash, parseRoute } from './lib/hooks.js';
import { Badge, Card, Empty, Modal, ModalHost, Toasts, openModal } from './ui.jsx';
import Home from './views/Home.jsx';
import Consult from './views/Consult.jsx';
import Students from './views/Students.jsx';
import Coaching from './views/Coaching.jsx';
import Grades from './views/Grades.jsx';
import Remedial from './views/Remedial.jsx';
import Exam from './views/Exam.jsx';
import Send from './views/Send.jsx';
import Calendar from './views/Calendar.jsx';
import Timetable from './views/Timetable.jsx';
import TeacherEval from './views/TeacherEval.jsx';
import { Settings, ItemMap, Types, Bank, DataAdmin } from './views/Settings.jsx';
import { Content, Terms, Billing } from './views/Misc.jsx';

// 메뉴 정의 — 메뉴를 바꿔도 데이터는 그대로다 (P11). state: 'ready' | 'part' | 'reserved'
const MENU = [
  { items: [{ id: 'home', label: '오늘 할 일', icon: '⌂' }] },
  { group: '상담', items: [{ id: 'consult', label: '상담·등록', icon: '✎' }] },
  { group: '수강생', items: [
    { id: 'students', label: '수강생 관리', icon: '▣' },
    { id: 'coaching', label: '출결·숙제', icon: '✓' },
    { id: 'grades', label: '게이트·성적', icon: '▤' },
    { id: 'remedial', label: '약점 보강', icon: '◈' },
  ] },
  { group: '내신', items: [{ id: 'exam', label: '내신 관리', icon: '◷' }] },
  { group: '소통', items: [{ id: 'send', label: '발송 워크플로우', icon: '➤' }] },
  { group: '마케팅', items: [{ id: 'content', label: '콘텐츠 워터풀', icon: '≋', state: 'part' }] },
  { group: '수업', items: [{ id: 'timetable', label: '학원 시간표', icon: '▦' }, { id: 'terms', label: '반·학기', icon: '▤', state: 'reserved', tag: '보류' }] },
  { group: '수강료', items: [{ id: 'billing', label: '수납·미납', icon: '₩', state: 'reserved', tag: '예약' }] },
  { group: '운영', items: [{ id: 'calendar', label: '학사 일정', icon: '◫' }, { id: 'teachereval', label: '강사 평가', icon: '★' }] },
  { group: '설정', items: [
    { id: 'settings', label: '규칙·훅·채널', icon: '⚙' },
    { id: 'itemmap', label: '문항 맵 관리', icon: '#', child: true },
    { id: 'types', label: '문제유형 마스터', icon: '◇', child: true },
    { id: 'bank', label: '문제은행·영상 관리', icon: '▶', child: true },
    { id: 'data', label: '데이터 관리', icon: '⛁', child: true },
  ] },
];

const VIEWS = {
  home: Home, consult: Consult, students: Students, coaching: Coaching, grades: Grades, remedial: Remedial,
  exam: Exam, send: Send, content: Content, timetable: Timetable, terms: Terms, billing: Billing,
  calendar: Calendar, teachereval: TeacherEval, settings: Settings, itemmap: ItemMap, types: Types, bank: Bank, data: DataAdmin,
};

// 화면을 그리다 오류가 나면 그 화면만 오류 카드로 바꾼다 (원본 render 의 try/catch)
class ViewBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(e) { console.error(e); }
  render() {
    if (this.state.error) {
      return <div className="page"><Card title="화면을 그리는 중 오류가 발생했습니다"><pre>{String((this.state.error && this.state.error.stack) || this.state.error)}</pre></Card></div>;
    }
    return this.props.children;
  }
}

function Sidebar({ active, open }) {
  return (
    <aside id="sidebar" className={open ? 'open' : ''}>
      <div className="brand"><div className="logo">S</div><div><strong>SNP영어학원</strong><small>Academy OS</small></div></div>
      <nav id="nav" aria-label="주 메뉴">
        {MENU.map((g, gi) => [
          g.group ? <div key={'g' + gi} className="nav-group">{g.group}</div> : null,
          g.items.map((it) => (
            <a key={it.id} href={'#/' + it.id} data-id={it.id}
              className={'nav-item' + (it.child ? ' child' : '') + (it.state === 'reserved' ? ' reserved' : '') + (active === it.id ? ' active' : '')}>
              <span className="nav-icon">{it.icon}</span><span className="nav-label">{it.label}</span>{it.tag ? <span className="nav-tag">{it.tag}</span> : null}
            </a>
          )),
        ])}
      </nav>
      <div className="side-foot">v0.1 · 로컬 저장(이 기기 브라우저)</div>
    </aside>
  );
}

function SearchResults({ q, close }) {
  useStore();
  const s = store.list('students', (x) => (x.name + x.school + x.className + (x.studentPhone || '')).includes(q));
  const g = store.list('guardians', (x) => (x.parentPhone || '').includes(q));
  const rows = s.map((x) => ({ t: '학생', label: x.name + ' · ' + x.grade + ' · ' + x.school, go: 'students/' + x.id }))
    .concat(g.map((x) => { const st = store.get('students', x.student_id); return { t: '학부모 번호', label: x.parentPhone + ' (' + (st ? st.name : '-') + ')', go: 'students/' + x.student_id }; }));
  return (
    <Modal title={'검색 결과: ' + q} onClose={close}>
      {rows.length ? <ul className="result-list">{rows.map((r, i) => (
        <li key={i}><a href={'#/' + r.go} onClick={close}><Badge tone="gray">{r.t}</Badge> {r.label}</a></li>
      ))}</ul> : <Empty>일치하는 학생이 없습니다</Empty>}
    </Modal>
  );
}

function search(q) {
  q = q.trim();
  if (!q) return;
  openModal((close) => <SearchResults q={q} close={close} />);
}

export default function App() {
  useStore();
  const hash = useHash();
  const { id, arg } = parseRoute(hash);
  const View = VIEWS[id] || VIEWS.home;
  const active = VIEWS[id] ? id : 'home';
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [hash]);

  return (
    <>
      <Sidebar active={active} open={open} />
      <div id="main">
        <header id="top">
          <button className="icon-btn menu-btn" aria-label="메뉴" onClick={() => setOpen(!open)}>☰</button>
          <div id="demo-banner">{store.isDemo() ? <span className="demo">데모 데이터 — 모두 가상 정보입니다 (설정 › 데이터 관리에서 비울 수 있음)</span> : null}</div>
          <div className="grow" />
          <input type="search" placeholder="학생·연락처·학교 검색" aria-label="통합 검색"
            onKeyDown={(e) => { if (e.key === 'Enter') { search(e.target.value); e.target.value = ''; } }} />
        </header>
        <main id="content">
          <ViewBoundary key={active}><View arg={arg} /></ViewBoundary>
        </main>
      </div>
      <ModalHost />
      <Toasts />
    </>
  );
}

/* 스모크 테스트: 데모 데이터로 모든 메뉴를 열고 주요 버튼을 눌러 화면 오류·콘솔 오류가 없는지 본다 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { store } from '../src/lib/store.js';
import { closeAllModals } from '../src/ui.jsx';
import App from '../src/App.jsx';

const ROUTES = ['home', 'consult', 'students', 'coaching', 'grades', 'remedial', 'exam', 'send', 'content', 'timetable', 'terms', 'billing',
  'calendar', 'teachereval', 'settings', 'itemmap', 'types', 'bank', 'data', 'students/stu-demo-1', 'exam/handout', 'send/stu-demo-2'];

let errors = [];
beforeAll(() => {
  localStorage.clear();
  store.load();
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  window.print = () => {};
  vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.map(String).join(' ')); });
});
afterEach(() => { act(() => closeAllModals()); cleanup(); });

function goto(route) {
  act(() => { window.location.hash = '#/' + route; window.dispatchEvent(new HashChangeEvent('hashchange')); });
}
function noViewError() {
  expect(document.body.textContent).not.toContain('화면을 그리는 중 오류가 발생했습니다');
  expect(errors).toEqual([]);
}
const click = (el) => act(() => { fireEvent.click(el); });
const btn = (name, root) => within(root || document.body).getAllByRole('button', { name })[0];
const modal = () => document.querySelector('.modal');

describe('모든 메뉴', () => {
  it.each(ROUTES)('%s 화면이 오류 없이 그려진다', (route) => {
    errors = [];
    render(<App />);
    goto(route);
    expect(document.querySelector('#content .page')).not.toBeNull();
    noViewError();
  });

  it('탭을 모두 돌아도 오류가 없다', () => {
    errors = [];
    render(<App />);
    ['consult', 'coaching', 'grades', 'remedial', 'exam', 'send', 'calendar', 'teachereval'].forEach((r) => {
      goto(r);
      const labels = Array.from(document.querySelectorAll('.tab')).map((t) => t.textContent);
      labels.forEach((l) => { click(screen.getByRole('tab', { name: l })); noViewError(); });
      click(document.querySelector('.tab'));
    });
  });
});

describe('상담·등록', () => {
  it('문의 카드 열기·연락 창·문의 추가', () => {
    errors = [];
    render(<App />);
    goto('consult');
    click(screen.getByRole('tab', { name: '문의 보드' }));
    click(screen.getByText('송○○'));
    expect(modal().textContent).toContain('방문 일정');
    click(btn('+ 방문 추가 (2차 상담 · 레벨테스트)', modal()));
    expect(modal().querySelectorAll('.visit-row').length).toBe(2);
    click(btn('취소', modal()));
    click(document.querySelector('.lead .lead-contact .btn'));
    expect(modal().textContent).toContain('카카오톡 미리보기');
    click(btn('닫기', modal()));
    click(btn('+ 문의 추가'));
    act(() => { fireEvent.change(modal().querySelector('input[placeholder="예) 한○○"]'), { target: { value: '테스트○○' } }); });
    click(btn('저장', modal()));
    expect(store.list('leads').some((l) => l.student === '테스트○○')).toBe(true);
    noViewError();
  });

  it('채점 입력과 결과 리포트', () => {
    errors = [];
    render(<App />);
    goto('consult');
    click(screen.getByRole('tab', { name: '레벨테스트' }));
    click(btn('채점 수정'));
    expect(modal().textContent).toContain('예상 총점');
    click(modal().querySelector('.lt-no:not(.wrong)'));
    click(btn('저장', modal()));
    click(screen.getByRole('tab', { name: '상담 코파일럿' }));
    click(btn('리포트 보기'));
    expect(document.body.textContent).toContain('① 한눈에 보기');
    expect(document.body.textContent).toContain('⑤ 영역·단원별 틀린 문항');
    click(btn('‹ 목록'));
    noViewError();
  });

  it('등록 처리로 수강생이 생긴다', () => {
    errors = [];
    render(<App />);
    goto('consult');
    click(screen.getByRole('tab', { name: '결과·후속' }));
    const before = store.list('students').length;
    click(btn('등록 처리'));
    expect(store.list('students').length).toBe(before + 1);
    noViewError();
  });
});

describe('수강생·코칭', () => {
  it('프로필에서 레벨테스트 리포트 열기', () => {
    errors = [];
    const l = store.get('leads', 'lea-demo-7');
    store.upsert('leads', { id: l.id, student_id: 'stu-demo-1' });
    render(<App />);
    goto('students/stu-demo-1');
    click(btn('레벨테스트 결과 레포트'));
    expect(document.body.textContent).toContain('레벨테스트 결과 리포트 · 한○○');
    click(btn('‹ 목록'));
    expect(document.body.textContent).toContain('김하준 학생 프로필');
    noViewError();
  });

  it('코칭실 일지 칸 입력·브리핑', () => {
    errors = [];
    render(<App />);
    goto('coaching');
    click(screen.getByRole('tab', { name: '코칭실 일지' }));
    click(document.querySelector('.scard'));
    const ox = document.querySelectorAll('.ox button');
    click(ox[0]);
    click(ox[ox.length - 1]);
    click(btn('브리핑 만들기'));
    expect(modal().textContent).toContain('[SNP영어학원]');
    click(btn('닫기', modal()));
    click(btn('틀린 문항 입력'));
    click(modal().querySelector('.numgrid button'));
    expect(modal().querySelector('.numgrid button.on')).not.toBeNull();
    noViewError();
  });
});

describe('홈 할 일 목록', () => {
  it('체크하면 완료 묶음으로 옮겨지고, 담당자 필터가 목록을 줄인다', () => {
    errors = [];
    render(<App />);
    goto('home');
    const card = document.querySelector('.task-card');
    const before = card.querySelectorAll('.task:not(.done)').length;
    click(card.querySelector('.task:not(.done) input[type=checkbox]'));
    expect(card.querySelectorAll('.task:not(.done)').length).toBe(before - 1);
    click(within(card).getByRole('button', { name: /완료 \d+개 보기/ }));
    expect(card.querySelector('.task.done')).not.toBeNull();
    const all = document.querySelectorAll('.task').length;
    click(within(document.querySelector('.task-filter')).getByRole('button', { name: '강사' }));
    const owners = Array.from(document.querySelectorAll('.task-owner')).map((x) => x.textContent);
    expect(owners.length).toBeLessThan(all);
    expect(owners.every((o) => o === '강사')).toBe(true);
    click(within(document.querySelector('.task-filter')).getByRole('button', { name: '전체' }));
    noViewError();
  });
});

describe('기타', () => {
  it('강사 평가 설문 원본 열기·시간표 칸 수정·검색', () => {
    errors = [];
    render(<App />);
    goto('teachereval');
    click(screen.getByRole('tab', { name: '결과' }));
    click(document.querySelector('.list li[title]'));
    expect(modal().textContent).toContain('같은 반 평균');
    click(btn('닫기', modal()));
    goto('timetable');
    click(screen.getAllByTitle('눌러서 수정')[0]);
    expect(modal().textContent).toContain('수강 학생');
    click(btn('취소', modal()));
    const search = screen.getByLabelText('통합 검색');
    act(() => { fireEvent.keyDown(search, { key: 'Enter', target: { value: '김하준' } }); });
    noViewError();
  });

  it('홈 업무 바로가기로 내신 관리 탭이 열린다', () => {
    errors = [];
    render(<App />);
    goto('exam/handout');
    expect(screen.getByRole('tab', { name: '유인물·외부지문' }).className).toContain('active');
    click(screen.getByRole('tab', { name: '시험 기간' }));
    expect(screen.getByRole('tab', { name: '시험 기간' }).className).toContain('active');
    noViewError();
  });
});

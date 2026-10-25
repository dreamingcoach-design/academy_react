/* 콘텐츠 워터풀 / 반·학기 / 수납·미납 — 단계가 아직 뒤인 메뉴 */
import { Badge, Card, PageHead, Placeholder } from '../ui.jsx';

export function Content() {
  const steps = [['1', '인블로그 원본 발행', '블로그 멀티 에이전트 파이프라인(별도 시스템)에서 작성·발행'], ['2', '미러링', '네이버 블로그 등으로 재게시'], ['3', '카드뉴스·숏폼', '카드뉴스 스킬(blog-to-cardnews)로 제작'], ['4', '키워드·유입 분석', '서치콘솔·유입 채널을 문의(Lead.유입 채널)와 연결']];
  return (
    <div className="page">
      <PageHead title="콘텐츠 워터풀" sub="인블로그 원본 → 미러링·카드뉴스·숏폼 (F9). 블로그 업무는 별도 시스템으로 구축 중입니다" />
      <Card title="워터풀 단계">
        <ol className="list">{steps.map((s) => <li key={s[0]}><span><b>{s[0] + '. ' + s[1]}</b><span className="muted">{' — ' + s[2]}</span></span><Badge tone="gray">연결 예정</Badge></li>)}</ol>
      </Card>
      <Card title="이 시스템과의 연결점">
        <ul><li>문의 보드의 유입 채널 집계 (상담·등록에 입력된 채널을 기준으로 콘텐츠 효과 확인)</li><li>콘텐츠 기록 엔티티는 L1에 후보(➕)로만 등록되어 있어 데이터 구조 확정 후 추가</li></ul>
      </Card>
    </div>
  );
}

export function Terms() {
  return <Placeholder title="반·학기" sub="반·강사·시간표 (M7)" status="보류" lines={['SNP용 M7 규칙은 새로 수집해야 합니다 (기존 자료는 다른 학원 기준)', '반 개설·강사 구성 규칙 확정 후 구현']} />;
}

export function Billing() {
  return <Placeholder title="수납·미납" sub="청구·납부·연체 (X1)" status="예약" lines={['수납·환불 정책 확정이 선결 조건입니다', '아카2000에 있는 데이터는 당분간 옮기지 않습니다 (이행 전략 §5)']} />;
}

/* 채널 어댑터: SOLAPI 알림톡 (08 채널 어댑터 원칙 — 대행사를 바꾸면 이 파일만 바꾼다).
 * 알림톡이 실패하면 SOLAPI가 같은 내용을 문자로 대체 발송한다 (disableSms: false, 발신번호 필요). */
function create(env) {
  const { SolapiMessageService } = require('solapi'); // 실제 발송 모드에서만 불러온다
  const svc = new SolapiMessageService(env.SOLAPI_API_KEY, env.SOLAPI_API_SECRET);

  // → { status: 'accepted' | 'failed', reason, providerMessageId, providerGroupId }
  async function sendAlimtalk({ to, templateId, variables }) {
    try {
      const res = await svc.send({
        to: to,
        from: env.SENDER_PHONE,
        kakaoOptions: { pfId: env.SOLAPI_PFID, templateId: templateId, variables: variables, disableSms: false },
      }, { showMessageList: true }); // 메시지 ID를 받아야 웹훅 결과를 이 기록에 붙일 수 있다
      const failed = (res.failedMessageList || [])[0];
      if (failed) return { status: 'failed', reason: failed.statusMessage || failed.statusCode, providerMessageId: failed.messageId || null };
      const msg = (res.messageList || [])[0] || {};
      return { status: 'accepted', providerMessageId: msg.messageId || null, providerGroupId: (res.groupInfo && res.groupInfo.groupId) || null };
    } catch (e) {
      const first = e.failedMessageList && e.failedMessageList[0];
      return { status: 'failed', reason: first ? first.statusMessage : e.message };
    }
  }

  // 웹훅 한 건 → { messageId, status, channel, reason } (SOLAPI 상태코드 4000 = 수신 완료)
  function parseReport(item) {
    const code = String(item.statusCode || '');
    const type = String(item.type || '').toUpperCase(); // ATA = 알림톡, LMS/SMS = 대체 문자
    const isSms = type === 'LMS' || type === 'SMS';
    if (code === '4000') return { messageId: item.messageId, status: isSms ? 'fallback' : 'delivered', channel: isSms ? 'lms' : 'alimtalk', reason: null };
    if (code === '2000' || code === '3000') return null; // 접수·처리 중: 상태를 바꾸지 않는다
    return { messageId: item.messageId, status: 'failed', channel: isSms ? 'lms' : null, reason: item.statusMessage || code };
  }

  return { sendAlimtalk, parseReport };
}

module.exports = { create };

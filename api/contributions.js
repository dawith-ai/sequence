import { body, json, methodNotAllowed, safeInt, safeText } from '../lib/http.js'
import { dbReady, getRoom, insertContribution, insertMessage } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  if (!dbReady()) return json(res, 503, { ok:false, error:'Supabase가 아직 연결되지 않았어요.', code:'SUPABASE_NOT_CONFIGURED' })
  try {
    const input = await body(req)
    const roomId = safeText(input.room_id, 100)
    const amount = safeInt(input.amount, 1000, 5000000)
    const nickname = safeText(input.nickname, 40) || '친구'
    if (!roomId || !amount) return json(res, 400, { ok:false, error:'room_id와 참여 금액이 필요해요.' })
    const before = await getRoom(roomId)
    if (!before) return json(res, 404, { ok:false, error:'위시룸을 찾지 못했어요.' })
    const allowed = Math.min(amount, Math.max(0, before.shortfall))
    if (allowed <= 0) return json(res, 409, { ok:false, error:'이미 선물이 완성되었어요.', room:before })
    await insertContribution({ room_id:roomId, nickname, amount:allowed })
    const message = safeText(input.message, 500)
    if (message) await insertMessage({ room_id:roomId, nickname, text:message, kind:'cheer' })
    const room = await getRoom(roomId)
    return json(res, 201, { ok:true, contribution:{ nickname, amount:allowed }, room })
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || '참여 처리에 실패했어요.' })
  }
}

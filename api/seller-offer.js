import { body, json, methodNotAllowed, safeInt, safeText } from '../lib/http.js'
import { dbReady, getRoom, updateRoom } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  if (!dbReady()) return json(res, 503, { ok:false, error:'Supabase가 아직 연결되지 않았어요.', code:'SUPABASE_NOT_CONFIGURED' })
  try {
    const input = await body(req)
    const roomId = safeText(input.room_id, 100)
    const subsidy = safeInt(input.subsidy, 0, 10000000)
    const label = safeText(input.label, 120) || '브랜드가 마지막 조각을 보탭니다.'
    const room = await getRoom(roomId)
    if (!room) return json(res, 404, { ok:false, error:'위시룸을 찾지 못했어요.' })
    const capped = Math.min(subsidy, Math.max(0, room.shortfall))
    await updateRoom(roomId, { seller_subsidy:capped, seller_offer_label:label })
    return json(res, 200, { ok:true, room:await getRoom(roomId) })
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || '판매자 제안 저장에 실패했어요.' })
  }
}

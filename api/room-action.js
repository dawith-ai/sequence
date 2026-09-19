import { body, json, methodNotAllowed, safeInt, safeText } from '../lib/http.js'
import { dbReady, getRoom, updateRoom } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  if (!dbReady()) return json(res, 503, { ok:false, error:'Supabase가 아직 연결되지 않았어요.', code:'SUPABASE_NOT_CONFIGURED' })
  try {
    const input = await body(req)
    const roomId = safeText(input.room_id, 100)
    const action = safeText(input.action, 40)
    const room = await getRoom(roomId)
    if (!room) return json(res, 404, { ok:false, error:'위시룸을 찾지 못했어요.' })
    if (action === 'apply_price') {
      const price = safeInt(input.price, 1, room.list_price || 100000000)
      if (!price) return json(res, 400, { ok:false, error:'적용할 가격이 필요해요.' })
      await updateRoom(roomId, { current_price:price })
    } else if (action === 'complete') {
      await updateRoom(roomId, { status:'completed' })
    } else {
      return json(res, 400, { ok:false, error:'지원하지 않는 action이에요.' })
    }
    return json(res, 200, { ok:true, room:await getRoom(roomId) })
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || '위시룸 업데이트에 실패했어요.' })
  }
}

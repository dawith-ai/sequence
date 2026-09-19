import { body, json, methodNotAllowed, safeText } from '../lib/http.js'
import { dbReady, getRoom, insertMessage } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  if (!dbReady()) return json(res, 503, { ok:false, error:'Supabase가 아직 연결되지 않았어요.', code:'SUPABASE_NOT_CONFIGURED' })
  try {
    const input = await body(req)
    const roomId = safeText(input.room_id, 100)
    const text = safeText(input.text, 500)
    const nickname = safeText(input.nickname, 40) || '친구'
    if (!roomId || !text) return json(res, 400, { ok:false, error:'메시지를 입력해주세요.' })
    const exists = await getRoom(roomId)
    if (!exists) return json(res, 404, { ok:false, error:'위시룸을 찾지 못했어요.' })
    await insertMessage({ room_id:roomId, nickname, text, kind:'cheer' })
    const room = await getRoom(roomId)
    return json(res, 201, { ok:true, room })
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || '메시지 저장에 실패했어요.' })
  }
}

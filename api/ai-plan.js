import { json, methodNotAllowed, safeText } from '../lib/http.js'
import { dbReady, getRoom } from '../lib/db.js'
import { analyzeProduct, buildCompletionPlan } from '../lib/product.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  if (!dbReady()) return json(res, 503, { ok:false, error:'Supabase가 아직 연결되지 않았어요.', code:'SUPABASE_NOT_CONFIGURED' })
  try {
    const roomId = safeText(req.query?.room_id, 100)
    const room = await getRoom(roomId)
    if (!room) return json(res, 404, { ok:false, error:'위시룸을 찾지 못했어요.' })
    let refreshed = null
    if (room.product?.url) {
      try { refreshed = await analyzeProduct(room.product.url) } catch {}
    }
    const plan = await buildCompletionPlan(room, refreshed)
    return json(res, 200, { ok:true, plan, refreshed_product:refreshed })
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || 'AI 완성 제안을 만들지 못했어요.' })
  }
}

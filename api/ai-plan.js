import { body, json, methodNotAllowed } from '../lib/http.js'
import { analyzeProduct, buildCompletionPlan } from '../lib/product.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const input = await body(req)
    const room = input?.room && typeof input.room === 'object' ? input.room : null
    if (!room?.product || !Number(room.current_price || room.list_price || room.product?.price)) {
      return json(res, 400, { ok:false, error:'현재 위시룸 정보가 필요해요.' })
    }
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

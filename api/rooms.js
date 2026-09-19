import { body, json, methodNotAllowed, safeInt, safeText } from '../lib/http.js'
import { createRoom, dbReady, getRoom } from '../lib/db.js'

export default async function handler(req, res) {
  if (!dbReady()) return json(res, 503, { ok:false, error:'Supabase가 아직 연결되지 않았어요.', code:'SUPABASE_NOT_CONFIGURED' })
  try {
    if (req.method === 'GET') {
      const id = safeText(req.query?.id, 100)
      if (!id) return json(res, 400, { ok:false, error:'room id가 필요해요.' })
      const room = await getRoom(id)
      if (!room) return json(res, 404, { ok:false, error:'위시룸을 찾지 못했어요.' })
      return json(res, 200, { ok:true, room })
    }
    if (req.method === 'POST') {
      const input = await body(req)
      const product = input.product && typeof input.product === 'object' ? input.product : null
      const price = safeInt(product?.price || input.list_price, 0, 100000000)
      if (!product?.name || !price) return json(res, 400, { ok:false, error:'상품명과 가격이 필요해요.' })
      const selfAmount = safeInt(input.self_amount, 0, price)
      const deadline = safeText(input.deadline, 40) || null
      const payload = {
        title: safeText(input.title, 120) || '친구의 생일 위시',
        occasion: safeText(input.occasion, 40) || 'birthday',
        product: { ...product, price },
        self_amount: selfAmount,
        list_price: price,
        current_price: price,
        seller_subsidy: 0,
        seller_offer_label: null,
        deadline,
        creator_message: safeText(input.creator_message, 500) || '함께하는 마음이 더 특별한 선물을 만들어요.',
        status: 'active'
      }
      const created = await createRoom(payload)
      const room = await getRoom(created.id)
      return json(res, 201, { ok:true, room })
    }
    return methodNotAllowed(res, ['GET','POST'])
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || '위시룸 처리에 실패했어요.' })
  }
}

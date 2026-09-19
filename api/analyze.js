import { body, json, methodNotAllowed, safeText } from '../lib/http.js'
import { analyzeProduct } from '../lib/product.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const input = await body(req)
    const url = safeText(input.url, 2000)
    if (!url) return json(res, 400, { ok:false, error:'상품 URL을 입력해주세요.' })
    const product = await analyzeProduct(url)
    if (!product.price) return json(res, 422, { ok:false, error:'상품 가격을 확인하지 못했어요. 다른 상품 링크를 시도해주세요.', product })
    return json(res, 200, { ok:true, product, mode: product.ai_used ? 'ai' : 'metadata' })
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.message || '상품 분석에 실패했어요.' })
  }
}

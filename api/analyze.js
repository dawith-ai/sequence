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
    const message = String(error?.message || '')
    if (/상품 페이지를 읽지 못했어요|fetch failed|timeout|abort/i.test(message)) {
      return json(res, 422, { ok:false, error:'상품 페이지를 읽지 못했어요. 다른 상품 링크를 시도해주세요.', code:'PRODUCT_FETCH_FAILED' })
    }
    if (/HTTP\(S\)|내부 주소|Invalid URL|URL/i.test(message)) {
      return json(res, 400, { ok:false, error:'분석할 수 있는 상품 URL을 입력해주세요.', code:'INVALID_PRODUCT_URL' })
    }
    return json(res, 500, { ok:false, error:'상품 분석 중 서버 오류가 발생했어요.', code:'PRODUCT_ANALYZE_FAILED' })
  }
}

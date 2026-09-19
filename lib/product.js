function unescapeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function meta(html, key, attr = 'property') {
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i')
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return unescapeHtml(match[1])
  }
  return ''
}

function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim())
      const items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] || [parsed]
      const queue = Array.isArray(items) ? [...items] : [items]
      while (queue.length) {
        const item = queue.shift()
        if (!item || typeof item !== 'object') continue
        if (Array.isArray(item)) { queue.push(...item); continue }
        const type = String(item['@type'] || '').toLowerCase()
        if (type.includes('product')) return item
        for (const value of Object.values(item)) if (value && typeof value === 'object') queue.push(value)
      }
    } catch {}
  }
  return null
}

function parsePrice(value) {
  if (value == null) return 0
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function hostSource(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('apple')) return 'Apple 공식 홈페이지'
    if (host.includes('coupang')) return '쿠팡'
    if (host.includes('musinsa')) return '무신사'
    if (host.includes('naver')) return '네이버'
    if (host.includes('kakao')) return '카카오'
    return host
  } catch { return '온라인 쇼핑몰' }
}

function isPrivateHost(hostname) {
  return /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
}

export function validateProductUrl(raw) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP(S) URL만 사용할 수 있어요.')
  if (isPrivateHost(url.hostname)) throw new Error('내부 주소는 분석할 수 없어요.')
  return url.toString()
}

export async function fetchProductMetadata(rawUrl) {
  const url = validateProductUrl(rawUrl)
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; OnePiceBot/1.0; +https://onepice.app)',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error(`상품 페이지를 읽지 못했어요 (${response.status})`)
  const html = (await response.text()).slice(0, 2_000_000)
  const jsonLd = parseJsonLd(html)
  const offers = jsonLd?.offers
  const offer = Array.isArray(offers) ? offers[0] : offers
  const brand = typeof jsonLd?.brand === 'string' ? jsonLd.brand : jsonLd?.brand?.name
  const image = Array.isArray(jsonLd?.image) ? jsonLd.image[0] : (typeof jsonLd?.image === 'object' ? jsonLd.image?.url : jsonLd?.image)
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
  return {
    url,
    source: hostSource(url),
    title: jsonLd?.name || meta(html, 'og:title') || unescapeHtml(titleTag),
    brand: brand || meta(html, 'product:brand') || '',
    description: jsonLd?.description || meta(html, 'og:description') || meta(html, 'description', 'name') || '',
    image: image || meta(html, 'og:image') || '',
    price: parsePrice(offer?.price || offer?.lowPrice || meta(html, 'product:price:amount')),
    currency: offer?.priceCurrency || meta(html, 'product:price:currency') || 'KRW'
  }
}

async function geminiJSON(prompt) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) return null
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    }),
    signal: AbortSignal.timeout(20000)
  })
  if (!response.ok) throw new Error(`Gemini API 오류 (${response.status})`)
  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || ''
  return JSON.parse(text)
}

export async function analyzeProduct(url) {
  const metadata = await fetchProductMetadata(url)
  const prompt = `당신은 한국 커머스 상품 정보를 정리하는 AI입니다. 아래 메타데이터를 바탕으로 JSON만 반환하세요. 추측으로 가격을 만들지 마세요.\n\n메타데이터:\n${JSON.stringify(metadata, null, 2)}\n\n형식:\n{\n  "name": "상품명",\n  "brand": "브랜드",\n  "price": 0,\n  "description": "한 문장 설명",\n  "tags": ["태그1", "태그2", "태그3", "태그4"],\n  "ai_tip": "선물 맥락의 짧은 한 문장",\n  "category": "카테고리"\n}\n\n규칙: price는 메타데이터에서 확인된 가격만 숫자로 쓰고 확인되지 않으면 0. name/brand/description도 메타데이터 범위에서 정리.`
  let ai = null
  try { ai = await geminiJSON(prompt) } catch {}
  const name = ai?.name || metadata.title || '상품'
  const brand = ai?.brand || metadata.brand || metadata.source
  const price = Number(ai?.price || 0) || metadata.price || 0
  return {
    name: String(name).slice(0, 120),
    brand: String(brand || '').slice(0, 80),
    price,
    list_price: price,
    description: String(ai?.description || metadata.description || '함께 완성하는 특별한 선물').slice(0, 220),
    image: metadata.image,
    url: metadata.url,
    source: metadata.source,
    tags: Array.isArray(ai?.tags) ? ai.tags.slice(0, 6).map(String) : [],
    ai_tip: String(ai?.ai_tip || '작은 마음을 모아 정말 원하는 하나를 완성해보세요.').slice(0, 140),
    category: String(ai?.category || '선물').slice(0, 60),
    ai_used: Boolean(ai)
  }
}

export async function buildCompletionPlan(room, refreshedProduct = null) {
  const oldPrice = Number(room.list_price || room.product?.price || 0)
  const currentPrice = Number(room.current_price || oldPrice)
  const refreshedPrice = Number(refreshedProduct?.price || 0)
  const recommendedPrice = refreshedPrice > 0 && refreshedPrice < currentPrice ? refreshedPrice : currentPrice
  const secured = Number(room.secured_amount || 0)
  const sellerSubsidy = Number(room.seller_subsidy || 0)
  const shortfallBefore = Math.max(0, currentPrice - secured)
  const shortfallAfter = Math.max(0, recommendedPrice - secured)
  const base = {
    old_price: oldPrice,
    current_price: currentPrice,
    recommended_price: recommendedPrice,
    discount_found: recommendedPrice < currentPrice,
    saving: Math.max(0, currentPrice - recommendedPrice),
    secured_amount: secured,
    shortfall_before: shortfallBefore,
    shortfall_after: shortfallAfter,
    seller_subsidy: sellerSubsidy,
    recommended_action: shortfallAfter <= 0 ? 'complete' : (sellerSubsidy > 0 ? 'apply_seller_offer' : 'invite_or_fill_gap')
  }
  const prompt = `당신은 공동선물 서비스 One pice의 AI 완성 도우미입니다. 다음 수치를 바꾸지 말고, 사용자가 선물을 실제로 완성하도록 한국어 JSON 제안을 만드세요.\n${JSON.stringify(base)}\n반환 형식: {"headline":"짧은 제목","reason":"2문장 이내 설명","options":[{"title":"옵션","detail":"설명"}]}\n가격이나 금액을 임의로 추가하지 마세요.`
  try {
    const ai = await geminiJSON(prompt)
    return { ...base, ai_copy: ai, ai_used: true }
  } catch {
    return { ...base, ai_copy: null, ai_used: false }
  }
}

import { json } from '../lib/http.js'
import { dbReady } from '../lib/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok:false, error:'Method not allowed' })
  json(res, 200, {
    ok: true,
    features: {
      sharedRooms: dbReady(),
      ai: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
      kakao: Boolean(process.env.KAKAO_JS_KEY)
    },
    kakaoJsKey: process.env.KAKAO_JS_KEY || ''
  })
}

import { json } from '../lib/http.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok:false, error:'Method not allowed' })
  json(res, 200, {
    ok: true,
    features: {
      sharedRooms: true,
      ai: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
      kakao: Boolean(process.env.KAKAO_JS_KEY)
    },
    database: 'firebase-firestore',
    kakaoJsKey: process.env.KAKAO_JS_KEY || ''
  })
}

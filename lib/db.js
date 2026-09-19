const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''

export function dbReady() {
  return Boolean(base() && key())
}

async function request(path, init = {}) {
  if (!dbReady()) throw new Error('SUPABASE_NOT_CONFIGURED')
  const headers = {
    apikey: key(),
    Authorization: `Bearer ${key()}`,
    'Content-Type': 'application/json',
    ...(init.headers || {})
  }
  const response = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers })
  const text = await response.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data?.message ? data.message : String(data || response.statusText)
    throw new Error(`SUPABASE_${response.status}: ${message}`)
  }
  return data
}

export async function createRoom(payload) {
  const data = await request('rooms', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  })
  return data?.[0] || null
}

export async function updateRoom(id, patch) {
  const data = await request(`rooms?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  })
  return data?.[0] || null
}

export async function getRoomBase(id) {
  const data = await request(`rooms?id=eq.${encodeURIComponent(id)}&select=*`)
  return data?.[0] || null
}

export async function getContributions(roomId) {
  return await request(`contributions?room_id=eq.${encodeURIComponent(roomId)}&select=*&order=created_at.asc`)
}

export async function getMessages(roomId) {
  return await request(`messages?room_id=eq.${encodeURIComponent(roomId)}&select=*&order=created_at.desc&limit=50`)
}

export async function insertContribution(payload) {
  const data = await request('contributions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  })
  return data?.[0] || null
}

export async function insertMessage(payload) {
  const data = await request('messages', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  })
  return data?.[0] || null
}

export async function getRoom(id) {
  const room = await getRoomBase(id)
  if (!room) return null
  const [contributions, messages] = await Promise.all([
    getContributions(id),
    getMessages(id)
  ])
  return enrichRoom({ ...room, contributions: contributions || [], messages: messages || [] })
}

export function enrichRoom(room) {
  const friendAmount = (room.contributions || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const selfAmount = Number(room.self_amount || 0)
  const sellerSubsidy = Number(room.seller_subsidy || 0)
  const currentPrice = Number(room.current_price || room.list_price || room.product?.price || 0)
  const secured = selfAmount + friendAmount + sellerSubsidy
  const shortfall = Math.max(0, currentPrice - secured)
  const progress = currentPrice > 0 ? Math.min(100, Math.round((secured / currentPrice) * 100)) : 0
  return {
    ...room,
    friend_amount: friendAmount,
    secured_amount: secured,
    shortfall,
    progress,
    participant_count: (room.contributions || []).length,
    completed: shortfall <= 0
  }
}

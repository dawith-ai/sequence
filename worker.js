function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' }
}
function json(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(), ...extra } }) }
async function readRecord(env, code) {
  const row = await env.SEQUENCE_ARENA.prepare('SELECT room, version, updated_at FROM rooms WHERE code = ?').bind(String(code).toUpperCase()).first()
  return row ? { room: JSON.parse(row.room), version: row.version, updatedAt: row.updated_at } : null
}
async function listWaitingRooms(env, url) {
  const result = await env.SEQUENCE_ARENA.prepare('SELECT room FROM rooms ORDER BY updated_at DESC LIMIT 50').all()
  const rooms = []
  for (const row of result.results || []) {
    const room = JSON.parse(row.room)
    if (url.searchParams.get('visibility') && room.visibility !== url.searchParams.get('visibility')) continue
    if (url.searchParams.get('status') && room.status !== url.searchParams.get('status')) continue
    rooms.push(room)
  }
  return rooms
}
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'api' || parts[1] !== 'sequence') return json({ ok: false, error: 'Not found' }, 404)
    if (parts[2] !== 'rooms') return json({ ok: false, error: 'Not found' }, 404)
    if (!parts[3] && request.method === 'GET') return json({ rooms: await listWaitingRooms(env, url) })
    const code = parts[3]
    if (!code) return json({ ok: false, error: 'Room code required' }, 400)
    if (request.method === 'GET') {
      const record = await readRecord(env, code)
      // A newly-created D1 row can take a moment to appear at another edge.
      // Return an empty document so normal polling does not produce noisy 404s.
      return record ? json(record) : json({ room: null, version: null, updatedAt: null })
    }
    if (request.method === 'DELETE') {
      await env.SEQUENCE_ARENA.prepare('DELETE FROM rooms WHERE code = ?').bind(code.toUpperCase()).run()
      return json({ ok: true })
    }
    if (request.method !== 'PUT') return json({ ok: false, error: 'Method not allowed' }, 405)
    const body = await request.json()
    if (!body?.room) return json({ ok: false, error: 'Room payload required' }, 400)
    const existing = await readRecord(env, code)
    const expectedVersion = body.expectedVersion ?? null
    if ((existing && expectedVersion === null) || (existing && expectedVersion !== existing.version) || (!existing && expectedVersion !== null)) return json({ ok: false, error: 'Room changed', code: 'conflict', version: existing?.version ?? null }, 409)
    const record = { room: body.room, version: (existing?.version || 0) + 1, updatedAt: Date.now() }
    if (!existing) {
      try { await env.SEQUENCE_ARENA.prepare('INSERT INTO rooms (code, room, version, updated_at) VALUES (?, ?, 1, ?)').bind(code.toUpperCase(), JSON.stringify(body.room), record.updatedAt).run() } catch { return json({ ok: false, error: 'Room changed', code: 'conflict', version: 1 }, 409) }
    } else {
      const result = await env.SEQUENCE_ARENA.prepare('UPDATE rooms SET room = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?').bind(JSON.stringify(body.room), record.updatedAt, code.toUpperCase(), existing.version).run()
      if (!result.meta?.changes) return json({ ok: false, error: 'Room changed', code: 'conflict', version: (await readRecord(env, code))?.version ?? null }, 409)
    }
    return json(record)
  }
}

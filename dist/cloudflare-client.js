(() => {
  const apiBase = 'https://sequence-arena.myjun090.workers.dev/api/sequence'
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  async function request(path, options = {}, attempt = 0) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    })
    if ((response.status === 429 || response.status >= 500) && attempt < 3) { await sleep(400 * (attempt + 1)); return request(path, options, attempt + 1) }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) { const error = new Error(body.error || `Sequence API ${response.status}`); error.code = body.code || `http-${response.status}`; error.version = body.version; throw error }
    return body
  }
  function snapshot(code, record) { return { id: code, exists: Boolean(record?.room), version: record?.version ?? null, data: () => record?.room || null } }
  function documentRef(code) {
    return {
      code,
      async get() {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try { const record = await request(`/rooms/${encodeURIComponent(code)}`); return snapshot(code, record) } catch (error) {
            if (error.code !== 'http-404') throw error
            if (attempt < 3) await sleep(350 * (attempt + 1)); else return snapshot(code, null)
          }
        }
      },
      async set(room) { const current = await this.get(); return request(`/rooms/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify({ room, expectedVersion: current.exists ? current.version : null }) }) },
      onSnapshot(callback, onError) {
        let active = true; let last = ''
        const poll = async () => {
          if (!active) return
          try { const record = await request(`/rooms/${encodeURIComponent(code)}`); const next = JSON.stringify(record.room); if (next !== last) { last = next; callback(snapshot(code, record)) } } catch (error) { if (error.code !== 'http-404') onError?.(error) }
          if (active) setTimeout(poll, 400)
        }
        poll(); return () => { active = false }
      }
    }
  }
  function collectionRef(filters = [], max = 50) {
    return {
      doc: documentRef,
      where(field, operator, value) { return collectionRef([...filters, [field, operator, value]], max) },
      limit(value) { return collectionRef(filters, value) },
      onSnapshot(callback, onError) {
        let active = true; let last = ''
        const poll = async () => {
          if (!active) return
          try {
            const params = new URLSearchParams()
            for (const [field, operator, value] of filters) if (operator === '==') params.set(field, value)
            params.set('limit', max)
            const body = await request(`/rooms?${params}`); const rooms = body.rooms || []; const next = JSON.stringify(rooms)
            if (next !== last) { last = next; callback({ docs: rooms.map(room => snapshot(room.code, { room })) }) }
          } catch (error) { onError?.(error) }
          if (active) setTimeout(poll, 1000)
        }
        poll(); return () => { active = false }
      }
    }
  }
  const api = {
    collection(name) { if (name !== 'sequenceRooms') throw new Error(`Unsupported collection: ${name}`); return collectionRef() },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        let ref = null; let current = null; let operation = null
        const transaction = {
          async get(document) { ref = document; current = await request(`/rooms/${encodeURIComponent(document.code)}`).catch(error => error.code === 'http-404' ? null : Promise.reject(error)); return snapshot(document.code, current) },
          set(document, room) { ref = document; operation = { type: 'set', room } },
          delete(document) { ref = document; operation = { type: 'delete' } }
        }
        const result = await callback(transaction)
        if (!ref || !operation || result === null) return result
        try {
          if (operation.type === 'delete') return request(`/rooms/${encodeURIComponent(ref.code)}`, { method: 'DELETE' })
          const saved = await request(`/rooms/${encodeURIComponent(ref.code)}`, { method: 'PUT', body: JSON.stringify({ room: operation.room, expectedVersion: current?.version ?? null }) })
          return saved.room
        } catch (error) {
          const retryable = error.code === 'conflict' || error.code === 'http-404'
          if (!retryable || attempt === 3) throw error
          await sleep(250 * (attempt + 1))
        }
      }
    }
  }
  window.SequenceDB = api
  window.SequenceCloudflareConfig = { provider: 'cloudflare-workers-d1', apiBase }
  setTimeout(() => window.dispatchEvent(new CustomEvent('sequence-api-ready')), 0)
})()

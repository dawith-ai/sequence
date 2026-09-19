(() => {
  const config = {
    apiKey: "AIzaSyC4DHsfiuxWW1qO9VVrEI1HWOD1J0X6Zec",
    authDomain: "one-wish-a40b0.firebaseapp.com",
    projectId: "one-wish-a40b0",
    storageBucket: "one-wish-a40b0.firebasestorage.app",
    messagingSenderId: "654373874242",
    appId: "1:654373874242:web:b9ae3577d272650f2d1bdb"
  }

  const api = { ready:false, projectId:config.projectId }
  window.OneWishDB = api

  try {
    if (!window.firebase) throw new Error('Firebase SDK not loaded')
    if (!firebase.apps.length) firebase.initializeApp(config)
    const db = firebase.firestore()
    try { db.settings({ ignoreUndefinedProperties:true }) } catch {}
    api.ready = true

    const now = () => new Date().toISOString()
    const roomRef = id => db.collection('rooms').doc(id)

    function enrich(room) {
      const contributions = room.contributions || []
      const friendAmount = contributions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const price = Number(room.current_price || room.list_price || room.product?.price || 0)
      const secured = Number(room.self_amount || 0) + friendAmount + Number(room.seller_subsidy || 0)
      return {
        ...room,
        friend_amount: friendAmount,
        secured_amount: secured,
        shortfall: Math.max(0, price - secured),
        progress: price ? Math.min(100, Math.round((secured / price) * 100)) : 0,
        participant_count: contributions.length,
        completed: secured >= price
      }
    }

    function snapData(snap) {
      if (!snap.exists) return null
      return { id:snap.id, ...snap.data() }
    }

    api.checkConnection = async () => {
      try {
        await db.collection('rooms').limit(1).get()
        return true
      } catch (e) {
        console.warn('[One Wish] Firestore connection check failed:', e?.message || e)
        return false
      }
    }

    api.createRoom = async payload => {
      const ref = db.collection('rooms').doc()
      const base = {
        title: String(payload.title || '친구의 생일 위시').slice(0,120),
        occasion: String(payload.occasion || 'birthday').slice(0,40),
        product: payload.product || {},
        self_amount: Math.max(0, Number(payload.self_amount || 0)),
        list_price: Math.max(0, Number(payload.list_price || payload.product?.price || 0)),
        current_price: Math.max(0, Number(payload.current_price || payload.list_price || payload.product?.price || 0)),
        seller_subsidy: 0,
        seller_offer_label: null,
        deadline: payload.deadline || null,
        creator_message: String(payload.creator_message || '함께하는 마음이 더 특별한 선물을 만들어요.').slice(0,500),
        status: 'active',
        created_at: now(),
        updated_at: now()
      }
      await ref.set(base)
      return await api.getRoom(ref.id)
    }

    api.getRoom = async id => {
      const ref = roomRef(id)
      const [roomSnap, cSnap, mSnap] = await Promise.all([
        ref.get(),
        ref.collection('contributions').orderBy('created_at','asc').get(),
        ref.collection('messages').orderBy('created_at','desc').limit(50).get()
      ])
      if (!roomSnap.exists) return null
      const room = snapData(roomSnap)
      room.contributions = cSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      room.messages = mSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      return enrich(room)
    }

    api.addContribution = async (id, { amount, nickname, message }) => {
      const current = await api.getRoom(id)
      if (!current) throw new Error('위시룸을 찾지 못했어요.')
      const allowed = Math.min(Math.max(0, Number(amount || 0)), Math.max(0, current.shortfall))
      if (allowed < 1000) throw new Error(current.shortfall <= 0 ? '이미 선물이 완성되었어요.' : '1,000원 이상 참여해주세요.')
      const ref = roomRef(id)
      const created_at = now()
      const batch = db.batch()
      const cRef = ref.collection('contributions').doc()
      batch.set(cRef, { nickname:String(nickname || '친구').slice(0,40), amount:allowed, created_at })
      if (message) {
        const mRef = ref.collection('messages').doc()
        batch.set(mRef, { nickname:String(nickname || '친구').slice(0,40), text:String(message).slice(0,500), kind:'cheer', created_at })
      }
      batch.update(ref, { updated_at:created_at })
      await batch.commit()
      return await api.getRoom(id)
    }

    api.addMessage = async (id, { nickname, text }) => {
      if (!String(text || '').trim()) throw new Error('메시지를 입력해주세요.')
      const ref = roomRef(id)
      await ref.collection('messages').add({
        nickname:String(nickname || '친구').slice(0,40),
        text:String(text).slice(0,500),
        kind:'cheer',
        created_at:now()
      })
      await ref.update({ updated_at:now() })
      return await api.getRoom(id)
    }

    api.applyPrice = async (id, price) => {
      const room = await api.getRoom(id)
      if (!room) throw new Error('위시룸을 찾지 못했어요.')
      const p = Math.max(1, Math.min(Number(price || room.current_price), Number(room.list_price || room.current_price)))
      await roomRef(id).update({ current_price:p, updated_at:now() })
      return await api.getRoom(id)
    }

    api.applySellerOffer = async (id, subsidy, label) => {
      const room = await api.getRoom(id)
      if (!room) throw new Error('위시룸을 찾지 못했어요.')
      const capped = Math.min(Math.max(0, Number(subsidy || 0)), Math.max(0, room.shortfall))
      await roomRef(id).update({
        seller_subsidy:capped,
        seller_offer_label:String(label || '브랜드가 마지막 조각을 보탭니다.').slice(0,120),
        updated_at:now()
      })
      return await api.getRoom(id)
    }

    api.subscribeRoom = (id, callback, onError) => {
      const ref = roomRef(id)
      let room = null, contributions = [], messages = []
      let booted = 0
      const emit = () => {
        if (!room || booted !== 7) return
        callback(enrich({ ...room, contributions:[...contributions], messages:[...messages] }))
      }
      const fail = error => { console.warn('[One Wish] realtime error:', error); onError?.(error) }
      const unsubs = [
        ref.onSnapshot(snap => { room = snapData(snap); booted |= 1; emit() }, fail),
        ref.collection('contributions').orderBy('created_at','asc').onSnapshot(snap => { contributions = snap.docs.map(d => ({id:d.id,...d.data()})); booted |= 2; emit() }, fail),
        ref.collection('messages').orderBy('created_at','desc').limit(50).onSnapshot(snap => { messages = snap.docs.map(d => ({id:d.id,...d.data()})); booted |= 4; emit() }, fail)
      ]
      return () => unsubs.forEach(fn => { try { fn() } catch {} })
    }
  } catch (e) {
    api.error = e?.message || String(e)
    console.warn('[One Wish] Firebase init failed:', api.error)
  }
})()

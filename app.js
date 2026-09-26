const app = document.querySelector('#app')
const toastEl = document.querySelector('#toast')

const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 }
const RANK_ORDER = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 }
const TEAM_COLORS = ['#16b86b', '#2679ed', '#e04f71', '#efad32', '#8b5cf6', '#10a6a6', '#e56825', '#718096', '#cf4bca', '#5b9c36', '#c98129', '#4d65d7']
const TEAM_NAMES = ['초록', '파랑', '분홍', '금빛', '보라', '청록', '주황', '회색', '라일락', '연두', '호박', '남색']
const DEFAULT_NAMES = ['Caroline', 'Theresa', '민준', '서연', '하림', '지호', '다은', '현우', '유나', '도윤', '채원', '준서']
const VALID_PLAYER_COUNTS = [2, 3, 4, 6, 8, 9, 10, 12]
const VALID_TEAM_COUNTS = [2, 3]

const DEMO_ROOMS = [
  { code: 'MOSS88A1', name: '금요일 밤 카드 한 판', players: 4, maxPlayers: 6, visibility: 'public', status: 'waiting' },
  { code: 'GREEN7Q2', name: '시퀀스 초보 환영', players: 2, maxPlayers: 4, visibility: 'public', status: 'waiting' },
  { code: 'TABLE424', name: '가족 게임 나이트', players: 6, maxPlayers: 8, visibility: 'public', status: 'waiting' }
]

let state = loadState()
let toastTimer = 0
let timerId = 0
let turnExpiryInFlight = false
let audio = null
let audioUnlockBound = false
let subscribedRoomCode = ''
let remoteUnsubscribe = null
let publicRoomsUnsubscribe = null
let remotePublicRooms = []
let roomReconnectTimer = 0
let publicRoomsReconnectTimer = 0
let roomReconnectDelay = 1000
let publicRoomsReconnectDelay = 1000
let inviteJoinStarted = false
let roomMigrationInFlight = false

function uid(prefix = 'id') { return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}` }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]) }
function getSessionId() {
  let id = sessionStorage.getItem('sequence-session')
  if (!id) { id = uid('player'); sessionStorage.setItem('sequence-session', id) }
  return id
}
function getName() { return localStorage.getItem('sequence-name') || '플레이어' }
function setName(name) { localStorage.setItem('sequence-name', name.trim() || '플레이어') }
function inviteCodeFromUrl() {
  const queryCode = new URLSearchParams(location.search).get('room')
  if (queryCode) return queryCode
  const match = location.pathname.match(/^\/room\/([A-Za-z0-9]{8})\/?$/)
  return match?.[1] || ''
}
function setRoomUrl(code = '') {
  const url = new URL(location.href)
  if (code) url.searchParams.set('room', code)
  else url.searchParams.delete('room')
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}
function formatTime(seconds) { return `${String(Math.max(0, Math.floor(seconds / 60))).padStart(2, '0')}:${String(Math.max(0, seconds % 60)).padStart(2, '0')}` }
function toast(message) {
  toastEl.textContent = message
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600)
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('sequence-arena-state') || 'null')
    return { view: 'home', room: null, code: '', currentPlayerId: getSessionId(), sort: 'number', soundOn: false, volume: 0.75, connectionStatus: 'connecting', demoMode: false, ...saved, currentPlayerId: saved?.currentPlayerId || getSessionId() }
  } catch { return { view: 'home', room: null, code: '', currentPlayerId: getSessionId(), sort: 'number', soundOn: false, volume: 0.75, connectionStatus: 'connecting', demoMode: false } }
}
function saveState() {
  localStorage.setItem('sequence-arena-state', JSON.stringify({ view: state.demoMode ? 'home' : state.view, room: state.demoMode ? null : state.room, code: state.demoMode ? '' : state.code, currentPlayerId: state.currentPlayerId, sort: state.sort, soundOn: state.soundOn, volume: state.volume }))
}
function restorePlayerIdentity(room = state.room) {
  if (!room?.players?.length) return null
  const current = room.players.find(player => player.id === state.currentPlayerId)
  if (current) return current
  const name = getName()
  const match = name && name !== '플레이어' ? room.players.find(player => player.name === name) : null
  if (!match) return null
  state.currentPlayerId = match.id
  sessionStorage.setItem('sequence-session', match.id)
  saveState()
  return match
}
function remoteRoomPayload(room) {
  return {
    ...room,
    players: (room.players || []).map(({ selectedCard, deadSwapUsed, ...player }) => player)
  }
}
function persistRoom() {
  if (state.demoMode || !state.room?.code) return Promise.resolve()
  localStorage.setItem(`sequence-room-${state.room.code}`, JSON.stringify(state.room))
  if (!window.SequenceDB) return Promise.resolve()
  return window.SequenceDB.collection('sequenceRooms').doc(state.room.code).set(remoteRoomPayload(state.room)).catch(error => {
    console.warn('Sequence room write unavailable', error)
    toast('실시간 저장이 잠시 지연되고 있어요. 연결을 확인해 주세요.')
  })
}
async function transactRoom(update) {
  if (!state.room?.code || !window.SequenceDB) return null
  const roomRef = window.SequenceDB.collection('sequenceRooms').doc(state.room.code)
  return window.SequenceDB.runTransaction(async transaction => {
    const snapshot = await transaction.get(roomRef)
    const remote = snapshot.data()
    if (!remote) return null
    if (update(remote) === false) return null
    transaction.set(roomRef, remoteRoomPayload(remote))
    return remote
  })
}
async function migrateWaitingRoom(code) {
  if (roomMigrationInFlight || !window.SequenceDB || !code) return
  roomMigrationInFlight = true
  try {
    const roomRef = window.SequenceDB.collection('sequenceRooms').doc(code)
    await window.SequenceDB.runTransaction(async transaction => {
      const snapshot = await transaction.get(roomRef)
      const remote = snapshot.data()
      if (!remote || remote.status !== 'waiting') return null
      const needsBoardMigration = !Array.isArray(remote.board) || remote.board.length !== 100 || remote.board.some(cell => String(cell.card).startsWith('J'))
      const needsTeamMigration = !VALID_TEAM_COUNTS.includes(Number(remote.teamCount))
      if (!needsBoardMigration && !needsTeamMigration) return null
      normalizeRoomShape(remote)
      transaction.set(roomRef, remoteRoomPayload(remote))
      return remote
    })
  } catch (error) {
    console.warn('Sequence waiting-room migration unavailable', error)
  } finally {
    roomMigrationInFlight = false
  }
}
async function getRemoteRoom(code) {
  if (!window.SequenceDB) return null
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const snapshot = await window.SequenceDB.collection('sequenceRooms').doc(code).get()
      return snapshot.exists ? normalizeRoomShape(snapshot.data()) : null
    } catch (error) {
      lastError = error
      if (!String(error?.code || '').includes('resource-exhausted')) break
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  throw lastError
}
function scheduleRoomReconnect() {
  if (roomReconnectTimer || !state.room?.code) return
  const delay = roomReconnectDelay
  roomReconnectDelay = Math.min(30000, roomReconnectDelay * 2)
  roomReconnectTimer = setTimeout(() => { roomReconnectTimer = 0; subscribeRoom() }, delay)
}
function schedulePublicRoomsReconnect() {
  if (publicRoomsReconnectTimer) return
  const delay = publicRoomsReconnectDelay
  publicRoomsReconnectDelay = Math.min(30000, publicRoomsReconnectDelay * 2)
  publicRoomsReconnectTimer = setTimeout(() => { publicRoomsReconnectTimer = 0; subscribePublicRooms() }, delay)
}
function subscribeRoom() {
  if (state.demoMode || !window.SequenceDB || !state.room?.code || subscribedRoomCode === state.room.code) return
  state.connectionStatus = 'connecting'
  if (remoteUnsubscribe) remoteUnsubscribe()
  subscribedRoomCode = state.room.code
  remoteUnsubscribe = window.SequenceDB.collection('sequenceRooms').doc(state.room.code).onSnapshot(snapshot => {
    roomReconnectDelay = 1000
    state.connectionStatus = 'connected'
    if (!snapshot.exists || !state.room || snapshot.id !== state.room.code) return
    const incoming = snapshot.data()
    const needsWaitingRoomMigration = incoming.status === 'waiting' && (!Array.isArray(incoming.board) || incoming.board.length !== 100 || incoming.board.some(cell => String(cell.card).startsWith('J')) || !VALID_TEAM_COUNTS.includes(Number(incoming.teamCount)))
    normalizeRoomShape(incoming)
    if (state.movePending) return
    restorePlayerIdentity(incoming)
    const localPlayer = me(state.room)
    const previousTurnId = currentPlayer(state.room)?.id
    const localPlayerIndex = incoming.players?.findIndex(player => player.id === state.currentPlayerId) ?? -1
    if (localPlayer?.selectedCard && incoming.currentPlayerIndex === localPlayerIndex) {
      const incomingPlayer = incoming.players?.find(player => player.id === localPlayer.id)
      if (incomingPlayer) incomingPlayer.selectedCard = localPlayer.selectedCard
    }
    state.room = incoming
    if (previousTurnId && previousTurnId !== incoming.players?.[incoming.currentPlayerIndex]?.id) {
      const nextPlayer = currentPlayer(incoming)
      if (nextPlayer) toast(nextPlayer.id === state.currentPlayerId ? '내 차례예요. 카드를 골라 주세요.' : `${nextPlayer.name}님 차례예요.`)
    }
    if ((incoming.status === 'playing' || incoming.status === 'finished') && state.view === 'lobby') state.view = 'game'
    if (incoming.status === 'waiting' && state.view === 'game') state.view = 'lobby'
    localStorage.setItem(`sequence-room-${state.room.code}`, JSON.stringify(state.room))
    if (state.view === 'lobby' || state.view === 'game') render()
    if (needsWaitingRoomMigration) migrateWaitingRoom(incoming.code)
  }, error => { state.connectionStatus = 'reconnecting'; console.warn('Sequence realtime sync unavailable', error); remoteUnsubscribe = null; subscribedRoomCode = ''; scheduleRoomReconnect(); render() })
}
function subscribePublicRooms() {
  if (!window.SequenceDB || publicRoomsUnsubscribe) return
  publicRoomsUnsubscribe = window.SequenceDB.collection('sequenceRooms')
    .where('visibility', '==', 'public')
    .where('status', '==', 'waiting')
    .limit(50)
    .onSnapshot(snapshot => {
    publicRoomsReconnectDelay = 1000
    remotePublicRooms = snapshot.docs.map(document => document.data())
    if (state.view === 'rooms') render()
  }, error => { console.warn('Sequence public rooms unavailable', error); publicRoomsUnsubscribe = null; schedulePublicRoomsReconnect() })
}
function clearRoomSubscription() {
  if (remoteUnsubscribe) remoteUnsubscribe()
  if (roomReconnectTimer) clearTimeout(roomReconnectTimer)
  roomReconnectTimer = 0
  remoteUnsubscribe = null
  subscribedRoomCode = ''
}
async function refreshRemoteRoom() {
  if (!state.room?.code || !window.SequenceDB) return null
  try {
    const latest = await getRemoteRoom(state.room.code)
    if (!latest) return null
    state.room = latest
    localStorage.setItem(`sequence-room-${latest.code}`, JSON.stringify(latest))
    saveState(); render()
    return latest
  } catch (error) {
    console.warn('Sequence room refresh unavailable', error)
    return null
  }
}
function joinFromInvite() {
  const inviteCode = inviteCodeFromUrl()
  if (!inviteCode || state.view !== 'home' || inviteJoinStarted || !window.SequenceDB) return
  inviteJoinStarted = true
  joinRoom(inviteCode).catch(error => { inviteJoinStarted = false; console.warn('Sequence invite join unavailable', error) })
}
window.addEventListener('sequence-api-ready', () => { state.connectionStatus = 'connected'; subscribePublicRooms(); subscribeRoom(); render(); setTimeout(joinFromInvite, 0) })
function getRoom(code) {
  try { return JSON.parse(localStorage.getItem(`sequence-room-${code}`) || 'null') } catch { return null }
}
function roundCode() { return Math.random().toString(36).slice(2, 10).toUpperCase() }
function isRed(card) { return card?.endsWith('H') || card?.endsWith('D') }
function cardRank(card) { return card?.slice(0, -1) || '' }
function suitOf(card) { return card?.slice(-1) || '' }
function cardLabel(card) { return card === 'FREE' ? '무료 모서리' : `${cardRank(card)}${SUITS[suitOf(card)] || ''}` }
function isOneEyeJack(card) { return cardRank(card) === 'J' && ['H', 'S'].includes(suitOf(card)) }
function isTwoEyeJack(card) { return cardRank(card) === 'J' && ['D', 'C'].includes(suitOf(card)) }
function jackPortraitSvg(card) {
  const front = isTwoEyeJack(card)
  const accent = front ? '#2679ed' : '#c73449'
  const hair = front ? '#1e315c' : '#5c3027'
  const face = front ? `<path d="M29 42c0-16 7-25 16-25s16 9 16 25v14c0 13-7 23-16 23S29 69 29 56z" fill="#f1bd8f"/><path d="M33 43c1-13 5-21 12-21s11 8 12 21c-5-5-16-7-24 0z" fill="${hair}"/><path d="M37 48h5M49 48h5" stroke="#24334a" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="48" r="1.7" fill="#24334a"/><circle cx="52" cy="48" r="1.7" fill="#24334a"/><path d="M44 51l-2 8 4 1M39 65c4 3 8 3 12 0" fill="none" stroke="#a65b56" stroke-width="1.8" stroke-linecap="round"/><path d="M24 105c2-19 11-29 21-29s19 10 21 29" fill="${accent}"/><path d="M39 79l6 9 6-9" fill="#fff4dc"/>` : `<path d="M35 42c0-15 7-24 16-24 9 0 16 8 16 22 0 5-2 8-5 10-1 14-8 24-17 24-8 0-14-9-14-22z" fill="#efbd8c"/><path d="M31 48c-3-16 4-31 20-31 11 0 18 8 18 20-8-5-13-12-14-19-4 9-12 16-24 19z" fill="${hair}"/><path d="M49 48h7" stroke="#24334a" stroke-width="3" stroke-linecap="round"/><circle cx="53" cy="48" r="1.8" fill="#24334a"/><path d="M60 51l8 5-8 4M50 65c4 2 8 1 10-2" fill="none" stroke="#a65b56" stroke-width="1.8" stroke-linecap="round"/><path d="M27 105c3-19 13-29 25-29 10 0 18 10 20 29" fill="${accent}"/><path d="M45 80l8 8 7-9" fill="#fff4dc"/>`
  return `<svg class="jack-illustration ${front ? 'front-facing' : 'profile-facing'}" viewBox="0 0 90 110" role="img" aria-label="${front ? '두 눈 잭 정면 인물' : '한 눈 잭 옆얼굴 인물'}"><defs><linearGradient id="jack-bg-${front ? 'front' : 'profile'}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${front ? '#d9efff' : '#ffe0d7'}"/><stop offset="1" stop-color="${front ? '#8db9ea' : '#e79a8f'}"/></linearGradient></defs><rect x="2" y="2" width="86" height="106" rx="13" fill="url(#jack-bg-${front ? 'front' : 'profile'})"/><path d="M21 20l7-12 8 7 9-13 9 13 9-7 7 12" fill="#d8b86c" stroke="#8b6829" stroke-width="2" stroke-linejoin="round"/>${face}</svg>`
}
function cardMarkup(card, options = {}) {
  const selected = options.selected ? ' card-selected' : ''
  const disabled = options.disabled ? ' disabled' : ''
  const last = options.last ? ' last-played-card' : ''
  const dead = options.dead ? '<span class="dead-badge">교환</span>' : ''
  const jack = cardRank(card) === 'J'
  const jackType = isTwoEyeJack(card) ? 'wild' : 'remove'
  const jackVisual = `<span class="jack-portrait ${jackType}">${jackPortraitSvg(card)}</span>`
  return `<button class="playing-card${isRed(card) ? ' red-suit' : ''}${selected}${last}${disabled}" data-card="${escapeHtml(card)}" aria-label="${escapeHtml(cardLabel(card))}"><span class="card-corner">${escapeHtml(cardRank(card))}<i>${SUITS[suitOf(card)] || ''}</i></span><span class="card-center">${jack ? `${jackVisual}<small>${isTwoEyeJack(card) ? '두 눈 · 자유 배치' : '한 눈 · 칩 제거'}</small>` : (SUITS[suitOf(card)] || '')}</span>${dead}</button>`
}
const BOARD_LAYOUT = [
  ['FREE', '10S', 'QS', 'KS', 'AS', '2D', '3D', '4D', '5D', 'FREE'],
  ['9S', '10H', '9H', '8H', '7H', '6H', '5H', '4H', '3H', '6D'],
  ['8S', 'QH', '7D', '8D', '9D', '10D', 'QD', 'KD', '2H', '7D'],
  ['7S', 'KH', '6D', '2S', 'AH', 'KH', 'QH', 'AD', '2C', '8D'],
  ['6S', 'AH', '5D', '3S', '4H', '3H', '10H', 'AC', '3C', '9D'],
  ['5S', '2C', '4D', '4S', '5H', '2H', '9H', 'KC', '4C', '10D'],
  ['4S', '3C', '3D', '5S', '6H', '7H', '8H', 'QC', '5C', 'QD'],
  ['3S', '4C', '2D', '6C', '7C', '8C', '9C', '10C', '6S', 'KD'],
  ['2S', '5C', 'AS', 'KS', 'QS', '10S', '9S', '8S', '7S', 'AD'],
  ['FREE', '6C', '7C', '8C', '9C', '10C', 'QC', 'KC', 'AC', 'FREE'],
]
function buildBoard() {
  return BOARD_LAYOUT.flat().map(card => ({ card, team: null, sequence: null }))
}
function buildDeck() {
  const deck = []
  for (const suit of ['S', 'H', 'D', 'C']) for (const rank of Object.keys(RANK_ORDER)) { deck.push(`${rank}${suit}`); deck.push(`${rank}${suit}`) }
  return shuffle(deck)
}
function shuffle(items) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}
function teamCountFor(players, preferred = 0) {
  if (VALID_TEAM_COUNTS.includes(Number(preferred)) && players % Number(preferred) === 0) return Number(preferred)
  return players % 3 === 0 && players % 2 !== 0 ? 3 : 2
}
function playerCountsFor(teamCount) { return VALID_PLAYER_COUNTS.filter(count => count % Number(teamCount) === 0) }
function canStartRoom(room) {
  return Boolean(room && room.players?.length >= 2 && VALID_TEAM_COUNTS.includes(Number(room.teamCount)) && room.players.length % room.teamCount === 0)
}
function handSizeFor(players) { return players <= 2 ? 7 : players <= 4 ? 6 : players <= 6 ? 5 : players <= 8 ? 4 : players <= 10 ? 3 : 2 }
function normalizeTeams(room) {
  const capacity = Number(room.maxPlayers) || room.players.length
  room.teamCount = teamCountFor(capacity, room.teamCount)
  room.players.forEach((player, index) => {
    player.team = index % room.teamCount
  })
}
function normalizeRoomShape(room) {
  if (!room) return room
  if (!VALID_TEAM_COUNTS.includes(Number(room.teamCount))) room.teamCount = teamCountFor(Number(room.maxPlayers) || room.players?.length || 2)
  normalizeTeams(room)
  if (room.status === 'waiting') {
    room.board = buildBoard()
    room.deck = []
    room.discard = []
    room.sequences = []
  }
  return room
}
function newRoom({ name, playerName, maxPlayers, visibility, password }) {
  const teamCount = teamCountFor(Number(maxPlayers))
  const players = [{ id: state.currentPlayerId, name: playerName, team: 0, isHost: true, hand: [] }]
  const room = { code: roundCode(), name, visibility, password: visibility === 'private' ? password : '', maxPlayers, players, status: 'waiting', teamCount, board: buildBoard(), deck: [], discard: [], currentPlayerIndex: 0, turnSeconds: 60, lastMove: null, moveHistory: [], sequences: [], winnerTeam: null, turnStarter: null, turnRevealed: false, turnStartedAt: null, chat: [] }
  normalizeTeams(room)
  return room
}
function seedDemoRoom({ start = true } = {}) {
  const room = newRoom({ name: '시퀀스 체험 테이블', playerName: getName(), maxPlayers: 4, visibility: 'public', password: '' })
  room.players = DEFAULT_NAMES.slice(0, 4).map((name, index) => ({ id: index === 0 ? state.currentPlayerId : uid('bot'), name, team: index % 2, isHost: index === 0, hand: [] }))
  if (start) { room.turnStarter = 0; room.turnRevealed = true; startGame(room) }
  return room
}
function startGame(room) {
  room.status = 'playing'
  normalizeTeams(room)
  room.board = buildBoard()
  room.deck = buildDeck()
  room.discard = []
  room.moveHistory = []
  room.sequences = []
  const size = handSizeFor(room.players.length)
  room.players.forEach(player => { player.hand = [] })
  // Deal one card per player in rounds. This avoids giving the host a
  // deterministic advantage just because they occupy seat one.
  for (let round = 0; round < size; round += 1) {
    room.players.forEach(player => { if (room.deck.length) player.hand.push(room.deck.pop()) })
  }
  room.currentPlayerIndex = room.turnStarter ?? Math.floor(Math.random() * room.players.length)
  room.turnSeconds = 60
  room.turnStartedAt = Date.now()
  room.lastMove = null
}
function currentPlayer(room = state.room) { return room?.players?.[room.currentPlayerIndex] }
function me(room = state.room) { return room?.players?.find(player => player.id === state.currentPlayerId) || null }
function isMyTurn(room = state.room) { return room?.status === 'playing' && currentPlayer(room)?.id === state.currentPlayerId }
function currentTeam(room = state.room) { return me(room)?.team ?? 0 }
function calculateTurnSeconds(room) { return Math.max(0, 60 - Math.floor((Date.now() - (room.turnStartedAt || Date.now())) / 1000)) }
function drawCard(room) {
  if (!room.deck?.length && room.discard?.length) {
    room.deck = shuffle(room.discard)
    room.discard = []
  }
  return room.deck?.pop()
}
function removeOneCard(hand, card) {
  const index = hand.indexOf(card)
  if (index >= 0) hand.splice(index, 1)
  return hand
}
function legalCells(room, card) {
  if (!card) return []
  const oneEyeJack = isOneEyeJack(card)
  const twoEyeJack = isTwoEyeJack(card)
  if (card === 'FREE') return []
  return room.board.map((cell, index) => {
    if (cell.card === 'FREE') return -1
    if (oneEyeJack) return cell.team !== null && cell.team !== currentTeam(room) && !cell.sequence ? index : -1
    if (twoEyeJack) return cell.team === null ? index : -1
    return cell.card === card && cell.team === null ? index : -1
  }).filter(index => index >= 0)
}
function canPlay(room, card) { return legalCells(room, card).length > 0 }
function activeTargets(room) {
  if (state.movePending) return new Set()
  const player = me(room)
  return new Set(player?.selectedCard ? legalCells(room, player.selectedCard) : [])
}
function detectSequences(room, placedIndex) {
  const team = currentTeam(room)
  const row = Math.floor(placedIndex / 10), col = placedIndex % 10
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]
  const found = []
  for (const [dr, dc] of directions) {
    const line = [placedIndex]
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = col + dc * sign
      while (r >= 0 && r < 10 && c >= 0 && c < 10) {
        const index = r * 10 + c, cell = room.board[index]
        if (cell.card === 'FREE' || cell.team === team) line.push(index); else break
        r += dr * sign; c += dc * sign
      }
    }
    line.sort((a, b) => a - b)
    for (let start = 0; start <= line.length - 5; start++) {
      const cells = line.slice(start, start + 5)
      if (cells.includes(placedIndex) && cells.filter(index => room.board[index].card !== 'FREE').length >= 4) found.push(cells)
    }
  }
  return found
}
function finishMove(room, card, cellIndex) {
  const player = me(room)
  const cell = room.board[cellIndex]
  const oneEyeJack = isOneEyeJack(card)
  if (oneEyeJack) cell.team = null
  else cell.team = player.team
  const moveSequences = oneEyeJack ? [] : detectSequences(room, cellIndex)
  moveSequences.forEach(sequence => { sequence.forEach(index => { room.board[index].sequence = player.team }); room.sequences.push({ team: player.team, cells: sequence }) })
  room.lastMove = { card, cellIndex, at: Date.now(), team: player.team, sequence: moveSequences[0] || null }
  room.moveHistory = [...(room.moveHistory || []), { playerId: player.id, playerName: player.name, card, cellIndex, at: room.lastMove.at, team: player.team }].slice(-12)
  removeOneCard(player.hand, card)
  room.discard.push(card)
  const replacement = drawCard(room)
  if (replacement) player.hand.push(replacement)
  const teamWins = room.sequences.filter(sequence => sequence.team === player.team).length
  const needed = room.teamCount === 2 ? 2 : 1
  if (teamWins >= needed) { room.status = 'finished'; room.winnerTeam = player.team; room.turnStartedAt = null; return }
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length
  room.turnSeconds = 60
  room.turnStartedAt = Date.now()
  room.players.forEach(item => { delete item.selectedCard; delete item.deadSwapUsed })
}
function cycleTurn(room) {
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length
  room.turnSeconds = 60
  room.turnStartedAt = Date.now()
  room.players.forEach(item => { delete item.selectedCard; delete item.deadSwapUsed })
  toast('시간이 끝나 다음 차례로 넘어갔어요.')
}
async function advanceTurnIfExpired() {
  const room = state.room
  if (!room || room.status !== 'playing' || calculateTurnSeconds(room) > 0 || turnExpiryInFlight) return
  turnExpiryInFlight = true
  try {
    if (!window.SequenceDB) {
      cycleTurn(room); persistRoom(); saveState(); render()
      return
    }
    const reference = room.turnStartedAt
    const roomRef = window.SequenceDB.collection('sequenceRooms').doc(room.code)
    await window.SequenceDB.runTransaction(async transaction => {
      const snapshot = await transaction.get(roomRef)
      const remote = snapshot.data()
      if (!remote || remote.status !== 'playing' || remote.turnStartedAt !== reference || Date.now() - remote.turnStartedAt < 60000) return
      const updated = { ...remote, currentPlayerIndex: (remote.currentPlayerIndex + 1) % remote.players.length, turnSeconds: 60, turnStartedAt: Date.now(), players: remote.players.map(player => ({ ...player })) }
      updated.players.forEach(player => { delete player.selectedCard; delete player.deadSwapUsed })
      transaction.set(roomRef, remoteRoomPayload(updated))
    })
  } catch (error) {
    console.warn('Sequence turn expiry unavailable', error)
  } finally {
    turnExpiryInFlight = false
  }
}
function sortedHand(hand) {
  return [...(hand || [])].sort((a, b) => state.sort === 'suit' ? SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)] || RANK_ORDER[cardRank(b)] - RANK_ORDER[cardRank(a)] : RANK_ORDER[cardRank(b)] - RANK_ORDER[cardRank(a)] || SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)])
}

function header(label = 'home') {
  return `<header class="topbar"><button class="brand" data-action="home"><span class="brand-mark">♠</span><span>SEQUENCE <em>ARENA</em></span></button><nav class="main-nav"><button class="${label === 'home' ? 'active' : ''}" data-action="home">홈</button><button class="${label === 'rooms' ? 'active' : ''}" data-action="rooms">공개 대기실</button><button data-action="rules">게임 규칙</button></nav><div class="topbar-actions"><button class="sound-toggle" data-action="sound">${state.soundOn ? '♫ 사운드 ON' : '♫ 사운드'}</button><span class="profile-dot">${escapeHtml(getName().slice(0, 1))}</span></div><nav class="mobile-nav" aria-label="모바일 메뉴"><button class="${label === 'home' ? 'active' : ''}" data-action="home">홈</button><button class="${label === 'rooms' ? 'active' : ''}" data-action="rooms">공개 방</button><button class="${label === 'rules' ? 'active' : ''}" data-action="rules">규칙</button></nav></header>`
}
function homePage() {
  const defaultTeamCount = 2
  const playerOptions = playerCountsFor(defaultTeamCount)
  return `<div class="site-shell landing"><div class="lobby-noise"></div>${header('home')}<main class="landing-main"><section class="hero-copy"><div class="eyebrow"><span></span> 클래식 보드게임, 온라인으로</div><h1>카드 한 장.<br><strong>한 수 앞서.</strong></h1><p>친구들을 테이블로 불러 모으세요. 다섯 개를 한 줄로 잇고,<br>속내를 감춰 보세요.</p><div class="hero-foot"><span>✣　2—12명 플레이</span><i></i><span>실시간으로 함께</span></div><button class="demo-cta" data-action="demo"><span class="demo-cta-mark">▶</span><span><b>데모 테이블 보기</b><small>가입 없이 게임 화면을 먼저 확인하세요</small></span><strong>→</strong></button></section><section class="entry-grid"><div class="entry-card create-panel"><div class="panel-kicker"><span class="panel-icon">＋</span><span>게임 준비</span><b>01</b></div><h2>방 만들기</h2><p class="panel-copy">친구들을 초대할 테이블을 준비해요.</p><form id="createForm" class="form-stack"><label class="field-label">내 이름<input name="name" maxlength="16" placeholder="사용할 이름을 입력하세요" value="${escapeHtml(getName())}" required /></label><label class="field-label">방 이름<input name="roomName" value="금요일 밤 카드 한 판" maxlength="32" required /></label><div class="field-row"><label class="field-label">인원 수<select name="maxPlayers" id="maxPlayers">${playerOptions.map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}명</option>`).join('')}</select></label><label class="field-label">팀 수<select name="teamCount" id="teamCount">${VALID_TEAM_COUNTS.map(n => `<option value="${n}" ${n === defaultTeamCount ? 'selected' : ''}>${n}팀</option>`).join('')}</select></label></div><div class="field-row"><label class="field-label">방 공개 설정<select name="visibility" id="visibility"><option value="public">공개 방</option><option value="private">비공개 방</option></select></label><label class="field-label field-note">공개 방은 비밀번호 없이 바로 참가할 수 있어요.</label></div><div id="passwordField" class="field-label password-field hidden">방 비밀번호<input name="password" type="password" minlength="4" placeholder="4자 이상 입력" /></div><label class="privacy-toggle"><input type="checkbox" name="sound" ${state.soundOn ? 'checked' : ''} /><span></span><b>게임 시작 시 BGM 켜기</b><small>첫 클릭 후 안전하게 재생돼요</small></label><button class="primary-cta" type="submit">방 만들기 <span>→</span></button></form></div><div class="entry-card join-panel"><div class="panel-kicker"><span class="panel-icon door">⌂</span><span>초대 코드가 있나요?</span><b>02</b></div><h2>방 참가</h2><p class="panel-copy">공개 방은 코드·초대 링크 어느 쪽으로도 바로 입장해요.</p><form id="joinForm" class="form-stack"><label class="field-label">초대 코드<input name="code" maxlength="8" placeholder="8자리 코드 입력" autocomplete="off" required /></label><button class="primary-cta join-cta" type="submit">방 참가 <span>→</span></button></form><button class="secondary-cta" data-action="rooms">공개 방 둘러보기 <span>↗</span></button></div></section><div class="landing-rule"><span>♠</span> SEQUENCE ARENA <i>카드 한 장으로 시작되는 저녁</i></div></main></div>`
}
function roomsPage() {
  const localRooms = Object.keys(localStorage).filter(key => key.startsWith('sequence-room-')).map(key => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }).filter(room => room?.visibility === 'public' && room.status === 'waiting')
  const combined = [...remotePublicRooms, ...localRooms, ...DEMO_ROOMS]
  const rooms = combined.filter((room, index, list) => room?.code && list.findIndex(item => item.code === room.code) === index)
  return `<div class="site-shell lobby-shell"><div class="lobby-noise"></div>${header('rooms')}<main class="lobby-main"><div class="page-heading"><button class="back-link" data-action="home">← 홈으로</button><div class="eyebrow"><span></span> OPEN TABLES</div><h1>공개 대기실</h1><p>비밀번호 없이, 지금 열려 있는 테이블에 합류하세요.</p></div><section class="rooms-list"><div class="rooms-list-head"><h2>게임 찾기 <span>${rooms.length}</span></h2><button class="secondary-cta" data-action="home">새 방 만들기 <span>＋</span></button></div>${rooms.length ? rooms.map(room => `<button class="room-row" data-room-code="${room.code}"><span class="room-index">${String(rooms.indexOf(room) + 1).padStart(2, '0')}</span><span class="room-info"><strong>${escapeHtml(room.name)}</strong><small>공개 방 · 링크 또는 코드로 친구를 초대할 수 있어요</small></span><span class="room-players"><b>${room.players.length || room.players} / ${room.maxPlayers}</b><small>플레이어</small></span><span class="room-arrow">→</span></button>`).join('') : `<div class="empty-rooms"><span>♧</span><h2>아직 공개 방이 없어요.</h2><p>첫 방을 만들고 친구를 초대해 보세요.</p></div>`}</section></main></div>`
}
function lobbyPage() {
  const room = state.room
  const isHost = me(room)?.isHost
  const revealMarkup = room.turnRevealed ? `<span class="winner-sparkle">✦</span><strong>${escapeHtml(room.players[room.turnStarter]?.name || '')}</strong><small>첫 차례입니다</small>` : '<span class="question-mark">?</span><small>시작하면 랜덤으로 정해요</small>'
  const validStart = canStartRoom(room)
  const startHint = room.players.length < 2 ? '플레이어가 2명 이상 모이면 시작할 수 있어요.' : validStart ? '방장이 카드를 나누면 랜덤으로 첫 차례가 정해져요.' : `${room.teamCount}팀 대전은 참가자 수가 ${room.teamCount}의 배수여야 해요.`
  return `<div class="site-shell lobby-shell"><div class="lobby-noise"></div>${header()}<main class="lobby-main"><div class="lobby-top"><div><button class="back-link" data-action="leave">← 방 나가기</button><div class="eyebrow"><span></span> WAITING ROOM</div><h1>${escapeHtml(room.name)}</h1><p>친구를 초대하고, 첫 차례를 정해 주세요.</p></div><div class="entry-code"><small>방 코드</small><strong>${room.code}</strong><button data-action="copy-code">코드 복사</button></div></div><section class="lobby-grid"><div class="panel lobby-card"><div class="panel-heading"><div><span class="panel-kicker">TABLE ${room.visibility === 'public' ? '· 공개' : '· 비공개'}</span><h2>플레이어 <em>${room.players.length} / ${room.maxPlayers}</em></h2></div><span class="live-pill">● LIVE</span></div><div class="member-list">${Array.from({ length: room.maxPlayers }, (_, index) => room.players[index] ? `<div class="member-row"><span class="member-chip" style="--member-color:${TEAM_COLORS[room.players[index].team]}">${escapeHtml(room.players[index].name.slice(0, 1))}</span><span><strong>${escapeHtml(room.players[index].name)}</strong>${room.players[index].isHost ? '<small>방장</small>' : ''}</span><b class="team-label">${TEAM_NAMES[room.players[index].team]} 팀</b></div>` : `<div class="member-row empty-seat"><span>＋</span><span>친구를 초대해 주세요</span><small>${index + 1}번 자리</small></div>`).join('')}</div><div class="invite-mini"><span>친구에게 초대 코드를 보내세요</span><strong>${room.code}</strong><button data-action="copy-code">복사</button></div></div><div class="panel lobby-card rules-card"><div class="panel-heading"><div><span class="panel-kicker">STARTING ORDER</span><h2>첫 차례 정하기</h2></div><span class="sequence-mark">✦</span></div><p>${startHint}</p><div class="turn-reveal ${room.turnRevealed ? 'revealed' : ''}">${revealMarkup}</div><div class="rule-facts"><span><b>${room.teamCount}</b> 팀 대전</span><span><b>5</b>개를 한 줄로</span><span><b>60초</b> 턴 타이머</span></div>${isHost ? `<button class="start-button" data-action="start-game" ${validStart ? '' : 'disabled'}>카드 나누고 시작하기 <span>→</span></button>` : '<div class="host-wait">방장이 카드를 나누면 랜덤으로 첫 차례가 정해지고 게임이 시작돼요.</div>'}</div></section></main></div>`
}
function playerPanel(room) {
  return `<aside class="side-panel players-panel"><div class="side-heading"><span>플레이어</span><span class="side-heading-count">${room.players.length}명</span></div>${room.players.map(player => `<div class="player-card ${player.id === state.currentPlayerId ? 'is-me' : ''} ${player.id === currentPlayer(room)?.id ? 'active-turn' : ''}"><span class="player-token" style="--token:${TEAM_COLORS[player.team]}">${escapeHtml(player.name.slice(0, 1))}</span><span class="player-details"><strong>${escapeHtml(player.name)}${player.id === state.currentPlayerId ? ' <em>나</em>' : ''}</strong><small>${TEAM_NAMES[player.team]} 팀 · ${player.hand?.length || 0}장</small></span>${player.id === currentPlayer(room)?.id ? '<i class="player-light"></i>' : ''}</div>`).join('')}<div class="team-scoreboard"><div class="side-heading"><span>시퀀스</span><span class="side-heading-count">${room.teamCount === 2 ? '2개면 승리' : '1개면 승리'}</span></div>${Array.from({ length: room.teamCount }, (_, team) => `<div class="score-row"><i style="background:${TEAM_COLORS[team]}"></i><span>${TEAM_NAMES[team]}</span><strong>${room.sequences.filter(sequence => sequence.team === team).length}</strong></div>`).join('')}</div><div class="rules-mini">♧　완성된 시퀀스의 칩은 제거할 수 없어요.</div></aside>`
}
function boardCellMarkup(room, cell, index) {
  const targets = activeTargets(room)
  const isTarget = targets.has(index)
  const last = room.lastMove?.cellIndex === index
  const seq = room.sequences.some(sequence => sequence.cells.includes(index))
  const value = cell.card === 'FREE' ? '<span class="free-star">✦</span>' : `<span class="cell-rank ${isRed(cell.card) ? 'red-suit' : ''}">${escapeHtml(cardRank(cell.card))}</span><span class="cell-suit ${isRed(cell.card) ? 'red-suit' : ''}">${SUITS[suitOf(cell.card)]}</span>`
  return `<button class="board-cell ${cell.card === 'FREE' ? 'free-cell' : ''} ${isTarget ? 'target-cell' : ''} ${cell.team !== null ? 'occupied' : ''} ${seq ? 'sequence-mark' : ''} ${last ? 'last-move' : ''}" data-cell-index="${index}" style="${cell.team !== null ? `--chip-color:${TEAM_COLORS[cell.team]};` : ''}" ${isTarget && isMyTurn(room) ? '' : 'disabled'} aria-label="${escapeHtml(cell.card === 'FREE' ? '무료 모서리' : cardLabel(cell.card))}">${value}${cell.team !== null ? `<span class="chip-marker">${cell.sequence ? (cell.team === 0 ? 'S' : '✦') : (cell.team === 0 ? '●' : cell.team === 1 ? '◆' : '✦')}</span>` : ''}${last ? '<span class="last-ring"></span>' : ''}</button>`
}
function gamePage() {
  const room = state.room
  const player = me(room)
  const active = currentPlayer(room)
  const myTurn = isMyTurn(room)
  const seconds = calculateTurnSeconds(room)
  const targets = activeTargets(room)
  const selected = player?.selectedCard
  const hand = sortedHand(player?.hand)
  return `<div class="site-shell game-shell"><div class="game-felt"></div><header class="game-topbar"><button class="brand brand-light" data-action="leave"><span class="brand-mark">♠</span><span>SEQUENCE <em>ARENA</em></span></button><div class="game-room-name"><span class="room-live-dot"></span>${escapeHtml(room.name)} <small>#${room.code}</small></div><div class="topbar-actions"><button class="sound-toggle light-button" data-action="sound">${state.soundOn ? '♫ ON' : '♫ BGM'}</button><button class="leave-button" data-action="leave">나가기</button></div></header><main class="game-layout">${playerPanel(room)}<section class="table-center"><div class="turn-banner ${myTurn ? 'your-turn' : ''} ${seconds <= 10 ? 'urgent' : ''}"><div class="turn-icon"><span class="turn-light"></span>${room.status === 'finished' ? '✦' : myTurn ? '◎' : '◷'}</div><div><small>${room.status === 'finished' ? '게임 종료' : myTurn ? '내 차례' : '상대 차례'}</small><strong>${room.status === 'finished' ? `${TEAM_NAMES[room.winnerTeam]} 팀 승리!` : myTurn ? (selected ? '보드에서 놓을 칸을 선택하세요' : '카드를 선택하세요') : `${escapeHtml(active?.name || '상대')}님이 생각 중…`}</strong></div><div class="turn-timer"><span>${formatTime(seconds)}</span><i style="width:${Math.max(0, seconds / 60 * 100)}%"></i></div></div><div class="board-frame"><div class="board-grid" role="grid" aria-label="시퀀스 보드">${room.board.map((cell, index) => boardCellMarkup(room, cell, index)).join('')}</div></div><div class="hand-zone"><div class="hand-header"><div><span class="panel-kicker">YOUR HAND</span><strong>${player?.hand?.length || 0}<small>장</small></strong></div><div class="hand-controls"><button class="sort-button ${state.sort === 'number' ? 'active' : ''}" data-action="sort-number">↕ 숫자 순</button><button class="sort-button ${state.sort === 'suit' ? 'active' : ''}" data-action="sort-suit">♠ 모양 순</button></div></div><div class="hand-cards">${hand.map(card => cardMarkup(card, { selected: selected === card, disabled: !myTurn || room.status !== 'playing', last: room.lastMove?.card === card })).join('')}</div>${selected && myTurn && targets.size === 0 ? `<button class="dead-swap" data-action="dead-swap" ${player.deadSwapUsed ? 'disabled' : ''}>↻　${player.deadSwapUsed ? '이번 차례에는 이미 카드 교환을 했어요' : '사용할 수 없는 카드 교환'}</button>` : `<p class="hand-help">${myTurn ? '카드를 고른 뒤, 빛나는 칸에 놓으세요.' : '내 차례가 되면 카드를 선택할 수 있어요.'}</p>`}</div></section><aside class="side-panel chat-panel"><div class="side-heading"><span>♧ 테이블 채팅</span><span class="chat-live">실시간</span></div><div class="chat-messages">${room.chat?.length ? room.chat.map(message => `<div class="chat-message ${message.id === state.currentPlayerId ? 'mine' : ''}"><strong>${escapeHtml(message.name)}</strong><p>${escapeHtml(message.text)}</p></div>`).join('') : '<div class="chat-empty"><span>♧</span><p>아직 조용하네요.<br>먼저 인사를 건네 보세요.</p></div>'}</div><form id="chatForm" class="chat-form"><input name="message" placeholder="메시지를 입력하세요" maxlength="100" /><button>→</button></form><div class="rules-strip">⌘　한쪽 눈 잭은 상대 칩을 제거하고, 양쪽 눈 잭은 자유 배치해요.</div></aside></main>${room.lastMove?.sequence ? `<div class="sequence-celebration"><div class="celebration-card"><span class="celebration-label">SEQUENCE COMPLETE</span><strong>${TEAM_NAMES[room.lastMove.team]} 팀</strong><div class="celebration-chips">${room.lastMove.sequence.map((_, index) => `<i style="--delay:${index * 80}ms">${room.lastMove.team === 0 ? 'S' : '✦'}</i>`).join('')}</div><p>다섯 칸을 한 줄로 이었어요.</p><button data-action="dismiss-celebration">계속하기</button></div></div>` : ''}</div>`
}
function rulesPage() { return `<div class="site-shell lobby-shell"><div class="lobby-noise"></div>${header()}<main class="lobby-main rules-page"><button class="back-link" data-action="home">← 홈으로</button><div class="eyebrow"><span></span> HOW TO PLAY</div><h1>시퀀스는 이렇게 플레이해요.</h1><div class="rules-grid"><div class="panel rule-card"><span class="rule-number">01</span><h2>카드를 고르고</h2><p>내 손의 카드와 같은 칸에 칩을 놓아요. 한 눈 잭(♥·♠)은 상대 칩을 치우고, 두 눈 잭(♦·♣)은 빈 칸 어디든 놓을 수 있어요.</p></div><div class="panel rule-card"><span class="rule-number">02</span><h2>다섯 칸을 잇고</h2><p>가로, 세로, 대각선으로 칩 다섯 개를 한 줄로 연결하면 시퀀스가 완성돼요. 모서리는 모두의 무료 칸입니다.</p></div><div class="panel rule-card"><span class="rule-number">03</span><h2>먼저 승리하세요</h2><p>2팀 대전은 두 줄, 그 외의 대전은 한 줄을 먼저 완성하면 승리합니다. 3명, 5명처럼 홀수도 각자 팀으로 즐길 수 있어요.</p></div></div></main></div>` }
function localizeMarkup(markup) {
  return markup.replaceAll('OPEN TABLES', '공개 테이블').replaceAll('WAITING ROOM', '대기실').replaceAll('STARTING ORDER', '시작 순서').replaceAll('YOUR HAND', '내 손패').replaceAll('HOW TO PLAY', '플레이 방법').replaceAll('SEQUENCE COMPLETE', '시퀀스 완성').replaceAll('TABLE ·', '테이블 ·').replaceAll('TABLE ', '테이블 ').replaceAll('● LIVE', '● 실시간').replaceAll('♫ 사운드 ON', '♫ 사운드 켜짐').replaceAll('♫ ON', '♫ 켜짐').replaceAll('♫ BGM', '♫ 배경음')
}
function updateTimerUi() {
  const room = state.room
  if (state.view !== 'game' || room?.status !== 'playing') return
  const seconds = calculateTurnSeconds(room)
  const banner = document.querySelector('.turn-banner')
  const timer = document.querySelector('.turn-timer span')
  const progress = document.querySelector('.turn-timer i')
  if (timer) timer.textContent = formatTime(seconds)
  if (progress) progress.style.width = `${Math.max(0, seconds / 60 * 100)}%`
  if (banner) {
    banner.classList.toggle('your-turn', isMyTurn(room))
    banner.classList.toggle('urgent', seconds <= 10)
  }
}
function render() {
  clearInterval(timerId)
  if (state.view === 'game' && state.room?.status === 'playing') timerId = setInterval(() => { if (state.room && calculateTurnSeconds(state.room) <= 0) advanceTurnIfExpired(); updateTimerUi() }, 1000)
  app.innerHTML = localizeMarkup(state.view === 'home' ? homePage() : state.view === 'rooms' ? roomsPage() : state.view === 'lobby' ? lobbyPage() : state.view === 'rules' ? rulesPage() : gamePage())
  wire()
}
function enterRoom(room) { state.demoMode = false; state.room = room; state.code = room.code; state.view = room.status === 'playing' ? 'game' : 'lobby'; setRoomUrl(room.code); saveState(); subscribeRoom(); render() }
function rejoinExistingPlayer(room, player) {
  state.currentPlayerId = player.id
  sessionStorage.setItem('sequence-session', player.id)
  setName(player.name)
  state.demoMode = false
  state.room = room
  state.code = room.code
  state.view = room.status === 'waiting' ? 'lobby' : 'game'
  setRoomUrl(room.code)
  saveState()
  subscribeRoom()
  render()
  toast(room.status === 'waiting' ? '대기방에 다시 참가했어요.' : '진행 중인 게임에 다시 연결했어요.')
}
async function createRoom(form) {
  const data = new FormData(form), playerName = String(data.get('name') || '').trim(), roomName = String(data.get('roomName') || '').trim(), maxPlayers = Number(data.get('maxPlayers')), teamCount = Number(data.get('teamCount')), visibility = String(data.get('visibility')), password = String(data.get('password') || '')
  if (!playerName || !roomName) return toast('이름과 방 이름을 입력해 주세요.')
  if (!VALID_PLAYER_COUNTS.includes(maxPlayers) || !VALID_TEAM_COUNTS.includes(teamCount) || maxPlayers % teamCount !== 0) return toast('인원수와 팀 수를 맞춰 주세요.')
  if (visibility === 'private' && password.length < 4) return toast('비공개 방 비밀번호는 4자 이상 입력해 주세요.')
  setName(playerName)
  const room = newRoom({ name: roomName, playerName, maxPlayers, visibility, password }); room.teamCount = teamCount; normalizeTeams(room)
  state.room = room; state.code = room.code; state.view = 'lobby'; setRoomUrl(room.code); if (data.get('sound')) { state.soundOn = true; startAudio() }
  await persistRoom(); saveState(); subscribeRoom(); if (state.soundOn) startAudio(); render(); toast(`방이 만들어졌어요 · ${room.code}`)
}
async function joinRoom(code) {
  code = code.trim().toUpperCase()
  const demoRoom = DEMO_ROOMS.find(item => item.code === code)
  let room = getRoom(code)
  if (!room) {
    try { room = await getRemoteRoom(code) } catch { room = null }
  }
  if (!room && demoRoom) room = { ...newRoom({ name: demoRoom.name, playerName: '방장', maxPlayers: demoRoom.maxPlayers, visibility: 'public', password: '' }), code, players: Array.from({ length: demoRoom.players }, (_, index) => ({ id: index === 0 ? uid('host') : uid('player'), name: DEFAULT_NAMES[index], team: index % 2, isHost: index === 0, hand: [] })) }
  if (!room) return toast('방을 찾을 수 없어요. 초대 코드를 확인해 주세요.')
  if (room.visibility === 'private') { const password = window.prompt('비공개 방 비밀번호를 입력해 주세요.') || ''; if (password !== room.password) return toast('비밀번호가 맞지 않아요.') }
  const name = getName() === '플레이어' ? (window.prompt('플레이어 이름을 입력해 주세요.') || '플레이어') : getName()
  const existingPlayer = room.players.find(player => player.id === state.currentPlayerId || (name && name !== '플레이어' && player.name === name))
  if (existingPlayer) return rejoinExistingPlayer(room, existingPlayer)
  if (room.status !== 'waiting') return toast('이미 시작한 게임이라 새 플레이어로는 참가할 수 없어요. 기존 참가자 이름으로 다시 들어오세요.')
  if (room.players.length >= room.maxPlayers) return toast('방 인원이 가득 찼어요.')
  if (room.players.some(player => player.name === name)) return toast('이 방에서 이미 사용 중인 이름이에요.')
  setName(name)
  if (window.SequenceDB && !demoRoom) {
    try {
      const joinedRoom = await window.SequenceDB.runTransaction(async transaction => {
        const roomRef = window.SequenceDB.collection('sequenceRooms').doc(code)
        const snapshot = await transaction.get(roomRef)
        const remote = snapshot.data()
        if (!remote || remote.status !== 'waiting' || remote.players.length >= remote.maxPlayers || remote.players.some(player => player.name === name || player.id === state.currentPlayerId)) return null
        remote.players.push({ id: state.currentPlayerId, name, team: 0, isHost: false, hand: [] })
        normalizeTeams(remote)
        transaction.set(roomRef, remoteRoomPayload(remote))
        return remote
      })
      if (!joinedRoom) return toast('방 상태가 바뀌었거나 이미 참가한 이름이에요.')
      room = joinedRoom
    } catch (error) {
      console.warn('Sequence room join unavailable', error)
      return toast('방 참가를 저장하지 못했어요. 연결을 확인해 주세요.')
    }
  } else {
    room.players.push({ id: state.currentPlayerId, name, team: 0, isHost: false, hand: [] }); normalizeTeams(room); await persistRoom()
  }
  state.room = room; state.code = room.code; state.view = 'lobby'; setRoomUrl(room.code); saveState(); subscribeRoom(); render(); toast('방에 참가했어요.')
}
async function leaveRoom() {
  const room = state.room
  if ((room?.status === 'waiting' || room?.status === 'playing') && window.SequenceDB && !state.demoMode) {
    try {
      const roomRef = window.SequenceDB.collection('sequenceRooms').doc(room.code)
      await window.SequenceDB.runTransaction(async transaction => {
        const snapshot = await transaction.get(roomRef)
        const remote = snapshot.data()
        if (!remote) return
        const removedIndex = (remote.players || []).findIndex(player => player.id === state.currentPlayerId)
        if (removedIndex < 0) return
        const remaining = (remote.players || []).filter(player => player.id !== state.currentPlayerId).map(player => ({ ...player }))
        if (!remaining.length) {
          transaction.delete(roomRef)
          return
        }
        if (remote.status === 'waiting' && !remaining.some(player => player.isHost)) remaining[0].isHost = true
        const updated = { ...remote, players: remaining }
        if (remote.status === 'waiting') normalizeTeams(updated)
        if (remote.status === 'playing') {
          if (removedIndex < updated.currentPlayerIndex) updated.currentPlayerIndex -= 1
          if (updated.currentPlayerIndex >= remaining.length) updated.currentPlayerIndex = 0
          updated.turnStartedAt = Date.now()
          updated.turnSeconds = 60
          remaining.forEach(player => { delete player.selectedCard; delete player.deadSwapUsed })
        }
        transaction.set(roomRef, remoteRoomPayload(updated))
      })
    } catch (error) {
      console.warn('Sequence leave update unavailable', error)
    }
  }
  if (room?.code) localStorage.removeItem(`sequence-room-${room.code}`)
  clearRoomSubscription(); state.demoMode = false; state.view = 'home'; state.room = null; state.code = ''; setRoomUrl(''); saveState(); render()
}
async function beginGame() {
  if (!state.room || !me(state.room)?.isHost) return toast('방장만 게임을 시작할 수 있어요.')
  if (!canStartRoom(state.room)) return toast(`${state.room.teamCount}팀 대전은 참가자 수가 ${state.room.teamCount}의 배수여야 해요.`)
  if (state.soundOn) startAudio()
  if (window.SequenceDB && !state.demoMode) {
    try {
      const updated = await transactRoom(remote => {
        const host = remote.players?.find(player => player.id === state.currentPlayerId)
        normalizeRoomShape(remote)
        if (!host?.isHost || remote.status !== 'waiting' || !canStartRoom(remote)) return false
        remote.turnStarter = Math.floor(Math.random() * remote.players.length)
        remote.turnRevealed = true
        startGame(remote)
      })
      if (!updated) return toast('방 상태가 바뀌어 게임을 시작하지 못했어요.')
      state.room = updated
    } catch (error) {
      console.warn('Sequence game start unavailable', error)
      return toast('게임 시작을 저장하지 못했어요. 연결을 확인해 주세요.')
    }
  } else {
    state.room.turnStarter = Math.floor(Math.random() * state.room.players.length)
    state.room.turnRevealed = true
    startGame(state.room)
    persistRoom()
  }
  state.view = 'game'; saveState(); render(); if (state.soundOn) { playShuffleSound(); startAudio() } toast('카드를 나눴어요. 게임 시작!')
}
function handleCard(card) {
  const room = state.room, player = me(room)
  if (state.movePending) return
  if (!isMyTurn(room)) return toast('아직 내 차례가 아니에요.')
  if (!player.hand.includes(card)) return
  if (player.selectedCard === card) { delete player.selectedCard; render(); return }
  player.selectedCard = card; render()
  if (!canPlay(room, card)) toast('이 카드는 아직 놓을 수 있는 칸이 없어요. 교환할 수 있어요.')
}
async function commitMoveRemote(card, cellIndex) {
  const room = state.room
  const roomRef = window.SequenceDB.collection('sequenceRooms').doc(room.code)
  return window.SequenceDB.runTransaction(async transaction => {
    const snapshot = await transaction.get(roomRef)
    const remote = snapshot.data()
    const player = remote?.players?.find(item => item.id === state.currentPlayerId)
    if (!remote || remote.status !== 'playing' || remote.currentPlayerIndex < 0 || remote.players[remote.currentPlayerIndex]?.id !== state.currentPlayerId || !player?.hand?.includes(card) || !legalCells(remote, card).includes(cellIndex)) return null
    finishMove(remote, card, cellIndex)
    transaction.set(roomRef, remoteRoomPayload(remote))
    return remote
  })
}
async function handleCell(index) {
  const room = state.room, player = me(room)
  if (state.movePending) return
  if (!isMyTurn(room) || !player.selectedCard) return
  if (!legalCells(room, player.selectedCard).includes(index)) return toast('그 카드는 이 칸에 놓을 수 없어요.')
  const card = player.selectedCard
  const previousRoom = structuredClone(room)
  state.movePending = true
  finishMove(room, card, index)
  render()
  if (state.soundOn) playPlaceSound()
  if (window.SequenceDB && !state.demoMode) {
    try {
      const committedRoom = await commitMoveRemote(card, index)
      if (!committedRoom) {
        state.room = previousRoom
        state.movePending = false
        await refreshRemoteRoom()
        return toast('방 상태가 바뀌어 이 수를 놓지 못했어요. 최신 상태를 불러왔습니다.')
      }
      state.room = committedRoom
    } catch (error) {
      console.warn('Sequence move unavailable', error)
      state.room = previousRoom
      state.movePending = false
      await refreshRemoteRoom()
      return toast('착수를 저장하지 못했어요. 연결을 확인해 주세요.')
    }
  } else {
    persistRoom()
  }
  state.movePending = false
  saveState(); render()
  if (state.room.lastMove?.sequence) toast('시퀀스 완성! 다섯 칸이 빛나요 ✦')
}
async function exchangeDeadCard() {
  const room = state.room, player = me(room)
  if (!isMyTurn(room) || !player.selectedCard || player.deadSwapUsed) return
  if (canPlay(room, player.selectedCard)) return toast('아직 놓을 수 있는 칸이 있어요.')
  const old = player.selectedCard
  if (window.SequenceDB && !state.demoMode) {
    try {
      const updated = await transactRoom(remote => {
        const remotePlayer = remote.players?.find(item => item.id === state.currentPlayerId)
        if (remote.status !== 'playing' || remote.players[remote.currentPlayerIndex]?.id !== state.currentPlayerId || !remotePlayer?.hand?.includes(old) || remotePlayer.deadSwapUsed || canPlay(remote, old)) return false
        removeOneCard(remotePlayer.hand, old)
        remote.discard = [...(remote.discard || []), old]
        const replacement = drawCard(remote)
        if (replacement) remotePlayer.hand.push(replacement)
        remotePlayer.deadSwapUsed = true
        delete remotePlayer.selectedCard
        remote.currentPlayerIndex = (remote.currentPlayerIndex + 1) % remote.players.length
        remote.turnSeconds = 60
        remote.turnStartedAt = Date.now()
        remote.players.forEach(item => { delete item.selectedCard; delete item.deadSwapUsed })
      })
      if (!updated) return toast('방 상태가 바뀌어 카드를 교환하지 못했어요.')
      state.room = updated
    } catch (error) {
      console.warn('Sequence dead-card exchange unavailable', error)
      return toast('카드 교환을 저장하지 못했어요. 연결을 확인해 주세요.')
    }
  } else {
    removeOneCard(player.hand, old); room.discard.push(old); const replacement = drawCard(room); if (replacement) player.hand.push(replacement); player.deadSwapUsed = true; delete player.selectedCard; cycleTurn(room); persistRoom()
  }
  saveState(); render(); toast('카드를 교환하고 차례를 넘겼어요.')
}
function getAudioContext() {
  if (audio?.ctx) return audio.ctx
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    const ctx = new AudioContext(), master = ctx.createGain()
    master.gain.value = state.volume ?? 0.75; master.connect(ctx.destination)
    audio = { ctx, master, interval: null, begin: null }
    return ctx
  } catch { return null }
}
function bindAudioUnlock() {
  if (audioUnlockBound) return
  const unlock = () => {
    if (!state.soundOn || !audio?.ctx) return
    const resume = audio.ctx.state === 'running' ? Promise.resolve() : audio.ctx.resume()
    resume.then(() => audio?.begin?.()).catch(error => console.warn('Sequence audio unlock unavailable', error))
  }
  document.addEventListener('pointerdown', unlock, { passive: true })
  document.addEventListener('touchstart', unlock, { passive: true })
  document.addEventListener('keydown', unlock, { passive: true })
  audioUnlockBound = true
}
function playShuffleSound() {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.42, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 1.8
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer; gain.gain.setValueAtTime(0.001, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
  source.connect(gain); gain.connect(audio.master); source.start()
  ;[0, 90, 180, 270].forEach(delay => { const click = ctx.createOscillator(), clickGain = ctx.createGain(); click.type = 'triangle'; click.frequency.value = 440 + delay; clickGain.gain.setValueAtTime(0.001, ctx.currentTime + delay / 1000); clickGain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + delay / 1000 + 0.01); clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.06); click.connect(clickGain); clickGain.connect(audio.master); click.start(ctx.currentTime + delay / 1000); click.stop(ctx.currentTime + delay / 1000 + 0.07) })
}
function playPlaceSound() {
  const ctx = getAudioContext()
  if (!ctx) return
  const play = () => {
    if (!audio || !state.soundOn) return
    const now = ctx.currentTime
    ;[523.25, 659.25].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain()
      oscillator.type = index ? 'triangle' : 'sine'
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(index ? 0.075 : 0.11, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24 + index * 0.04)
      oscillator.connect(gain); gain.connect(audio.master)
      oscillator.start(now); oscillator.stop(now + 0.3 + index * 0.04)
    })
  }
  if (ctx.state === 'running') play()
  else ctx.resume().then(() => { if (ctx.state === 'running') play() }).catch(error => console.warn('Sequence move sound unavailable', error))
}
function startAudio() {
  const ctx = getAudioContext()
  if (!ctx) return
  bindAudioUnlock()
  const begin = () => {
    if (!state.soundOn || !audio || audio.interval) return
    const music = ctx.createGain(), filter = ctx.createBiquadFilter()
    music.gain.value = 0.18; filter.type = 'lowpass'; filter.frequency.value = 2600; filter.Q.value = 0.3
    music.connect(filter); filter.connect(audio.master)
    const chords = [[261.63, 329.63, 392, 493.88], [293.66, 369.99, 440, 554.37], [329.63, 415.3, 493.88, 622.25], [349.23, 440, 523.25, 659.25]]
    let chordIndex = 0
    const playChord = () => {
      if (!state.soundOn || !audio) return
      const now = ctx.currentTime, chord = chords[chordIndex++ % chords.length]
      chord.forEach((frequency, voice) => {
        const oscillator = ctx.createOscillator(), voiceGain = ctx.createGain()
        oscillator.type = voice % 2 ? 'triangle' : 'sine'; oscillator.frequency.value = frequency; oscillator.detune.value = voice === 0 ? -3 : voice === 3 ? 3 : 0
        voiceGain.gain.setValueAtTime(0.0001, now); voiceGain.gain.exponentialRampToValueAtTime(0.055, now + 0.35); voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.9)
        oscillator.connect(voiceGain); voiceGain.connect(music); oscillator.start(now); oscillator.stop(now + 6.1)
      })
      const shimmer = ctx.createOscillator(), shimmerGain = ctx.createGain()
      shimmer.type = 'sine'; shimmer.frequency.value = chord[2] * 2; shimmerGain.gain.setValueAtTime(0.0001, now); shimmerGain.gain.exponentialRampToValueAtTime(0.012, now + 0.55); shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8)
      shimmer.connect(shimmerGain); shimmerGain.connect(music); shimmer.start(now); shimmer.stop(now + 4.7)
    }
    playChord(); audio.interval = setInterval(playChord, 5200)
  }
  audio.begin = begin
  if (audio.interval) return
  if (ctx.state === 'running') begin()
  else ctx.resume().then(() => { if (ctx.state === 'running') begin() }).catch(error => console.warn('Sequence audio start unavailable', error))
}
function setVolume(value) { state.volume = Math.max(0, Math.min(1, Number(value))); if (audio?.master) audio.master.gain.value = state.volume; saveState() }
function toggleSound() { state.soundOn = !state.soundOn; if (state.soundOn) startAudio(); else if (audio) { clearInterval(audio.interval); audio.ctx.close(); audio = null } saveState(); render(); toast(state.soundOn ? '잔잔한 테이블 BGM을 켰어요.' : 'BGM을 껐어요.') }
async function dismissCelebration() {
  if (!state.room?.lastMove?.sequence) return
  if (window.SequenceDB && !state.demoMode) {
    try {
      const updated = await transactRoom(remote => { if (!remote.lastMove) return false; remote.lastMove.sequence = null })
      if (!updated) return toast('게임 상태가 바뀌어 연출을 닫지 못했어요.')
      state.room = updated
    } catch (error) {
      console.warn('Sequence celebration update unavailable', error)
      return toast('게임 상태를 저장하지 못했어요. 연결을 확인해 주세요.')
    }
  } else {
    state.room.lastMove.sequence = null
    persistRoom()
  }
  saveState(); render()
}
function copyInvite() {
  if (!state.room?.code) return
  const url = new URL(location.href)
  url.searchParams.set('room', state.room.code)
  const link = url.toString()
  navigator.clipboard?.writeText(link)
  toast('초대 링크를 복사했어요.')
}
function freshWaitingRoom(room) {
  const next = { ...room, status: 'waiting', board: buildBoard(), deck: [], discard: [], currentPlayerIndex: 0, turnSeconds: 60, lastMove: null, moveHistory: [], sequences: [], winnerTeam: null, turnStarter: null, turnRevealed: false, turnStartedAt: null, chat: [] }
  next.players = (room.players || []).map(player => ({ ...player, hand: [], selectedCard: undefined, deadSwapUsed: undefined }))
  normalizeTeams(next)
  return next
}
async function rematch() {
  if (!state.room || state.room.status !== 'finished') return
  if (state.demoMode) {
    state.room = freshWaitingRoom(state.room); state.view = 'lobby'; render(); toast('새 대결을 준비했어요. 첫 차례를 정해 주세요.'); return
  }
  try {
    const updated = await transactRoom(remote => { if (remote.status !== 'finished') return false; Object.assign(remote, freshWaitingRoom(remote)) })
    if (!updated) return toast('게임 상태가 바뀌어 재대결을 준비하지 못했어요.')
    state.room = updated; state.view = 'lobby'; saveState(); render(); toast('새 대결을 준비했어요. 첫 차례를 정해 주세요.')
  } catch (error) { console.warn('Sequence rematch unavailable', error); toast('재대결을 준비하지 못했어요. 연결을 확인해 주세요.') }
}
function addGameUtilities() {
  const room = state.room
  if (!room) return
  const inviteBox = document.querySelector('.entry-code')
  if (state.view === 'lobby' && inviteBox && !inviteBox.querySelector('.invite-link-button')) {
    const button = document.createElement('button'); button.className = 'invite-link-button'; button.textContent = '초대 링크 복사'; button.addEventListener('click', copyInvite); inviteBox.append(button)
  }
  if (state.view !== 'game') return
  const actions = document.querySelector('.game-topbar .topbar-actions')
  if (actions && !actions.querySelector('.connection-pill')) {
    const connection = document.createElement('span'); connection.className = `connection-pill ${state.connectionStatus}`; connection.textContent = state.connectionStatus === 'connected' || state.demoMode ? '● 연결됨' : '◌ 재연결 중'; actions.prepend(connection)
    const volume = document.createElement('input'); volume.className = 'volume-control'; volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.01'; volume.value = state.volume; volume.title = 'BGM 볼륨'; volume.setAttribute('aria-label', 'BGM 볼륨'); volume.addEventListener('input', event => setVolume(event.target.value)); actions.insertBefore(volume, actions.querySelector('.leave-button'))
  }
  const chatPanel = document.querySelector('.chat-panel')
  if (chatPanel && !chatPanel.querySelector('.move-history')) {
    const history = document.createElement('div'); history.className = 'move-history'; history.innerHTML = `<strong>최근 착수</strong>${(room.moveHistory || []).slice(-4).reverse().map(move => `<span>${escapeHtml(move.playerName)} · ${escapeHtml(cardLabel(move.card))}</span>`).join('') || '<small>아직 착수가 없어요.</small>'}`; chatPanel.append(history)
  }
  if (room.status === 'finished' && !document.querySelector('.game-result-panel')) {
    const result = document.createElement('div'); result.className = 'game-result-panel'; result.innerHTML = `<span class="celebration-label">GAME COMPLETE</span><strong>${escapeHtml(TEAM_NAMES[room.winnerTeam] || '')} 팀 승리</strong><p>완성된 시퀀스 ${room.sequences.filter(sequence => sequence.team === room.winnerTeam).length}개 · 총 착수 ${(room.moveHistory || []).length}회</p><button type="button">재대결 준비</button>`; result.querySelector('button').addEventListener('click', rematch); document.querySelector('.game-shell').append(result)
  }
}
function syncRoomSetupFields() {
  const teamSelect = document.querySelector('#teamCount')
  const playerSelect = document.querySelector('#maxPlayers')
  if (!teamSelect || !playerSelect) return
  const teamCount = Number(teamSelect.value) || 2
  const validCounts = playerCountsFor(teamCount)
  const current = Number(playerSelect.value)
  playerSelect.innerHTML = validCounts.map(count => `<option value="${count}">${count}명</option>`).join('')
  playerSelect.value = String(validCounts.includes(current) ? current : validCounts[0])
}
function wire() {
  document.querySelectorAll('[data-action]').forEach(element => element.addEventListener('click', () => {
    const action = element.dataset.action
    if (action === 'home') {
      if (state.room?.status === 'waiting') leaveRoom()
      else { clearRoomSubscription(); state.demoMode = false; state.view = 'home'; state.room = null; setRoomUrl(''); saveState(); render() }
    }
    if (action === 'rooms') { state.view = 'rooms'; render() }
    if (action === 'demo') { clearRoomSubscription(); state.demoMode = true; state.soundOn = true; state.room = seedDemoRoom({ start: false }); state.code = state.room.code; state.view = 'lobby'; startAudio(); render(); toast('데모 대기실을 열었어요. 첫 차례를 정해 보세요.') }
    if (action === 'rules') { state.view = 'rules'; render() }
    if (action === 'sound') toggleSound()
    if (action === 'leave') leaveRoom()
    if (action === 'copy-code') { navigator.clipboard?.writeText(state.room.code); toast(`방 코드 ${state.room.code}를 복사했어요.`) }
    if (action === 'start-game') beginGame()
    if (action === 'sort-number') { state.sort = 'number'; saveState(); render() }
    if (action === 'sort-suit') { state.sort = 'suit'; saveState(); render() }
    if (action === 'dead-swap') exchangeDeadCard()
    if (action === 'dismiss-celebration') dismissCelebration()
  }))
  document.querySelector('#createForm')?.addEventListener('submit', async event => { event.preventDefault(); await createRoom(event.currentTarget) })
  document.querySelector('#joinForm')?.addEventListener('submit', async event => { event.preventDefault(); await joinRoom(new FormData(event.currentTarget).get('code') || '') })
  document.querySelector('#visibility')?.addEventListener('change', event => document.querySelector('#passwordField')?.classList.toggle('hidden', event.target.value !== 'private'))
  document.querySelector('#teamCount')?.addEventListener('change', syncRoomSetupFields)
  document.querySelector('#maxPlayers')?.addEventListener('change', syncRoomSetupFields)
  syncRoomSetupFields()
  document.querySelectorAll('[data-room-code]').forEach(element => element.addEventListener('click', () => joinRoom(element.dataset.roomCode)))
  document.querySelectorAll('[data-card]').forEach(element => element.addEventListener('click', () => handleCard(element.dataset.card)))
  document.querySelectorAll('[data-cell-index]').forEach(element => element.addEventListener('click', () => handleCell(Number(element.dataset.cellIndex))))
  const handZone = document.querySelector('.hand-zone')
  if (handZone && !handZone.querySelector('.mobile-play-cta')) {
    const button = document.createElement('button')
    button.className = 'mobile-play-cta'
    button.type = 'button'
    button.textContent = '플레이'
    handZone.append(button)
  }
  const mobilePlay = document.querySelector('.mobile-play-cta')
  if (mobilePlay) {
    const ready = state.view === 'game' && isMyTurn(state.room) && activeTargets(state.room).size > 0
    mobilePlay.disabled = !ready
    mobilePlay.addEventListener('click', () => document.querySelector('.target-cell')?.click())
  }
  addGameUtilities()
  document.querySelector('#chatForm')?.addEventListener('submit', async event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget), text = String(data.get('message') || '').trim()
    if (!text || !state.room) return
    const message = { id: state.currentPlayerId, name: me(state.room).name, text }
    if (window.SequenceDB && !state.demoMode) {
      try {
        const updated = await transactRoom(remote => { remote.chat = [...(remote.chat || []), message].slice(-100) })
        if (!updated) return toast('채팅을 저장하지 못했어요. 방이 아직 존재하는지 확인해 주세요.')
        state.room = updated
      } catch (error) {
        console.warn('Sequence chat unavailable', error)
        return toast('메시지를 보내지 못했어요. 연결을 확인해 주세요.')
      }
    } else {
      state.room.chat = [...(state.room.chat || []), message].slice(-100)
      persistRoom()
    }
    saveState(); render()
  })
}

if (state.room?.code) { normalizeRoomShape(state.room); restorePlayerIdentity(state.room); setRoomUrl(state.room.code) }
if (state.room?.status === 'playing') state.view = 'game'
render()
setTimeout(joinFromInvite, 700)

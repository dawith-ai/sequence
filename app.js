const app = document.querySelector('#app')
const toastEl = document.querySelector('#toast')

const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 }
const RANK_ORDER = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 }
const TEAM_COLORS = ['#16b86b', '#2679ed', '#e04f71', '#efad32', '#8b5cf6', '#10a6a6', '#e56825', '#718096', '#cf4bca', '#5b9c36', '#c98129', '#4d65d7']
const TEAM_NAMES = ['초록', '파랑', '분홍', '금빛', '보라', '청록', '주황', '회색', '라일락', '연두', '호박', '남색']
const DEFAULT_NAMES = ['Caroline', 'Theresa', '민준', '서연', '하림', '지호', '다은', '현우', '유나', '도윤', '채원', '준서']

const DEMO_ROOMS = [
  { code: 'MOSS88A1', name: '금요일 밤 카드 한 판', players: 4, maxPlayers: 6, visibility: 'public', status: 'waiting' },
  { code: 'GREEN7Q2', name: '시퀀스 초보 환영', players: 2, maxPlayers: 4, visibility: 'public', status: 'waiting' },
  { code: 'TABLE424', name: '가족 게임 나이트', players: 5, maxPlayers: 8, visibility: 'public', status: 'waiting' }
]

let state = loadState()
let toastTimer = 0
let timerId = 0
let audio = null
let subscribedRoomCode = ''
let remoteUnsubscribe = null

function uid(prefix = 'id') { return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}` }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]) }
function getSessionId() {
  let id = sessionStorage.getItem('sequence-session')
  if (!id) { id = uid('player'); sessionStorage.setItem('sequence-session', id) }
  return id
}
function getName() { return localStorage.getItem('sequence-name') || '플레이어' }
function setName(name) { localStorage.setItem('sequence-name', name.trim() || '플레이어') }
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
    return { view: 'home', room: null, code: '', currentPlayerId: getSessionId(), sort: 'number', soundOn: false, ...saved }
  } catch { return { view: 'home', room: null, code: '', currentPlayerId: getSessionId(), sort: 'number', soundOn: false } }
}
function saveState() {
  localStorage.setItem('sequence-arena-state', JSON.stringify({ view: state.view, room: state.room, code: state.code, sort: state.sort, soundOn: state.soundOn }))
}
function remoteRoomPayload(room) {
  return {
    ...room,
    players: (room.players || []).map(({ selectedCard, deadSwapUsed, ...player }) => player)
  }
}
function persistRoom() {
  if (!state.room?.code) return Promise.resolve()
  localStorage.setItem(`sequence-room-${state.room.code}`, JSON.stringify(state.room))
  if (!window.SequenceDB) return Promise.resolve()
  return window.SequenceDB.collection('sequenceRooms').doc(state.room.code).set(remoteRoomPayload(state.room))
}
async function getRemoteRoom(code) {
  if (!window.SequenceDB) return null
  const snapshot = await window.SequenceDB.collection('sequenceRooms').doc(code).get()
  return snapshot.exists ? snapshot.data() : null
}
function subscribeRoom() {
  if (!window.SequenceDB || !state.room?.code || subscribedRoomCode === state.room.code) return
  if (remoteUnsubscribe) remoteUnsubscribe()
  subscribedRoomCode = state.room.code
  remoteUnsubscribe = window.SequenceDB.collection('sequenceRooms').doc(state.room.code).onSnapshot(snapshot => {
    if (!snapshot.exists || !state.room || snapshot.id !== state.room.code) return
    const localPlayer = me(state.room)
    const incoming = snapshot.data()
    if (localPlayer?.selectedCard) {
      const incomingPlayer = incoming.players?.find(player => player.id === localPlayer.id)
      if (incomingPlayer) incomingPlayer.selectedCard = localPlayer.selectedCard
    }
    state.room = incoming
    localStorage.setItem(`sequence-room-${state.room.code}`, JSON.stringify(state.room))
    if (state.view === 'lobby' || state.view === 'game') render()
  }, error => console.warn('Sequence realtime sync unavailable', error))
}
function clearRoomSubscription() {
  if (remoteUnsubscribe) remoteUnsubscribe()
  remoteUnsubscribe = null
  subscribedRoomCode = ''
}
window.addEventListener('sequence-firebase-ready', () => { subscribeRoom(); render() })
function getRoom(code) {
  try { return JSON.parse(localStorage.getItem(`sequence-room-${code}`) || 'null') } catch { return null }
}
function roundCode() { return Math.random().toString(36).slice(2, 10).toUpperCase() }
function isRed(card) { return card?.endsWith('H') || card?.endsWith('D') }
function cardRank(card) { return card?.slice(0, -1) || '' }
function suitOf(card) { return card?.slice(-1) || '' }
function cardLabel(card) { return card === 'FREE' ? '무료 모서리' : `${cardRank(card)}${SUITS[suitOf(card)] || ''}` }
function cardMarkup(card, options = {}) {
  const selected = options.selected ? ' card-selected' : ''
  const disabled = options.disabled ? ' disabled' : ''
  const last = options.last ? ' last-played-card' : ''
  const dead = options.dead ? '<span class="dead-badge">교환</span>' : ''
  const jack = cardRank(card) === 'J'
  return `<button class="playing-card${isRed(card) ? ' red-suit' : ''}${selected}${last}${disabled}" data-card="${escapeHtml(card)}" aria-label="${escapeHtml(cardLabel(card))}"><span class="card-corner">${escapeHtml(cardRank(card))}<i>${SUITS[suitOf(card)] || ''}</i></span><span class="card-center">${jack ? `<b class="jack-glyph">J</b><small>${card.endsWith('S') || card.endsWith('C') ? '자유 배치' : '칩 제거'}</small>` : (SUITS[suitOf(card)] || '')}</span>${dead}</button>`
}
function buildBoard() {
  const suits = ['S', 'H', 'D', 'C']
  const cards = []
  for (const suit of suits) for (const rank of Object.keys(RANK_ORDER)) cards.push(`${rank}${suit}`)
  let cursor = 0
  return Array.from({ length: 100 }, (_, index) => {
    const edge = index < 10 || index >= 90 || index % 10 === 0 || index % 10 === 9
    return { card: edge && [0, 9, 90, 99].includes(index) ? 'FREE' : cards[cursor++ % cards.length], team: null, sequence: null }
  })
}
function buildDeck() {
  const deck = []
  for (const suit of ['S', 'H', 'D', 'C']) for (const rank of Object.keys(RANK_ORDER)) { deck.push(`${rank}${suit}`); deck.push(`${rank}${suit}`) }
  return shuffle(deck)
}
function shuffle(items) { return [...items].sort(() => Math.random() - 0.5) }
function teamCountFor(players) { return players % 2 === 1 ? players : players <= 4 ? 2 : Math.min(4, players / 2) }
function handSizeFor(players) { return players <= 2 ? 7 : players <= 4 ? 6 : players <= 6 ? 5 : players <= 9 ? 4 : 3 }
function newRoom({ name, playerName, maxPlayers, visibility, password }) {
  const players = [{ id: state.currentPlayerId, name: playerName, team: 0, isHost: true, hand: [] }]
  return { code: roundCode(), name, visibility, password: visibility === 'private' ? password : '', maxPlayers, players, status: 'waiting', teamCount: teamCountFor(maxPlayers), board: buildBoard(), deck: [], discard: [], currentPlayerIndex: 0, turnSeconds: 60, lastMove: null, sequences: [], winnerTeam: null, turnStarter: null, turnRevealed: false, turnStartedAt: null, chat: [] }
}
function seedDemoRoom() {
  const room = newRoom({ name: '시퀀스 체험 테이블', playerName: getName(), maxPlayers: 4, visibility: 'public', password: '' })
  room.players = DEFAULT_NAMES.slice(0, 4).map((name, index) => ({ id: index === 0 ? state.currentPlayerId : uid('bot'), name, team: index % 2, isHost: index === 0, hand: [] }))
  room.turnStarter = 0
  room.turnRevealed = true
  startGame(room)
  return room
}
function startGame(room) {
  room.status = 'playing'
  room.teamCount = teamCountFor(room.players.length)
  room.board = room.board?.length === 100 ? room.board : buildBoard()
  room.deck = buildDeck()
  room.discard = []
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
function me(room = state.room) { return room?.players?.find(player => player.id === state.currentPlayerId) || room?.players?.[0] }
function isMyTurn(room = state.room) { return room?.status === 'playing' && currentPlayer(room)?.id === state.currentPlayerId }
function currentTeam(room = state.room) { return me(room)?.team ?? 0 }
function calculateTurnSeconds(room) { return Math.max(0, 60 - Math.floor((Date.now() - (room.turnStartedAt || Date.now())) / 1000)) }
function legalCells(room, card) {
  if (!card) return []
  const oneEyeJack = cardRank(card) === 'J' && ['H', 'D'].includes(suitOf(card))
  if (card === 'FREE') return []
  return room.board.map((cell, index) => {
    if (cell.card === 'FREE') return -1
    if (oneEyeJack) return cell.team !== null && cell.team !== currentTeam(room) && !cell.sequence ? index : -1
    return cell.team === null ? index : -1
  }).filter(index => index >= 0)
}
function canPlay(room, card) { return legalCells(room, card).length > 0 }
function activeTargets(room) {
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
  const oneEyeJack = cardRank(card) === 'J' && ['H', 'D'].includes(suitOf(card))
  if (oneEyeJack) cell.team = null
  else cell.team = player.team
  const moveSequences = oneEyeJack ? [] : detectSequences(room, cellIndex)
  moveSequences.forEach(sequence => { sequence.forEach(index => { room.board[index].sequence = player.team }); room.sequences.push({ team: player.team, cells: sequence }) })
  room.lastMove = { card, cellIndex, at: Date.now(), team: player.team, sequence: moveSequences[0] || null }
  player.hand = player.hand.filter(item => item !== card)
  if (room.deck.length) player.hand.push(room.deck.pop())
  room.discard.push(card)
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
function sortedHand(hand) {
  return [...(hand || [])].sort((a, b) => state.sort === 'suit' ? SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)] || RANK_ORDER[cardRank(b)] - RANK_ORDER[cardRank(a)] : RANK_ORDER[cardRank(b)] - RANK_ORDER[cardRank(a)] || SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)])
}

function header(label = 'home') {
  return `<header class="topbar"><button class="brand" data-action="home"><span class="brand-mark">♠</span><span>SEQUENCE <em>ARENA</em></span></button><nav class="main-nav"><button class="${label === 'home' ? 'active' : ''}" data-action="home">홈</button><button class="${label === 'rooms' ? 'active' : ''}" data-action="rooms">공개 대기실</button><button data-action="rules">게임 규칙</button></nav><div class="topbar-actions"><button class="sound-toggle" data-action="sound">${state.soundOn ? '♫ BGM ON' : '♫ BGM'}</button><span class="profile-dot">${escapeHtml(getName().slice(0, 1))}</span></div></header>`
}
function homePage() {
  return `<div class="site-shell landing"><div class="lobby-noise"></div>${header('home')}<main class="landing-main"><section class="hero-copy"><div class="eyebrow"><span></span> 클래식 보드게임, 온라인으로</div><h1>카드 한 장.<br><strong>한 수 앞서.</strong></h1><p>친구들을 테이블로 불러 모으세요. 다섯 개를 한 줄로 잇고,<br>속내를 감춰 보세요.</p><div class="hero-foot"><span>✣　2—12명 플레이</span><i></i><span>실시간으로 함께</span></div></section><section class="entry-grid"><div class="entry-card create-panel"><div class="panel-kicker"><span class="panel-icon">＋</span><span>게임 준비</span><b>01</b></div><h2>방 만들기</h2><p class="panel-copy">친구들을 초대할 테이블을 준비해요.</p><form id="createForm" class="form-stack"><label class="field-label">내 이름<input name="name" maxlength="16" placeholder="사용할 이름을 입력하세요" value="${escapeHtml(getName())}" required /></label><label class="field-label">방 이름<input name="roomName" value="금요일 밤 카드 한 판" maxlength="32" required /></label><div class="field-row"><label class="field-label">인원 수<select name="maxPlayers">${Array.from({ length: 11 }, (_, i) => i + 2).map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}명</option>`).join('')}</select></label><label class="field-label">방 공개 설정<select name="visibility" id="visibility"><option value="public">공개 방</option><option value="private">비공개 방</option></select></label></div><div id="passwordField" class="field-label password-field hidden">방 비밀번호<input name="password" type="password" minlength="4" placeholder="4자 이상 입력" /></div><label class="privacy-toggle"><input type="checkbox" name="sound" ${state.soundOn ? 'checked' : ''} /><span></span><b>게임 시작 시 BGM 켜기</b><small>첫 클릭 후 안전하게 재생돼요</small></label><button class="primary-cta" type="submit">방 만들기 <span>→</span></button></form></div><div class="entry-card join-panel"><div class="panel-kicker"><span class="panel-icon door">⌂</span><span>초대 코드가 있나요?</span><b>02</b></div><h2>방 참가</h2><p class="panel-copy">공개 방은 코드만 입력하면 바로 입장해요.</p><form id="joinForm" class="form-stack"><label class="field-label">초대 코드<input name="code" maxlength="8" placeholder="8자리 코드 입력" autocomplete="off" required /></label><button class="primary-cta join-cta" type="submit">방 참가 <span>→</span></button></form><button class="secondary-cta" data-action="rooms">공개 방 둘러보기 <span>↗</span></button></div></section><div class="landing-rule"><span>♠</span> SEQUENCE ARENA <i>카드 한 장으로 시작되는 저녁</i></div></main></div>`
}
function roomsPage() {
  const localRooms = Object.keys(localStorage).filter(key => key.startsWith('sequence-room-')).map(key => { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }).filter(room => room?.visibility === 'public' && room.status === 'waiting')
  const rooms = [...localRooms, ...DEMO_ROOMS.filter(demo => !localRooms.some(room => room.code === demo.code))]
  return `<div class="site-shell lobby-shell"><div class="lobby-noise"></div>${header('rooms')}<main class="lobby-main"><div class="page-heading"><button class="back-link" data-action="home">← 홈으로</button><div class="eyebrow"><span></span> OPEN TABLES</div><h1>공개 대기실</h1><p>비밀번호 없이, 지금 열려 있는 테이블에 합류하세요.</p></div><section class="rooms-list"><div class="rooms-list-head"><h2>게임 찾기 <span>${rooms.length}</span></h2><button class="secondary-cta" data-action="home">새 방 만들기 <span>＋</span></button></div>${rooms.length ? rooms.map(room => `<button class="room-row" data-room-code="${room.code}"><span class="room-index">${String(rooms.indexOf(room) + 1).padStart(2, '0')}</span><span class="room-info"><strong>${escapeHtml(room.name)}</strong><small>공개 방 · 링크 또는 코드로 친구를 초대할 수 있어요</small></span><span class="room-players"><b>${room.players.length || room.players} / ${room.maxPlayers}</b><small>플레이어</small></span><span class="room-arrow">→</span></button>`).join('') : `<div class="empty-rooms"><span>♧</span><h2>아직 공개 방이 없어요.</h2><p>첫 방을 만들고 친구를 초대해 보세요.</p></div>`}</section></main></div>`
}
function lobbyPage() {
  const room = state.room
  const isHost = me(room)?.isHost
  return `<div class="site-shell lobby-shell"><div class="lobby-noise"></div>${header()}<main class="lobby-main"><div class="lobby-top"><div><button class="back-link" data-action="leave">← 방 나가기</button><div class="eyebrow"><span></span> WAITING ROOM</div><h1>${escapeHtml(room.name)}</h1><p>친구를 초대하고, 첫 차례를 정해 주세요.</p></div><div class="entry-code"><small>방 코드</small><strong>${room.code}</strong><button data-action="copy-code">코드 복사</button></div></div><section class="lobby-grid"><div class="panel lobby-card"><div class="panel-heading"><div><span class="panel-kicker">TABLE ${room.visibility === 'public' ? '· 공개' : '· 비공개'}</span><h2>플레이어 <em>${room.players.length} / ${room.maxPlayers}</em></h2></div><span class="live-pill">● LIVE</span></div><div class="member-list">${Array.from({ length: room.maxPlayers }, (_, index) => room.players[index] ? `<div class="member-row"><span class="member-chip" style="--member-color:${TEAM_COLORS[room.players[index].team]}">${escapeHtml(room.players[index].name.slice(0, 1))}</span><span><strong>${escapeHtml(room.players[index].name)}</strong>${room.players[index].isHost ? '<small>방장</small>' : ''}</span><b class="team-label">${TEAM_NAMES[room.players[index].team]} 팀</b></div>` : `<div class="member-row empty-seat"><span>＋</span><span>친구를 초대해 주세요</span><small>${index + 1}번 자리</small></div>`).join('')}</div><div class="invite-mini"><span>친구에게 초대 코드를 보내세요</span><strong>${room.code}</strong><button data-action="copy-code">복사</button></div></div><div class="panel lobby-card rules-card"><div class="panel-heading"><div><span class="panel-kicker">STARTING ORDER</span><h2>첫 차례 정하기</h2></div><span class="sequence-mark">✦</span></div><p>시작 버튼을 누르면 랜덤으로 첫 플레이어가 선택돼요. 홀수 인원도 각자 팀으로 플레이할 수 있어요.</p><div class="turn-reveal ${room.turnRevealed ? 'revealed' : ''}">${room.turnRevealed ? `<span class="winner-sparkle">✦</span><strong>${escapeHtml(room.players[room.turnStarter]?.name || '')}</strong><small>첫 차례입니다</small>` : '<span class="question-mark">?</span><small>아직 정하지 않았어요</small>'}</div><div class="rule-facts"><span><b>${room.teamCount}</b> 팀 대전</span><span><b>5</b>개를 한 줄로</span><span><b>60초</b> 턴 타이머</span></div>${isHost ? `<button class="primary-cta" data-action="reveal-turn">${room.turnRevealed ? '다시 정하기' : '첫 차례 뽑기'} <span>✦</span></button><button class="start-button" data-action="start-game" ${room.turnRevealed ? '' : 'disabled'}>카드를 나누고 시작하기 <span>→</span></button>` : '<div class="host-wait">방장이 첫 차례를 정하고 게임을 시작할 때까지 기다려 주세요.</div>'}</div></section></main></div>`
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
function rulesPage() { return `<div class="site-shell lobby-shell"><div class="lobby-noise"></div>${header()}<main class="lobby-main rules-page"><button class="back-link" data-action="home">← 홈으로</button><div class="eyebrow"><span></span> HOW TO PLAY</div><h1>시퀀스는 이렇게 플레이해요.</h1><div class="rules-grid"><div class="panel rule-card"><span class="rule-number">01</span><h2>카드를 고르고</h2><p>내 손의 카드와 같은 칸에 칩을 놓아요. 빨간 잭은 상대 칩을 치우고, 검은 잭은 빈 칸 어디든 놓을 수 있어요.</p></div><div class="panel rule-card"><span class="rule-number">02</span><h2>다섯 칸을 잇고</h2><p>가로, 세로, 대각선으로 칩 다섯 개를 한 줄로 연결하면 시퀀스가 완성돼요. 모서리는 모두의 무료 칸입니다.</p></div><div class="panel rule-card"><span class="rule-number">03</span><h2>먼저 승리하세요</h2><p>2팀 대전은 두 줄, 그 외의 대전은 한 줄을 먼저 완성하면 승리합니다. 3명, 5명처럼 홀수도 각자 팀으로 즐길 수 있어요.</p></div></div></main></div>` }
function render() {
  clearInterval(timerId)
  if (state.view === 'game' && state.room?.status === 'playing') timerId = setInterval(() => { if (state.room && isMyTurn(state.room) && calculateTurnSeconds(state.room) <= 0) { cycleTurn(state.room); persistRoom(); saveState() } render() }, 1000)
  app.innerHTML = state.view === 'home' ? homePage() : state.view === 'rooms' ? roomsPage() : state.view === 'lobby' ? lobbyPage() : state.view === 'rules' ? rulesPage() : gamePage()
  wire()
}
function enterRoom(room) { state.room = room; state.code = room.code; state.view = room.status === 'playing' ? 'game' : 'lobby'; saveState(); subscribeRoom(); render() }
async function createRoom(form) {
  const data = new FormData(form), playerName = String(data.get('name') || '').trim(), roomName = String(data.get('roomName') || '').trim(), maxPlayers = Number(data.get('maxPlayers')), visibility = String(data.get('visibility')), password = String(data.get('password') || '')
  if (!playerName || !roomName) return toast('이름과 방 이름을 입력해 주세요.')
  if (visibility === 'private' && password.length < 4) return toast('비공개 방 비밀번호는 4자 이상 입력해 주세요.')
  setName(playerName)
  const room = newRoom({ name: roomName, playerName, maxPlayers, visibility, password })
  state.room = room; state.code = room.code; state.view = 'lobby'; if (data.get('sound')) state.soundOn = true
  await persistRoom(); saveState(); if (state.soundOn) startAudio(); render(); toast(`방이 만들어졌어요 · ${room.code}`)
}
async function joinRoom(code) {
  code = code.trim().toUpperCase()
  let room = getRoom(code)
  if (!room) {
    try { room = await getRemoteRoom(code) } catch { room = null }
  }
  if (!room) room = DEMO_ROOMS.find(item => item.code === code) ? { ...newRoom({ name: DEMO_ROOMS.find(item => item.code === code).name, playerName: '방장', maxPlayers: DEMO_ROOMS.find(item => item.code === code).maxPlayers, visibility: 'public', password: '' }), code, players: Array.from({ length: DEMO_ROOMS.find(item => item.code === code).players }, (_, index) => ({ id: index === 0 ? uid('host') : uid('player'), name: DEFAULT_NAMES[index], team: index % 2, isHost: index === 0, hand: [] })) } : null
  if (!room) return toast('방을 찾을 수 없어요. 초대 코드를 확인해 주세요.')
  if (room.visibility === 'private') { const password = window.prompt('비공개 방 비밀번호를 입력해 주세요.') || ''; if (password !== room.password) return toast('비밀번호가 맞지 않아요.') }
  if (room.status !== 'waiting') return toast('이미 시작한 게임이라 지금은 참가할 수 없어요.')
  if (room.players.length >= room.maxPlayers) return toast('방 인원이 가득 찼어요.')
  const name = getName() === '플레이어' ? (window.prompt('플레이어 이름을 입력해 주세요.') || '플레이어') : getName()
  if (room.players.some(player => player.name === name)) return toast('이 방에서 이미 사용 중인 이름이에요.')
  setName(name); room.players.push({ id: state.currentPlayerId, name, team: room.players.length % room.teamCount, isHost: false, hand: [] }); state.room = room; state.code = room.code; state.view = 'lobby'; await persistRoom(); saveState(); subscribeRoom(); render(); toast('방에 참가했어요.')
}
function revealTurn() { if (!state.room) return; state.room.turnStarter = Math.floor(Math.random() * state.room.players.length); state.room.turnRevealed = true; persistRoom(); saveState(); render(); toast(`${state.room.players[state.room.turnStarter].name}님이 첫 차례예요.`) }
function beginGame() { if (!state.room?.turnRevealed) return toast('먼저 첫 차례를 정해 주세요.'); startGame(state.room); state.view = 'game'; persistRoom(); saveState(); render(); playShuffleSound(); if (state.soundOn) startAudio(); toast('카드를 나눴어요. 게임 시작!') }
function handleCard(card) {
  const room = state.room, player = me(room)
  if (!isMyTurn(room)) return toast('아직 내 차례가 아니에요.')
  if (!player.hand.includes(card)) return
  if (player.selectedCard === card) { delete player.selectedCard; render(); return }
  player.selectedCard = card; render()
  if (!canPlay(room, card)) toast('이 카드는 아직 놓을 수 있는 칸이 없어요. 교환할 수 있어요.')
}
function handleCell(index) {
  const room = state.room, player = me(room)
  if (!isMyTurn(room) || !player.selectedCard) return
  if (!legalCells(room, player.selectedCard).includes(index)) return toast('그 카드는 이 칸에 놓을 수 없어요.')
  const card = player.selectedCard
  finishMove(room, card, index); persistRoom(); saveState(); render()
  if (room.lastMove?.sequence) toast('시퀀스 완성! 다섯 칸이 빛나요 ✦')
}
function exchangeDeadCard() { const room = state.room, player = me(room); if (!isMyTurn(room) || !player.selectedCard || player.deadSwapUsed) return; if (canPlay(room, player.selectedCard)) return toast('아직 놓을 수 있는 칸이 있어요.'); const old = player.selectedCard; player.hand = player.hand.filter(card => card !== old); room.discard.push(old); if (room.deck.length) player.hand.push(room.deck.pop()); player.deadSwapUsed = true; delete player.selectedCard; cycleTurn(room); persistRoom(); saveState(); render(); toast('카드를 교환하고 차례를 넘겼어요.') }
function getAudioContext() {
  if (audio?.ctx) return audio.ctx
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    const ctx = new AudioContext(), master = ctx.createGain()
    master.gain.value = 0.7; master.connect(ctx.destination)
    audio = { ctx, master, interval: null }
    return ctx
  } catch { return null }
}
function playShuffleSound() {
  const ctx = getAudioContext()
  if (!ctx) return
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.42, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 1.8
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer; gain.gain.setValueAtTime(0.001, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.04); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
  source.connect(gain); gain.connect(audio.master); source.start()
  ;[0, 90, 180, 270].forEach(delay => { const click = ctx.createOscillator(), clickGain = ctx.createGain(); click.type = 'triangle'; click.frequency.value = 440 + delay; clickGain.gain.setValueAtTime(0.001, ctx.currentTime + delay / 1000); clickGain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + delay / 1000 + 0.01); clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.06); click.connect(clickGain); clickGain.connect(audio.master); click.start(ctx.currentTime + delay / 1000); click.stop(ctx.currentTime + delay / 1000 + 0.07) })
}
function startAudio() {
  const ctx = getAudioContext()
  if (!ctx || audio.interval) return
  const gain = ctx.createGain(); gain.gain.value = 0.035; gain.connect(audio.master)
  const notes = [196, 246.94, 293.66, 392, 293.66, 246.94]; let index = 0
  const playNote = () => { if (!state.soundOn) return; const oscillator = ctx.createOscillator(), noteGain = ctx.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = notes[index++ % notes.length]; noteGain.gain.setValueAtTime(0, ctx.currentTime); noteGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.08); noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5); oscillator.connect(noteGain); noteGain.connect(gain); oscillator.start(); oscillator.stop(ctx.currentTime + 2.6) }
  playNote(); audio.interval = setInterval(playNote, 2100)
}
function toggleSound() { state.soundOn = !state.soundOn; if (state.soundOn) startAudio(); else if (audio) { clearInterval(audio.interval); audio.ctx.close(); audio = null } saveState(); render(); toast(state.soundOn ? '잔잔한 테이블 BGM을 켰어요.' : 'BGM을 껐어요.') }
function wire() {
  document.querySelectorAll('[data-action]').forEach(element => element.addEventListener('click', () => {
    const action = element.dataset.action
    if (action === 'home') { clearRoomSubscription(); state.view = 'home'; state.room = null; saveState(); render() }
    if (action === 'rooms') { state.view = 'rooms'; render() }
    if (action === 'rules') { state.view = 'rules'; render() }
    if (action === 'sound') toggleSound()
    if (action === 'leave') { clearRoomSubscription(); state.view = 'home'; state.room = null; saveState(); render() }
    if (action === 'copy-code') { navigator.clipboard?.writeText(state.room.code); toast(`방 코드 ${state.room.code}를 복사했어요.`) }
    if (action === 'reveal-turn') revealTurn()
    if (action === 'start-game') beginGame()
    if (action === 'sort-number') { state.sort = 'number'; saveState(); render() }
    if (action === 'sort-suit') { state.sort = 'suit'; saveState(); render() }
    if (action === 'dead-swap') exchangeDeadCard()
    if (action === 'dismiss-celebration') { state.room.lastMove.sequence = null; persistRoom(); render() }
  }))
  document.querySelector('#createForm')?.addEventListener('submit', async event => { event.preventDefault(); await createRoom(event.currentTarget) })
  document.querySelector('#joinForm')?.addEventListener('submit', async event => { event.preventDefault(); await joinRoom(new FormData(event.currentTarget).get('code') || '') })
  document.querySelector('#visibility')?.addEventListener('change', event => document.querySelector('#passwordField')?.classList.toggle('hidden', event.target.value !== 'private'))
  document.querySelectorAll('[data-room-code]').forEach(element => element.addEventListener('click', () => joinRoom(element.dataset.roomCode)))
  document.querySelectorAll('[data-card]').forEach(element => element.addEventListener('click', () => handleCard(element.dataset.card)))
  document.querySelectorAll('[data-cell-index]').forEach(element => element.addEventListener('click', () => handleCell(Number(element.dataset.cellIndex))))
  document.querySelector('#chatForm')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget), text = String(data.get('message') || '').trim(); if (!text) return; state.room.chat = [...(state.room.chat || []), { id: state.currentPlayerId, name: me(state.room).name, text }]; persistRoom(); saveState(); render() })
}

if (state.room?.status === 'playing') state.view = 'game'
render()

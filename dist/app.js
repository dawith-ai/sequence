const app = document.getElementById('app')
const toastEl = document.getElementById('toast')
const modalRoot = document.getElementById('modal-root')

const DEFAULT_PRODUCT = {
  name: 'AirPods Max',
  brand: 'Apple',
  price: 419000,
  list_price: 419000,
  url: 'https://www.apple.com/kr/shop/product/airpods-max',
  source: 'Apple 공식 홈페이지',
  description: '음악이 주는 가장 특별한 순간, 함께.',
  image: '/assets/product-main.png',
  tags: ['무선 헤드폰','노이즈 캔슬링','공간 음향','프리미엄 사운드'],
  ai_tip: '함께 듣는 음악이 더 특별한 추억이 될 거예요.',
  category: '전자기기'
}

const DEMO_CONTRIBUTIONS = [30000,30000,30000,30000,25000,25000,20000,20000,20000,17000,15000,15000]
  .map((amount, index) => ({ id:`demo-${index}`, nickname:['지은','현우','서연','도현','채원','유나','하늘','수빈','민서','윤호','다은','예린'][index], amount, created_at:new Date(Date.now()-index*180000).toISOString() }))

const DEMO_MESSAGES = [
  {nickname:'지은', text:'생일 너무너무 축하해! 🎉 좋은 음악과 함께 더 멋진 하루 보내길 💜', created_at:new Date().toISOString()},
  {nickname:'현우', text:'좋은 선물이 될 것 같아요! 함께해서 기뻐요 😊', created_at:new Date(Date.now()-180000).toISOString()},
  {nickname:'서연', text:'정말 좋아할 것 같아요. 좋은 선물이네요 💜', created_at:new Date(Date.now()-420000).toISOString()},
  {nickname:'도현', text:'조금만 더 힘내요! 거의 다 왔어요! 🔥', created_at:new Date(Date.now()-600000).toISOString()},
  {nickname:'채원', text:'역시 우리 팀 최고예요! 💜', created_at:new Date(Date.now()-720000).toISOString()}
]

const DEFAULT_STATE = {
  route: 'home',
  product: {...DEFAULT_PRODUCT},
  selfAmount: 50000,
  selectedContribution: 30000,
  liked: false,
  config: { features:{ sharedRooms:false, ai:false, kakao:false }, kakaoJsKey:'' },
  room: null,
  roomId: null,
  aiPlan: null,
  analyzing: false,
  creating: false,
  live: false,
  sellerDraft: 10000,
  localMessages: [],
  incomingRoom: null
}

let state = loadState()
let pollTimer = null

function esc(value='') {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
}
function attr(value=''){ return esc(value) }
function won(v){ return Number(v || 0).toLocaleString('ko-KR')+'원' }
function fmtPct(v){ return Math.max(0,Math.min(100,Math.round(Number(v)||0))) }
function safeImage(url){ return /^https?:\/\//i.test(String(url||'')) || String(url||'').startsWith('/') ? String(url) : '/assets/product-main.png' }
function initials(name='친구'){ return String(name).replace('님','').slice(0,1) || '친' }
function nowLabel(iso){
  const d = new Date(iso || Date.now())
  const diff = Math.max(0, Date.now()-d.getTime())
  const min = Math.round(diff/60000)
  if(min < 1) return '방금 전'
  if(min < 60) return `${min}분 전`
  const hour = Math.round(min/60)
  if(hour < 24) return `${hour}시간 전`
  return `${Math.round(hour/24)}일 전`
}
function toast(text){
  toastEl.textContent = text
  toastEl.classList.add('show')
  clearTimeout(window.__onepiceToast)
  window.__onepiceToast=setTimeout(()=>toastEl.classList.remove('show'),2500)
}
function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem('onepice-mvp-state')||'null')
    return {...DEFAULT_STATE,...saved,product:{...DEFAULT_PRODUCT,...(saved?.product||{})},config:DEFAULT_STATE.config,room:null,aiPlan:null,live:false,incomingRoom:null}
  }catch{return structuredClone(DEFAULT_STATE)}
}
function saveState(){
  const persist={ route:state.route, product:state.product, selfAmount:state.selfAmount, selectedContribution:state.selectedContribution, liked:state.liked, roomId:state.roomId, sellerDraft:state.sellerDraft }
  localStorage.setItem('onepice-mvp-state',JSON.stringify(persist))
}
function localRoomKey(id){ return `onepice-room-${id}` }
function saveLocalRoom(room){ if(room?.id) localStorage.setItem(localRoomKey(room.id),JSON.stringify(room)) }
function loadLocalRoom(id){ try{return JSON.parse(localStorage.getItem(localRoomKey(id))||'null')}catch{return null} }
function decodeIncomingRoom(value){
  if(!value || String(value).length>16000) return null
  try{
    const room=JSON.parse(value)
    if(!room || typeof room!=='object' || !String(room.id||'').startsWith('local-')) return null
    return enrichLocalRoom(room)
  }catch{return null}
}
function shareRoomSnapshot(room){
  return {
    id:room.id,title:room.title,occasion:room.occasion,product:room.product,self_amount:room.self_amount,
    list_price:room.list_price,current_price:room.current_price,seller_subsidy:room.seller_subsidy,
    seller_offer_label:room.seller_offer_label,deadline:room.deadline,creator_message:room.creator_message,
    status:room.status,contributions:(room.contributions||[]).slice(-24),messages:(room.messages||[]).slice(0,24)
  }
}

function demoRoom(){
  const room={
    id:'demo', title:'친구의 생일 위시', occasion:'birthday', product:{...DEFAULT_PRODUCT}, self_amount:50000,
    list_price:419000, current_price:419000, seller_subsidy:0, seller_offer_label:null,
    deadline:null, creator_message:'늘 음악으로 힘이 되는 소중한 사람에게, 특별한 마음을 전하고 싶어요. 💜',
    status:'active', contributions:structuredClone(DEMO_CONTRIBUTIONS), messages:structuredClone(DEMO_MESSAGES)
  }
  return enrichLocalRoom(room)
}
function enrichLocalRoom(room){
  const friendAmount=(room.contributions||[]).reduce((s,x)=>s+Number(x.amount||0),0)
  const price=Number(room.current_price||room.list_price||room.product?.price||0)
  const secured=Number(room.self_amount||0)+friendAmount+Number(room.seller_subsidy||0)
  return {...room,friend_amount:friendAmount,secured_amount:secured,shortfall:Math.max(0,price-secured),progress:price?Math.min(100,Math.round(secured/price*100)):0,participant_count:(room.contributions||[]).length,completed:secured>=price}
}
function activeRoom(){ return state.room || demoRoom() }
function productOf(room=activeRoom()){ return {...DEFAULT_PRODUCT,...(room.product||state.product||{})} }

async function api(path, options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}})
  const data=await response.json().catch(()=>({ok:false,error:'응답을 읽지 못했어요.'}))
  if(!response.ok){ const err=new Error(data.error||`요청 실패 (${response.status})`); err.data=data; err.status=response.status; throw err }
  return data
}

async function loadConfig(){
  try{ state.config=(await api('/api/config')).features ? await (async()=>{const r=await api('/api/config'); return r})() : state.config }catch{}
}

async function refreshRoom({silent=false}={}){
  if(!state.roomId){ state.room=demoRoom(); return }
  if(state.config.features.sharedRooms && !String(state.roomId).startsWith('local-') && state.roomId!=='demo'){
    try{
      const data=await api(`/api/rooms?id=${encodeURIComponent(state.roomId)}`)
      state.room=data.room
      state.product={...DEFAULT_PRODUCT,...state.room.product,price:state.room.current_price||state.room.product?.price}
      state.live=true
      if(!silent) render()
      return
    }catch(error){ if(!silent) toast(error.message) }
  }
  state.live=false
  state.room = state.roomId==='demo' ? demoRoom() : (loadLocalRoom(state.roomId) || state.incomingRoom || demoRoom())
}

function parseLocation(){
  const qs=new URLSearchParams(location.search)
  const roomId=qs.get('room')
  const view=qs.get('view')
  state.incomingRoom=decodeIncomingRoom(qs.get('demo'))
  if(roomId){ state.roomId=roomId; state.route=view==='seller'?'seller':'room' }
  else if(location.hash){ const route=location.hash.replace('#',''); if(['home','create','explore','guide','ai'].includes(route)) state.route=route }
}
function updateUrl(route){
  if(route==='room' && state.roomId){ history.pushState({},'',`/?room=${encodeURIComponent(state.roomId)}`); return }
  if(route==='seller' && state.roomId){ history.pushState({},'',`/?room=${encodeURIComponent(state.roomId)}&view=seller`); return }
  history.pushState({},'', route==='home' ? '/' : `/#${route}`)
}
async function go(route){
  state.route=route
  saveState()
  updateUrl(route)
  if(route==='room' && state.roomId) await refreshRoom({silent:true})
  if(route==='ai') await prepareAIPlan(false)
  render()
  window.scrollTo({top:0,behavior:'smooth'})
}

function roomCalc(room=activeRoom()){
  const price=Number(room.current_price||room.list_price||productOf(room).price||0)
  const secured=Number(room.secured_amount ?? (Number(room.self_amount||0)+Number(room.friend_amount||0)+Number(room.seller_subsidy||0)))
  return { price, secured, shortfall:Math.max(0,price-secured), progress:price?fmtPct(secured/price*100):0, friendAmount:Number(room.friend_amount||0), participantCount:Number(room.participant_count ?? (room.contributions||[]).length) }
}
function progressHTML(value){ return `<div class="progress"><span style="width:${fmtPct(value)}%"></span></div>` }
function avatarStack(count=5){
  const room=activeRoom(); const names=(room.contributions||[]).slice(0,4).map(c=>initials(c.nickname)); while(names.length<4) names.push(['윤','현','서','채'][names.length])
  const extra=Math.max(0,(roomCalc(room).participantCount||count)-4)
  return `<div class="avatars">${names.map(n=>`<span class="avatar-dot">${esc(n)}</span>`).join('')}<span class="avatar-dot more">+${extra}</span></div>`
}
function navBtn(route,label,active){ return `<button data-route="${route}" class="${route===active?'active':''}">${label}</button>` }
function header(active='home'){
  return `<header class="topbar">
    <button class="brand" data-route="home" style="border:0;background:none"><span class="brand-mark"></span><span>One pice</span></button>
    <nav class="nav">${navBtn('home','홈',active)}${navBtn('room','위시룸',active)}${navBtn('explore','선물 둘러보기',active)}${navBtn('ai','AI 추천',active)}${navBtn('guide','이용방법',active)}</nav>
    <div class="top-actions"><label class="search-wrap">⌕<input id="globalSearch" placeholder="원하는 선물을 검색해보세요..." /></label><button class="bell" id="bellBtn" aria-label="알림">🔔</button><div class="profile"><span class="profile-avatar">게</span><span>게스트⌄</span></div></div>
  </header>`
}
function sourceStatus(){
  const f=state.config.features
  if(f.sharedRooms && f.ai) return '<span class="live-chip">● LIVE · AI + 공동 위시룸</span>'
  if(f.sharedRooms) return '<span class="live-chip">● LIVE · 공동 위시룸</span>'
  return '<span class="demo-chip">브라우저 데모</span>'
}
function howCard(num,icon,title,text){return `<div class="card how-card"><div class="how-num">${num}</div><div style="font-size:22px;margin-bottom:8px">${icon}</div><h3>${title}</h3><p>${text}</p></div>`}
function stat(icon,val,label,desc){return `<div class="card stat-card"><div class="stat-icon">${icon}</div><div><strong>${val}</strong><span>${label}</span><br><small>${desc}</small></div></div>`}
function productImg(product, cls=''){ return `<img class="${cls}" src="${attr(safeImage(product.image))}" data-fallback="/assets/product-main.png" alt="${attr(product.name)}" onerror="this.onerror=null;this.src='/assets/product-main.png'">` }

function home(){
  const room=activeRoom(), calc=roomCalc(room), product=productOf(room)
  const live=state.config.features.sharedRooms
  const ai=state.config.features.ai
  const stats=live
    ? [stat('◉','실시간','공유 위시룸','여러 기기에서 같은 진행률을 확인'),stat('✓','자동','완성 경로','가격·부족금액·혜택을 다시 계산'),stat('◫','3단계','핵심 흐름','생성 → 참여 → 완성')]
    : [stat('◉','브라우저','데모 위시룸','현재 화면에서 바로 흐름을 체험'),stat('✓','100%','핵심 흐름','생성 → 참여 → 완성까지 연결'),stat('◫','3단계','완성 엔진','가격·부족금액·마지막 조각 계산')]
  return `<div class="shell">${header('home')}<main class="page">
    <section class="hero"><div class="hero-grid">
      <div class="hero-copy"><div class="eyebrow">TOGETHER, A BIGGER HAPPINESS</div><h1 class="headline">작은 선물 여러 개보다,<br><span class="grad">정말 원하는 하나.</span></h1><p class="subline">친구들과 한 조각씩 마음을 모아,<br>${ai?'AI가 더 스마트하게':'완성 엔진이 단계별로'} 완성하는 새로운 선물 경험, <b>One pice.</b></p><div class="hero-actions"><button class="btn primary" data-route="create">위시 만들기　→</button><button class="btn secondary" data-route="room">▶　데모 보기</button></div><div class="hero-benefits"><span class="benefit"><i>🎁</i>함께하는 선물</span><span class="benefit"><i>✓</i>${live?'실시간 공동 위시룸':'브라우저 위시룸'}</span><span class="benefit"><i>✨</i>${ai?'AI 완성 제안':'완성 경로 계산'}</span></div><div class="hand-note">좋은 건,<br>함께할 때<br>더 특별하니까 ♥</div><img class="hero-friends" src="/assets/hero-friends.png" alt="친구들이 함께하는 모습"></div>
      <div class="card product-hero"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div class="pill orange">🔥 지금 인기 있는 위시</div>${sourceStatus()}</div><div class="product-hero-grid"><div class="product-imagebox">${productImg(product)}</div><div class="product-info"><div class="muted">${esc(product.brand)}</div><h2>${esc(product.name)}</h2><p class="muted">${esc(product.description)}</p><div class="product-price">${won(calc.price)}</div>${progressHTML(calc.progress)}<div class="progress-label"><span><b>${won(calc.secured)}</b> 모였어요</span><span><b>${calc.progress}%</b> · 목표 ${won(calc.price)}</span></div><div class="join-meta">${avatarStack()}<span class="muted">지금, ${calc.participantCount}명이<br>이 선물을 함께하고 있어요</span></div><div class="hero-cta"><button class="btn secondary share-btn">🔗 공유하기</button><button class="btn primary" data-route="room">이 위시에 참여하기　→</button></div></div></div></div>
    </div></section>
    <section class="home-lower"><div><h2 class="section-title">이렇게 시작해보세요</h2><p class="section-sub">복잡한 건 ${ai?'AI에게':'완성 엔진에'} 맡기고, 설레는 마음만 준비하세요.</p><div class="how-grid">${howCard('01','🔗','링크로 위시 생성','원하는 상품 링크를 붙여넣으면 상품명·가격·이미지를 선물용 정보로 정리해요.')}${howCard('02','👥','친구들과 한 조각씩 참여',live?'공유 링크로 들어온 친구들의 참여금액과 메시지가 같은 위시룸에 실시간 반영돼요.':'브라우저 데모에서 친구의 참여금액과 응원 메시지가 즉시 반영돼요.')}${howCard('03','✨',ai?'AI가 마지막 완성을 돕기':'완성 경로를 계산하기','현재 가격, 부족 금액, 판매자 마지막 조각을 조합해 다음 행동을 제안해요.')}</div><div class="stats">${stats.join('')}</div></div><aside class="card ai-side"><img src="/assets/home-robot.png" alt="AI 캐릭터"><h3>${ai?'AI가 찾아주는':'완성 엔진이 계산하는'}<br>더 좋은 구매 타이밍</h3><p>상품 링크와 위시룸 진행 상황을 바탕으로 마지막까지 실제 완성할 방법을 찾습니다.</p><ul><li><i>🔎</i>상품 URL 정보 구조화</li><li><i>👥</i>${live?'다른 기기에서도 같은 위시룸':'이 브라우저에서 흐름 재현'}</li><li><i>✨</i>가격·혜택·부족금액 계산</li></ul></aside></section>
  </main></div>`
}

function createPage(){
  const product=state.product, group=Math.max(0,Number(product.price||0)-state.selfAmount)
  const ai=state.config.features.ai, shared=state.config.features.sharedRooms
  const tags=(product.tags?.length?product.tags:DEFAULT_PRODUCT.tags).map(t=>`<span class="tag">${esc(t)}</span>`).join('')
  return `<div class="shell create-page">${header('room')}<main class="page"><div class="container"><div class="page-head"><div class="eyebrow">MAKE A WISH TOGETHER</div><h1 class="headline">위시 만들기</h1><p class="subline">상품 링크만 붙여넣으면, 친구들과 함께하는 특별한 선물이 시작돼요.</p><div class="create-note">좋은 건, 함께할 때<br>더 특별하니까 ♥</div></div><div class="steps"><span class="step active"><b>1</b>상품 불러오기</span><span class="step-line"></span><span class="step"><b>2</b>금액 설정</span><span class="step-line"></span><span class="step"><b>3</b>위시 정보 입력</span><span class="step-line"></span><span class="step"><b>4</b>완료</span></div>
  <div class="create-grid"><section class="card create-main"><div class="field-head"><div class="field-icon">🔗</div><h3>상품 링크를 붙여넣어주세요</h3></div><p class="field-copy">원하는 상품의 URL을 넣으면 상품명·가격·이미지를 읽어 선물용 정보로 정리해요.${ai?' AI가 연결된 환경에서는 선물 문구와 태그도 보완합니다.':' 현재는 데모 상품으로 전체 흐름을 바로 체험할 수 있어요.'}</p><div class="input-row"><input class="input" id="productUrl" value="${attr(product.url)}"/><button class="btn primary" id="analyzeBtn" ${state.analyzing?'disabled':''}>${state.analyzing?'상품 분석 중...':'✦　상품 정보 불러오기'}</button></div><div class="source-chips"><span class="source-chip">Apple</span><span class="source-chip">쿠팡</span><span class="source-chip">무신사</span><span class="source-chip">오늘의집</span><span class="source-chip">네이버 스마트스토어</span><span class="source-chip">기타 쇼핑몰</span></div>
  <div class="loaded-product"><div class="loaded-visual"><button class="like-btn" id="likeBtn">${state.liked?'♥':'♡'}</button>${productImg(product)}</div><div class="loaded-info"><span class="pill purple">✓ 상품 정보 준비 완료</span><div class="muted" style="margin-top:10px">${esc(product.brand||product.source)}</div><h3>${esc(product.name)}</h3><div class="muted">${esc(product.description)}</div><div class="tags" style="margin-top:10px">${tags}</div><div class="price">${product.price?won(product.price):'가격 확인 필요'}</div><div class="muted">${esc(product.source)}　↗</div><div class="ai-tip-box"><b>✦ AI 한 줄 팁</b><span>${esc(product.ai_tip||DEFAULT_PRODUCT.ai_tip)}</span></div></div></div>
  <div class="budget-grid"><div class="budget-card"><b>⊕　내가 부담할 금액</b><div class="muted" style="font-size:12px">내가 먼저 마음을 더해보세요. (선택사항)</div><div class="amount" id="selfAmountLabel">${won(state.selfAmount)}</div><input class="range" id="selfRange" type="range" min="0" max="${Math.max(1000,Number(product.price||419000))}" step="1000" value="${Math.min(state.selfAmount,Number(product.price||419000))}"><div class="progress-label"><span>0원</span><span>${won(product.price||419000)}</span></div></div><div class="budget-card group-budget"><b>👥　친구들과 함께 채울 금액</b><div class="amount" id="groupAmountLabel">${won(group)}</div><div class="muted">함께하는 만큼, 더 특별한 선물이 될 거예요.</div><div style="margin-top:14px">${avatarStack()}</div></div></div>
  <div class="wish-info-form"><label><span>위시룸 제목</span><input id="roomTitle" class="input" value="친구의 생일 위시"></label><label><span>마음을 담은 한마디</span><input id="creatorMessage" class="input" value="함께하는 마음이 더 특별한 선물을 만들어요. 💜"></label></div>
  <div class="create-actions"><button class="btn secondary" data-route="home">←　이전으로</button><button class="btn primary" id="createRoomBtn" ${state.creating?'disabled':''}>${state.creating?'위시룸 만드는 중...':'위시룸 생성하기　→'}</button></div></section>
  <aside class="card guide"><div class="guide-top"><img src="/assets/guide-robot.png" alt="AI 가이드"><div><span class="pill purple">${ai?'AI 추천 ✨':'데모 추천'}</span><h3>${ai?'AI가 제안하는':'완성 엔진이 제안하는'}<br>위시 가이드</h3><div class="muted">이런 점을 고려해보세요!</div></div></div><div class="guide-item"><div><b>👥 추천 참여 인원</b><small>이 가격대는 보통 4~8명이 함께해요.</small></div><strong>4 ~ 8명</strong></div><div class="guide-item"><div><b>◷ 예상 1인 부담금</b><small>친구 6명이 함께하면 이 정도예요.</small></div><strong>${won(Math.ceil(group/6/1000)*1000)}</strong></div><div class="guide-item"><div><b>♡ 좋은 타이밍이에요</b><small>생일·기념일처럼 마음을 함께 모으는 순간에 어울려요.</small></div><strong>생일 · 기념일</strong></div><div class="guide-item"><div><b>✦ ${ai?'AI':'추천'} 한 줄 팁</b><small>“${esc(product.ai_tip||DEFAULT_PRODUCT.ai_tip)}”</small></div></div><h3 class="option-title">추천 분담금 옵션</h3><p class="option-copy">친구들이 부담 없이 참여할 수 있는 금액을 설정해보세요.</p><div class="options">${option(5000,'가볍게 참여하기','8명 이상 추천')}${option(10000,'부담 없는 선택','5~8명 추천')}${option(30000,'더 빠르게 완성','3~5명 추천',true)}</div><button class="direct-option" id="directAmountCreate">✎ 직접 금액 설정하기</button><div class="backend-note">${shared?'✓ 실제 공유 가능한 위시룸 DB 연결됨':'ⓘ 브라우저 데모: 현재 기기에 저장되며, 공유 버튼은 현재 상태가 담긴 데모 링크를 만들어요.'}</div></aside></div></div></main></div>`
}
function option(amount,label,rec,featured=false){ return `<button class="option ${state.selectedContribution===amount?'active':''}" data-option="${amount}">${featured?'<span class="option-badge">👑 가장 많이 선택해요</span>':''}<strong>${won(amount)}</strong><small>${label}<br>(${rec})</small></button>` }

function roomPage(){
  const room=activeRoom(), product=productOf(room), calc=roomCalc(room), filled=Math.max(0,Math.round(calc.progress/100*8))
  const messages=(room.messages?.length?room.messages:DEMO_MESSAGES).slice(0,8)
  return `<div class="shell room-page">${header('room')}<main class="page"><div class="container"><div class="room-top"><div class="title-block"><button class="btn soft" data-route="home" style="height:40px;padding:0 14px">← 전체 위시룸 보기</button><h1 class="headline">${esc(room.title||'친구의 생일 위시')}　🎂</h1><p class="subline">좋은 친구들과 함께 만드는 특별한 선물이에요!</p></div><div class="room-actions"><div class="d-day">📅　D-7　선물일까지</div><button class="btn kakao share-btn">🟨　카카오톡으로 공유</button><button class="btn secondary" id="roomMenuBtn">•••</button></div></div>
  <div class="room-grid"><div class="room-main"><section class="card wish-card"><div class="wish-product-grid"><div class="wish-visual"><div class="confetti"><span></span><span></span><span></span></div>${productImg(product)}<div class="wish-hand">좋은 음악이<br>더 좋은 순간을 만든다 ♫</div></div><div class="wish-info"><div style="display:flex;justify-content:space-between;gap:10px"><div><div class="muted">${esc(product.brand)}</div><h2>${esc(product.name)}</h2></div>${state.live?'<span class="live-chip">● LIVE</span>':'<span class="demo-chip">DEMO</span>'}</div><div class="muted">${esc(product.description)}</div><div class="wish-price">${won(calc.price)}</div><div class="pill purple">${calc.completed?'선물이 완성됐어요! 🎉':'조금만 더! 멋진 선물이 완성돼요 💜'}</div><div class="puzzle">${Array.from({length:8},(_,i)=>`<div class="piece ${i<filled?'filled':''}"></div>`).join('')}</div><div class="room-progress-row"><span class="room-pct">${calc.progress}%</span><span class="room-collected">${won(calc.secured)} 모였어요!</span></div>${progressHTML(calc.progress)}<div class="room-meta"><span>👥 ${calc.participantCount}명이 함께하고 있어요</span><span>목표 ${won(calc.price)}</span><span>${calc.completed?'완성!':won(calc.shortfall)+' 남았어요'}</span></div>${Number(room.seller_subsidy||0)>0?`<div class="seller-inline">🎁 판매자가 마지막 조각 <b>${won(room.seller_subsidy)}</b>을 보탰어요.</div>`:''}</div></div></section>
  <section class="card contribution"><div class="contribution-head"><div><h3>💜　한 조각 보태기</h3><div class="muted">작은 마음이 모여, 정말 특별한 선물이 돼요.</div></div><div class="privacy">🔒 내가 낸 금액은 친구들에게 공개되지 않아요.</div></div><div class="contributor-fields"><input class="input" id="nicknameInput" placeholder="닉네임" value="친구"><input class="input" id="contributionMessage" placeholder="짧은 응원 메시지 (선택)"></div><div class="amount-options">${amountButton(5000)}${amountButton(10000)}${amountButton(30000,true)}<button class="amount-btn" data-custom="1">직접 입력</button></div><button class="btn primary full" id="contributeBtn" ${calc.completed?'disabled':''}>🎁　${calc.completed?'선물 완성됨':won(state.selectedContribution)+' 한 조각 보태기　✨'}</button></section></div>
  <div style="display:grid;gap:14px"><section class="card friends-panel"><div style="display:flex;justify-content:space-between;align-items:center"><h3>함께하는 친구들</h3><button class="text-btn" id="allFriendsBtn">모두 보기　→</button></div><div class="friend-big">${avatarStack()}</div><div style="font-size:21px;font-weight:950">${calc.participantCount}명이 함께하고 있어요!</div><div class="friend-stats"><div class="friend-stat">${calc.participantCount}명<small>참여 친구</small></div><div class="friend-stat">${won(calc.participantCount?Math.round(calc.friendAmount/calc.participantCount):0)}<small>평균 참여 금액</small></div><div class="friend-stat">${calc.progress}%<small>달성률</small></div></div></section><section class="card feed-panel"><h3>💬　실시간 응원 메시지</h3><div class="feed">${messages.map(m=>`<div class="feed-item"><div class="feed-avatar">${esc(initials(m.nickname||m.name))}</div><div><div><b>${esc(m.nickname||m.name||'친구')}</b><span class="feed-time">${esc(m.time||nowLabel(m.created_at))}</span></div><p>${esc(m.text)}</p></div></div>`).join('')}</div><div class="comment-row"><input id="commentInput" placeholder="응원메시지를 남겨보세요..."><button id="commentBtn">☺</button></div></section></div>
  <aside class="card invite-panel"><h3>이런 카드로<br>친구들을 초대해보세요!</h3><div class="invite-phone"><div class="invite-screen"><div class="brand" style="justify-content:center;font-size:16px"><span class="brand-mark" style="width:25px;height:25px"></span>One pice</div><h3 style="margin:12px 0 4px">${esc(room.title||'친구의 생일 위시')} 🎂</h3><div class="muted" style="font-size:12px">좋은 사람들이 함께 만드는<br>더 특별한 선물</div><div class="invite-thumb">${productImg(product)}</div>${progressHTML(calc.progress)}<div class="progress-label"><span>${won(calc.secured)}</span><b>${calc.progress}%</b></div><div style="margin:12px 0">${avatarStack()}</div><button class="btn primary full share-btn">지금 함께하기　→</button></div></div><div class="hand">함께하는 마음이<br>더 큰 행복이 되니까 ♥</div></aside></div></div></main></div>`
}
function amountButton(amount,featured=false){ return `<button class="amount-btn ${state.selectedContribution===amount?'active':''} ${featured?'featured':''}" data-amount="${amount}">${won(amount)}</button>` }

function aiFallbackPlan(room){
  const calc=roomCalc(room), current=calc.price, demoDiscount=(room.id==='demo'&&current===419000)?399000:current
  return { old_price:Number(room.list_price||current), current_price:current, recommended_price:demoDiscount, discount_found:demoDiscount<current, saving:Math.max(0,current-demoDiscount), secured_amount:calc.secured, shortfall_before:calc.shortfall, shortfall_after:Math.max(0,demoDiscount-calc.secured), seller_subsidy:Number(room.seller_subsidy||0), recommended_action:'invite_or_fill_gap', ai_copy:null, ai_used:false }
}
async function prepareAIPlan(force=true){
  const room=activeRoom()
  if(force) state.aiPlan=null
  if(state.config.features.sharedRooms && state.roomId && state.roomId!=='demo' && !String(state.roomId).startsWith('local-')){
    try{ const data=await api(`/api/ai-plan?room_id=${encodeURIComponent(state.roomId)}`); state.aiPlan=data.plan; return data.plan }catch(error){ if(force) toast('실시간 가격 확인에 실패해 현재 데이터로 제안할게요.') }
  }
  state.aiPlan=aiFallbackPlan(room); return state.aiPlan
}
function aiPage(){
  const room=activeRoom(), product=productOf(room), calc=roomCalc(room), plan=state.aiPlan||aiFallbackPlan(room)
  const recPrice=Number(plan.recommended_price||calc.price), recShort=Math.max(0,recPrice-calc.secured), recProgress=recPrice?fmtPct(calc.secured/recPrice*100):0
  const headline=plan.ai_copy?.headline|| (plan.discount_found?(plan.ai_used?'AI가 더 좋은 가격을 찾아왔어요!':'데모 가격 시나리오를 반영했어요.'):'완성할 수 있는 경로를 계산했어요!')
  const reason=plan.ai_copy?.reason|| (plan.discount_found?`${won(plan.saving)} 가격 변화를 반영하면 부족 금액이 ${won(recShort)}으로 줄어들어요.`:`현재 ${won(calc.shortfall)}이 부족해요. 친구 한 명의 참여나 판매자 마지막 조각을 활용할 수 있어요.`)
  const subsidy=Number(room.seller_subsidy||0)
  return `<div class="shell">${header('ai')}<div class="ai-page"><aside class="side-nav"><div class="side-brand"><span class="brand-mark"></span><span>원피스<br><small style="font-weight:600;color:#7e7d96">One pice</small></span></div><div class="side-menu"><button data-route="home">⌂　홈</button><button class="active">✨　AI 선물 제안</button><button data-route="create">🎁　선물하기</button><button data-route="room">👥　함께하는 선물</button><button data-route="seller">▣　마지막 조각</button><button id="wishlistBtn">♡　내 위시리스트</button></div><div class="side-illustration">좋은 사람들이<br>좋은 선물을 만들어요 ♡<br><br><span style="font-family:Inter;color:#67667d;font-size:13px">작은 마음이 큰 기쁨이 되는 세상</span></div></aside><main class="ai-content"><div class="ai-grid"><section class="card ai-product"><button class="btn soft" data-route="room" style="height:40px">← 위시룸으로 돌아가기</button><div class="ai-product-main" style="margin-top:14px"><div class="ai-product-visual">${productImg(product)}</div><div class="ai-copy"><span class="pill purple">생일 선물</span><h1>${esc(product.name)}를<br>끝까지 완성하는 순간</h1><div class="muted" style="font-size:18px">${esc(product.category||'프리미엄 선물')}</div><div class="new-price">${won(recPrice)} ${plan.discount_found?`<span class="old-price">${won(calc.price)}</span>`:''}</div>${plan.discount_found?`<span class="pill purple">✦ 현재 링크에서 ${won(plan.saving)} 더 좋은 가격 발견</span>`:'<span class="pill purple">✦ 현재 가격 기준 완성 전략</span>'}<div class="features"><div class="feature">🔗<br>상품 URL<br>재분석</div><div class="feature">〽<br>현재 진행률<br>${recProgress}%</div><div class="feature">▣<br>부족 금액<br>${won(recShort)}</div><div class="feature">🎁<br>판매자 조각<br>${won(subsidy)}</div></div></div></div><div class="ai-complete-head"><b>이 선물의 완성도</b><strong>${recProgress}%</strong></div>${progressHTML(recProgress)}<div class="big-money"><span>${won(calc.secured)} <span class="muted">/ ${won(recPrice)}</span></span><span class="shortfall">${recShort?won(recShort)+' 부족':'완성 가능 🎉'}</span></div><div class="join-meta">${avatarStack()}<span class="muted">지금까지 ${calc.participantCount}명이 함께하고 있어요 💜</span></div><div class="card" style="padding:13px 16px;margin-top:10px;border-radius:14px;box-shadow:none"><b>위시 한마디</b>　<span class="muted">“${esc(room.creator_message||'함께하는 마음이 더 특별한 선물을 만들어요.')}”</span></div></section>
  <div class="ai-side-col"><div class="ai-banner"><img src="/assets/ai-robot-banner.png" alt="AI robot"></div><section class="card recommend-card"><div style="display:flex;justify-content:space-between;gap:12px"><h3>✦　원피스 AI 완성 제안</h3><span class="pill purple">${plan.ai_used?'Gemini AI 분석':'실시간 계산'}</span></div><div class="news"><b>${esc(headline)} 🎉</b><br>${esc(reason)}</div><div class="price-compare"><div class="price-box"><small>현재 목표</small><strong>${won(calc.price)}</strong></div><div class="arrow">→</div><div class="price-box"><small style="color:var(--p)">AI 추천 목표</small><strong style="color:var(--p)">${won(recPrice)}</strong></div></div><div class="recommend-actions"><button class="btn primary" id="refreshAiBtn">🔎　가격 다시 확인</button><button class="btn ${plan.discount_found?'primary':'secondary'}" id="applyDiscountBtn" ${plan.discount_found?'':'disabled'}>↻　추천 가격 적용</button></div>${recShort>0?`<button class="btn secondary full" id="payGapBtn" style="margin-top:10px">⚡　내가 ${won(recShort)} 채우기</button>`:''}</section><section class="card seller-card"><div style="display:flex;justify-content:space-between;gap:12px"><h3>🧩　판매자 마지막 조각</h3><span class="pill purple">광고가 선물을 완성하는 순간</span></div><div class="seller-row"><div class="seller-gift">🎁</div><div><b style="font-size:18px">${subsidy?won(subsidy)+' 지원 중':'판매자 제안을 받아보세요'}</b><p>${subsidy?esc(room.seller_offer_label||'판매자가 마지막 조각을 보탰어요.'):'이미 구매 의사가 모인 위시에 판매자가 실제 부족금액 일부를 지원할 수 있어요.'}</p></div></div><button class="btn primary full" data-route="seller">판매자 마지막 조각 데모 보기　→</button>${calc.completed?`<div class="completion-toast show"><h3>선물이 완성되었어요! 🎉</h3><p>친구들의 마음과 AI가 찾은 혜택이 만나, 정말 원하는 하나가 완성되었습니다.</p><button class="btn soft" data-route="room" style="margin-top:12px">완성된 위시룸 보기　→</button></div>`:''}</section></div></div></main></div></div>`
}

function sellerPage(){
  const room=activeRoom(), product=productOf(room), calc=roomCalc(room), max=Math.max(0,calc.shortfall), draft=Math.min(state.sellerDraft||10000,max||10000)
  const conversion=calc.price?Math.round(calc.secured/calc.price*100):0
  return `<div class="shell seller-page">${header('ai')}<main class="page"><div class="container"><div class="seller-hero"><div><div class="eyebrow">LAST PIECE FOR SELLERS</div><h1 class="headline">광고가 상품을 보여주는 대신,<br><span class="grad">선물을 완성합니다.</span></h1><p class="subline">이미 친구들의 실제 결제 의사가 모인 위시에만 마지막 혜택을 제안하세요.</p></div><button class="btn secondary" data-route="room">소비자 위시룸 보기　→</button></div><div class="seller-dashboard-grid"><section class="card seller-demand-card"><div class="seller-demand-product">${productImg(product)}</div><div><span class="pill purple">구매 직전 수요</span><h2>${esc(product.name)}</h2><div class="seller-kpis"><div><small>현재 목표</small><b>${won(calc.price)}</b></div><div><small>이미 확보</small><b>${won(calc.secured)}</b></div><div><small>부족금액</small><b class="pink-text">${won(calc.shortfall)}</b></div><div><small>구매 완성도</small><b>${conversion}%</b></div></div>${progressHTML(calc.progress)}<p class="muted">노출·클릭이 아니라, 실제로 돈이 모인 구매 직전 수요입니다.</p></div></section><section class="card seller-offer-form"><h3>🎁 마지막 조각 제안</h3><p class="muted">지원금은 현재 부족금액을 넘지 않도록 자동 제한됩니다.</p><label class="seller-label">지원 금액<input id="sellerAmount" class="input" type="number" min="0" max="${max}" step="1000" value="${draft}"></label><label class="seller-label">제안 문구<input id="sellerLabel" class="input" value="브랜드가 마지막 조각을 보탭니다."></label><div class="seller-preview"><span>지원 후 예상 부족금액</span><b id="sellerRemaining">${won(Math.max(0,max-draft))}</b></div><button class="btn primary full" id="sellerOfferBtn" ${max<=0?'disabled':''}>${max<=0?'이미 선물이 완성됐어요':'마지막 조각 제안하기'}</button></section></div><div class="seller-business-grid"><div class="card seller-biz-card"><span>01</span><b>확정 수요</b><p>누군가가 이미 위시에 참여해 실제 금액을 쌓아둔 상태</p></div><div class="card seller-biz-card"><span>02</span><b>전환 직전</b><p>광고비를 불특정 노출이 아니라 구매 완료에 사용</p></div><div class="card seller-biz-card"><span>03</span><b>새로운 광고지표</b><p>Wish → Contribution → Completion으로 성과를 측정</p></div></div></div></main></div>`
}

function explorePage(){
  const product=state.product
  return `<div class="shell">${header('explore')}<main class="page"><div class="container"><div class="page-head"><div class="eyebrow">POPULAR WISHES</div><h1 class="headline">지금, 이런 위시가 인기예요</h1><p class="subline">카테고리를 넘어 ‘정말 원하는 하나’를 함께 완성해보세요.</p></div><div class="explore-grid">${['전자기기','패션','여행 / 경험'].map((cat,i)=>`<div class="card explore-card"><div class="explore-image">${productImg(product)}</div><span class="pill ${i===0?'orange':'purple'}">${cat}</span><h3>${i===0?esc(product.name):i===1?'함께 고르는 프리미엄 위시':'주말 여행 경험 위시'}</h3><p>${i===0?won(product.price):i===1?'350,000원':'780,000원'}</p><button class="btn ${i===0?'primary':'secondary'} full" ${i===0?'data-route="room"':'id="futureWishBtn"'}>${i===0?'이 위시 보기':'확장 데모 보기'}</button></div>`).join('')}</div></div></main></div>`
}
function guidePage(){return `<div class="shell">${header('guide')}<main class="page"><div class="container"><div class="page-head"><div class="eyebrow">HOW IT WORKS</div><h1 class="headline">3분이면 이해되는 One pice</h1><p class="subline">상품을 가져오고, 마음을 모으고, AI가 마지막까지 실제 완성을 돕습니다.</p></div><div class="how-grid" style="margin-top:24px">${howCard('01','🔗','실제 상품 URL 분석','상품 페이지의 메타데이터를 읽고 Gemini가 상품명·가격·카테고리·선물 문구를 구조화합니다.')}${howCard('02','👥','공유 가능한 위시룸','Supabase에 위시룸과 참여 내역을 저장해 다른 휴대폰에서도 같은 진행률을 봅니다.')}${howCard('03','✨','AI Completion Engine','현재 가격과 모인 금액, 판매자 지원을 다시 계산해 실제 완성 가능한 경로만 제안합니다.')}</div><div class="card architecture"><div><b>Product URL</b><span>실제 상품</span></div><i>→</i><div><b>AI Analyze</b><span>Gemini</span></div><i>→</i><div><b>Shared Room</b><span>Supabase</span></div><i>→</i><div><b>Completion</b><span>AI + Seller</span></div></div></div></main></div>`}

function render(){
  stopPolling()
  const route=state.route
  app.innerHTML = route==='home'?home():route==='create'?createPage():route==='room'?roomPage():route==='ai'?aiPage():route==='seller'?sellerPage():route==='explore'?explorePage():guidePage()
  wire()
  if(route==='room' && state.live) startPolling()
}

function stopPolling(){ if(pollTimer){clearInterval(pollTimer);pollTimer=null} }
function startPolling(){
  stopPolling()
  pollTimer=setInterval(async()=>{
    if(document.visibilityState!=='visible') return
    try{ await refreshRoom({silent:true}); if(state.route==='room') render() }catch{}
  },3500)
}

async function analyzeProductFromUI(){
  const input=document.getElementById('productUrl'), button=document.getElementById('analyzeBtn')
  const url=input?.value.trim()
  if(!url){toast('상품 링크를 입력해주세요.');return}
  if(url===DEFAULT_PRODUCT.url && !state.config.features.sharedRooms){
    state.product={...DEFAULT_PRODUCT}
    state.selfAmount=Math.min(state.selfAmount,state.product.price)
    saveState(); toast(state.config.features.ai?'데모 상품 정보를 준비했어요. 실제 상품 URL은 Gemini로 분석합니다.':'데모 상품 정보를 준비했어요.'); render(); return
  }
  state.analyzing=true; if(button){button.disabled=true;button.textContent='AI가 상품을 분석 중...'}
  try{
    const data=await api('/api/analyze',{method:'POST',body:JSON.stringify({url})})
    state.product={...DEFAULT_PRODUCT,...data.product,image:data.product.image||'/assets/product-main.png'}
    state.selfAmount=Math.min(state.selfAmount,state.product.price)
    saveState(); toast(data.mode==='ai'?'Gemini가 상품 정보를 분석했어요 ✨':'상품 메타데이터를 불러왔어요.')
  }catch(error){
    toast(`${error.message} · 데모 상품으로 계속할 수 있어요.`)
    state.product={...state.product,url,source:sourceFrom(url)}
  }finally{state.analyzing=false;render()}
}

async function createRoomFromUI(){
  if(!state.product.price){ toast('먼저 가격이 확인되는 상품을 불러와주세요.'); return }
  const title=document.getElementById('roomTitle')?.value.trim()||'친구의 생일 위시'
  const creatorMessage=document.getElementById('creatorMessage')?.value.trim()||'함께하는 마음이 더 특별한 선물을 만들어요. 💜'
  state.creating=true; render()
  try{
    if(state.config.features.sharedRooms){
      const data=await api('/api/rooms',{method:'POST',body:JSON.stringify({title,product:state.product,self_amount:state.selfAmount,creator_message:creatorMessage,occasion:'birthday'})})
      state.room=data.room; state.roomId=data.room.id; state.live=true
      toast('실제 공유 가능한 위시룸이 만들어졌어요 🎁')
    }else{
      const id='local-'+crypto.randomUUID()
      const room=enrichLocalRoom({id,title,occasion:'birthday',product:{...state.product},self_amount:state.selfAmount,list_price:state.product.price,current_price:state.product.price,seller_subsidy:0,seller_offer_label:null,creator_message:creatorMessage,status:'active',contributions:[],messages:[]})
      state.room=room; state.roomId=id; state.live=false; saveLocalRoom(room)
      toast('데모 위시룸이 만들어졌어요. Supabase 연결 시 친구 기기와 실시간 공유됩니다.')
    }
    state.route='room'; state.creating=false; saveState(); updateUrl('room'); render(); window.scrollTo({top:0,behavior:'smooth'})
  }catch(error){ state.creating=false; toast(error.message); render() }
}

async function contributeFromUI(){
  const room=activeRoom(), calc=roomCalc(room)
  const amount=Math.min(Number(state.selectedContribution||0),calc.shortfall)
  if(amount<=0){toast('이미 선물이 완성되었어요! 🎉');return}
  const nickname=document.getElementById('nicknameInput')?.value.trim()||'친구'
  const message=document.getElementById('contributionMessage')?.value.trim()||`${won(amount)}의 마음을 한 조각 보탰어요 💜`
  try{
    if(state.live){
      const data=await api('/api/contributions',{method:'POST',body:JSON.stringify({room_id:state.roomId,amount,nickname,message})})
      state.room=data.room
    }else{
      room.contributions=[...(room.contributions||[]),{id:crypto.randomUUID(),nickname,amount,created_at:new Date().toISOString()}]
      room.messages=[{nickname,text:message,created_at:new Date().toISOString()},...(room.messages||[])]
      state.room=enrichLocalRoom(room); saveLocalRoom(state.room)
    }
    toast(`${won(amount)}의 마음이 더해졌어요 💜`); render()
    if(roomCalc(activeRoom()).shortfall<=50000) setTimeout(()=>toast(`${state.config.features.ai?'AI가':'완성 엔진이'} 완성 방법을 찾을 수 있어요 ✨`),700)
  }catch(error){toast(error.message)}
}

async function addMessageFromUI(){
  const text=document.getElementById('commentInput')?.value.trim(); if(!text)return
  try{
    if(state.live){ const data=await api('/api/messages',{method:'POST',body:JSON.stringify({room_id:state.roomId,nickname:'친구',text})}); state.room=data.room }
    else{ const room=activeRoom(); room.messages=[{nickname:'친구',text,created_at:new Date().toISOString()},...(room.messages||[])]; state.room=enrichLocalRoom(room); saveLocalRoom(state.room) }
    toast('응원 메시지를 남겼어요'); render()
  }catch(error){toast(error.message)}
}

async function applyRecommendedPrice(){
  const room=activeRoom(), plan=state.aiPlan||aiFallbackPlan(room), price=Number(plan.recommended_price||roomCalc(room).price)
  if(price>=roomCalc(room).price){toast('현재 가격보다 더 낮은 가격이 아직 확인되지 않았어요.');return}
  try{
    if(state.live){ const data=await api('/api/room-action',{method:'POST',body:JSON.stringify({room_id:state.roomId,action:'apply_price',price})}); state.room=data.room }
    else{ room.current_price=price; state.room=enrichLocalRoom(room); saveLocalRoom(state.room) }
    state.aiPlan=null; toast(`새 목표금액 ${won(price)}을 적용했어요.`); await prepareAIPlan(false); render()
  }catch(error){toast(error.message)}
}

async function fillGapFromAI(){
  const room=activeRoom(), plan=state.aiPlan||aiFallbackPlan(room), target=Number(plan.recommended_price||roomCalc(room).price)
  if(target<roomCalc(room).price) await applyRecommendedPrice()
  const current=roomCalc(activeRoom()), amount=current.shortfall
  if(amount<=0){toast('이미 선물이 완성되었어요! 🎉');return}
  state.selectedContribution=amount
  try{
    if(state.live){ const data=await api('/api/contributions',{method:'POST',body:JSON.stringify({room_id:state.roomId,amount,nickname:'위시 만든 사람',message:`마지막 ${won(amount)}을 채워 선물을 완성했어요 🎉`})}); state.room=data.room }
    else{ const r=activeRoom(); r.contributions=[...(r.contributions||[]),{id:crypto.randomUUID(),nickname:'위시 만든 사람',amount,created_at:new Date().toISOString()}]; r.messages=[{nickname:'One pice',text:'마지막 조각이 채워져 선물이 완성됐어요! 🎉',created_at:new Date().toISOString()},...(r.messages||[])]; state.room=enrichLocalRoom(r); saveLocalRoom(state.room) }
    toast('마지막 조각을 채워 선물이 완성됐어요 🎉'); state.aiPlan=null; render()
  }catch(error){toast(error.message)}
}

async function submitSellerOffer(){
  const amount=Math.max(0,Number(document.getElementById('sellerAmount')?.value||0)); const label=document.getElementById('sellerLabel')?.value.trim()||'브랜드가 마지막 조각을 보탭니다.'
  const room=activeRoom()
  try{
    if(state.live){ const data=await api('/api/seller-offer',{method:'POST',body:JSON.stringify({room_id:state.roomId,subsidy:amount,label})}); state.room=data.room }
    else{ room.seller_subsidy=Math.min(amount,roomCalc(room).shortfall); room.seller_offer_label=label; state.room=enrichLocalRoom(room); saveLocalRoom(state.room) }
    toast('판매자 마지막 조각 제안이 위시룸에 반영됐어요 🎁'); render()
  }catch(error){toast(error.message)}
}

function wire(){
  document.querySelectorAll('.demo-chip').forEach(el=>{if(el.textContent.trim()==='DEMO') el.textContent='브라우저 데모'})
  const aiBadge=document.querySelector('.recommend-card .pill')
  if(aiBadge) aiBadge.textContent=state.aiPlan?.ai_used?'Gemini AI 분석':'브라우저 계산'
  const aiHeading=document.querySelector('.recommend-card h3')
  if(aiHeading && !state.config.features.ai) aiHeading.textContent='✦　One pice 완성 제안'
  const tipHeading=document.querySelector('.ai-tip-box b')
  if(tipHeading && !state.config.features.ai) tipHeading.textContent='✦ 추천 한 줄 팁'
  const completionCopy=document.querySelector('.completion-toast p')
  if(completionCopy && !state.config.features.ai) completionCopy.textContent='친구들의 마음과 완성 경로 계산이 만나, 정말 원하는 하나가 완성되었습니다.'
  const aiOffer=document.querySelector('.ai-copy .pill:last-of-type')
  if(aiOffer && !state.aiPlan?.ai_used && state.aiPlan?.discount_found) aiOffer.textContent='✦ 데모 가격 시나리오 반영'
  document.querySelectorAll('[data-route]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.route)))
  document.querySelectorAll('.share-btn').forEach(el=>el.addEventListener('click',shareRoom))
  document.getElementById('analyzeBtn')?.addEventListener('click',analyzeProductFromUI)
  document.getElementById('likeBtn')?.addEventListener('click',()=>{state.liked=!state.liked;saveState();render();toast(state.liked?'위시리스트에 저장했어요 ♥':'위시리스트에서 뺐어요')})
  document.getElementById('selfRange')?.addEventListener('input',e=>{state.selfAmount=Number(e.target.value);document.getElementById('selfAmountLabel').textContent=won(state.selfAmount);document.getElementById('groupAmountLabel').textContent=won(Math.max(0,Number(state.product.price||0)-state.selfAmount));saveState()})
  document.querySelectorAll('[data-option]').forEach(el=>el.addEventListener('click',()=>{state.selectedContribution=Number(el.dataset.option);saveState();render()}))
  document.getElementById('directAmountCreate')?.addEventListener('click',()=>{const n=promptAmount();if(n){state.selectedContribution=n;saveState();render()}})
  document.getElementById('createRoomBtn')?.addEventListener('click',createRoomFromUI)
  document.querySelectorAll('[data-amount]').forEach(el=>el.addEventListener('click',()=>{state.selectedContribution=Number(el.dataset.amount);saveState();render()}))
  document.querySelector('[data-custom]')?.addEventListener('click',()=>{const n=promptAmount();if(n){state.selectedContribution=n;saveState();render()}})
  document.getElementById('contributeBtn')?.addEventListener('click',contributeFromUI)
  document.getElementById('commentBtn')?.addEventListener('click',addMessageFromUI)
  document.getElementById('commentInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')addMessageFromUI()})
  document.getElementById('refreshAiBtn')?.addEventListener('click',async()=>{toast('상품 가격과 위시룸 상태를 다시 확인하고 있어요...');await prepareAIPlan(true);render();toast(`${state.config.features.ai?'AI 완성 제안':'완성 경로'}를 업데이트했어요 ✨`)})
  document.getElementById('applyDiscountBtn')?.addEventListener('click',applyRecommendedPrice)
  document.getElementById('payGapBtn')?.addEventListener('click',fillGapFromAI)
  document.getElementById('sellerOfferBtn')?.addEventListener('click',submitSellerOffer)
  document.getElementById('sellerAmount')?.addEventListener('input',e=>{state.sellerDraft=Number(e.target.value||0);const el=document.getElementById('sellerRemaining');if(el)el.textContent=won(Math.max(0,roomCalc(activeRoom()).shortfall-state.sellerDraft))})
  document.getElementById('roomMenuBtn')?.addEventListener('click',showRoomMenu)
  document.getElementById('allFriendsBtn')?.addEventListener('click',showFriendsModal)
  document.getElementById('bellBtn')?.addEventListener('click',()=>toast('새 알림이 생기면 여기서 알려드릴게요 🔔'))
  document.getElementById('wishlistBtn')?.addEventListener('click',()=>toast('이 데모에서는 현재 위시가 저장되어 있어요 ♥'))
  document.querySelectorAll('#futureWishBtn').forEach(el=>el.addEventListener('click',()=>toast('전자기기 → 패션 → 여행/경험으로 확장 가능한 구조예요.')))
  document.getElementById('globalSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){toast(`“${e.target.value}” 검색 데모를 열었어요.`);go('explore')}})
}
function promptAmount(){ const v=prompt('보탤 금액을 입력해주세요 (원)','15000'); const n=Math.round(Number(v)||0); return n>=1000?n:0 }
function sourceFrom(url){try{const h=new URL(url).hostname.replace('www.','');if(h.includes('apple'))return 'Apple 공식 홈페이지';if(h.includes('coupang'))return '쿠팡';if(h.includes('musinsa'))return '무신사';if(h.includes('naver'))return '네이버';return h}catch{return '온라인 쇼핑몰'}}

function shareUrl(){
  if(!state.roomId || state.roomId==='demo') return location.href
  const url=new URL('/',location.origin)
  url.searchParams.set('room',state.roomId)
  if(!state.config.features.sharedRooms && String(state.roomId).startsWith('local-')) url.searchParams.set('demo',JSON.stringify(shareRoomSnapshot(activeRoom())))
  return url.toString()
}
async function ensureKakao(){
  if(!state.config.features.kakao || !state.config.kakaoJsKey) return false
  if(window.Kakao?.isInitialized?.()) return true
  if(!window.Kakao){
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://t1.kakaocdn.net/kakao_js_sdk/2.7.3/kakao.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})
  }
  if(window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(state.config.kakaoJsKey)
  return Boolean(window.Kakao?.isInitialized?.())
}
async function shareRoom(){
  const room=activeRoom(), calc=roomCalc(room), product=productOf(room), url=shareUrl()
  try{
    if(await ensureKakao()){
      window.Kakao.Share.sendDefault({objectType:'feed',content:{title:`🎁 ${room.title||'친구의 위시'}`,description:`${calc.progress}% 완성 · ${won(calc.shortfall)} 남았어요`,imageUrl:safeImage(product.image).startsWith('http')?safeImage(product.image):`${location.origin}/assets/product-main.png`,link:{mobileWebUrl:url,webUrl:url}},buttons:[{title:'한 조각 보태기',link:{mobileWebUrl:url,webUrl:url}}]})
      return
    }
  }catch{}
  if(navigator.share){ try{await navigator.share({title:'One pice 위시룸',text:`선물이 ${calc.progress}% 완성됐어요. 한 조각 함께해 주세요!`,url});return}catch{} }
  showShareModal(url)
}
function showShareModal(url){
  const room=activeRoom(), calc=roomCalc(room)
  modalRoot.innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><h3>친구에게 위시룸 공유</h3><p>${state.config.features.kakao?'카카오톡 공유 또는':'공유 링크를 복사해'} 친구를 초대할 수 있어요.</p><div class="share-card"><b>🎁 ${esc(room.title||'친구의 위시')} · ${calc.progress}% 완성</b><span>지금 ${calc.participantCount}명이 함께하고 있어요.<br>${won(calc.shortfall)}만 더 모이면 선물이 완성돼요.</span></div><div class="copy-row"><input class="input" value="${attr(url)}" readonly><button class="btn primary" id="copyLink">복사</button></div><div class="modal-actions"><button class="btn secondary" id="closeModal">닫기</button></div></div></div>`
  document.getElementById('closeModal').onclick=()=>modalRoot.innerHTML=''
  document.getElementById('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')modalRoot.innerHTML=''}
  document.getElementById('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('공유 링크를 복사했어요')}catch{toast('주소창의 링크를 복사해주세요')}modalRoot.innerHTML=''}
}
function showFriendsModal(){
  const room=activeRoom(), list=(room.contributions||[])
  modalRoot.innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><h3>함께하는 친구들</h3><div class="participant-list">${list.length?list.map(c=>`<div><span class="feed-avatar">${esc(initials(c.nickname))}</span><b>${esc(c.nickname||'친구')}</b><span>${won(c.amount)}</span></div>`).join(''):'<p class="muted">아직 참여한 친구가 없어요.</p>'}</div><div class="modal-actions"><button class="btn secondary" id="closeModal">닫기</button></div></div></div>`
  document.getElementById('closeModal').onclick=()=>modalRoot.innerHTML=''
}
function showRoomMenu(){
  modalRoot.innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><h3>위시룸 메뉴</h3><div class="menu-stack"><button class="btn secondary full" id="menuShare">🔗 공유 링크 복사</button><button class="btn secondary full" id="menuAI">✨ AI 완성 제안 보기</button><button class="btn secondary full" id="menuSeller">🧩 판매자 마지막 조각 데모</button></div><div class="modal-actions"><button class="btn secondary" id="closeModal">닫기</button></div></div></div>`
  document.getElementById('closeModal').onclick=()=>modalRoot.innerHTML=''
  document.getElementById('menuShare').onclick=()=>{modalRoot.innerHTML='';shareRoom()}
  document.getElementById('menuAI').onclick=()=>{modalRoot.innerHTML='';go('ai')}
  document.getElementById('menuSeller').onclick=()=>{modalRoot.innerHTML='';go('seller')}
}

window.addEventListener('popstate',async()=>{parseLocation(); if(state.route==='room') await refreshRoom({silent:true}); render()})

async function init(){
  parseLocation()
  try{ const cfg=await api('/api/config'); state.config=cfg }catch{}
  if(state.roomId) await refreshRoom({silent:true}); else state.room=demoRoom()
  if(state.route==='ai') await prepareAIPlan(false)
  render()
}
init()

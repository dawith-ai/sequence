const app = document.getElementById('app')
const toastEl = document.getElementById('toast')
const modalRoot = document.getElementById('modal-root')

const DEFAULT_STATE = {
  route: 'home',
  product: {
    name: 'AirPods Max',
    brand: 'Apple',
    price: 419000,
    url: 'https://www.apple.com/kr/shop/product/airpods-max',
    source: 'Apple 공식 홈페이지',
    description: '음악이 주는 가장 특별한 순간, 함께.'
  },
  selfAmount: 50000,
  selectedContribution: 30000,
  collected: 327000,
  participants: 12,
  liked: false,
  discountApplied: false,
  sellerApplied: false,
  messages: [
    {name:'지은님', time:'방금 전', text:'생일 너무너무 축하해! 🎉 좋은 음악과 함께 더 멋진 하루 보내길 💜'},
    {name:'현우님', time:'3분 전', text:'좋은 선물이 될 것 같아요! 함께해서 기뻐요 😊'},
    {name:'서연님', time:'7분 전', text:'정말 좋아할 것 같아요. 좋은 선물이네요 💜'},
    {name:'도현님', time:'10분 전', text:'조금만 더 힘내요! 거의 다 왔어요! 🔥'},
    {name:'채원님', time:'12분 전', text:'역시 우리 팀 최고예요! 💜'}
  ]
}

let state = loadState()

function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem('onepice-state') || 'null')
    return {...DEFAULT_STATE, ...saved, product:{...DEFAULT_STATE.product,...(saved?.product||{})}, messages:saved?.messages||DEFAULT_STATE.messages}
  }catch{return structuredClone(DEFAULT_STATE)}
}
function save(){localStorage.setItem('onepice-state', JSON.stringify(state))}
function won(v){return Number(v).toLocaleString('ko-KR')+'원'}
function pct(){return Math.min(100,Math.round(state.collected/state.product.price*100))}
function remain(){return Math.max(0,state.product.price-state.collected)}
function toast(text){toastEl.textContent=text;toastEl.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>toastEl.classList.remove('show'),2200)}
function go(route){state.route=route;save();render();window.scrollTo({top:0,behavior:'smooth'})}
function initials(name){return name.replace('님','').slice(0,1)}

function header(active='home'){
  return `<header class="topbar">
    <button class="brand" data-route="home" style="border:0;background:none"><span class="brand-mark"></span><span>One pice</span></button>
    <nav class="nav">
      ${navBtn('home','홈',active)}${navBtn('room','위시룸',active)}${navBtn('explore','선물 둘러보기',active)}${navBtn('ai','AI 추천',active)}${navBtn('guide','이용방법',active)}
    </nav>
    <div class="top-actions"><label class="search-wrap">⌕<input id="globalSearch" placeholder="원하는 선물을 검색해보세요..." /></label><button class="bell" aria-label="알림">🔔</button><div class="profile"><span class="profile-avatar">지</span><span>지은 님⌄</span></div></div>
  </header>`
}
function navBtn(route,label,active){return `<button data-route="${route}" class="${route===active?'active':''}">${label}</button>`}
function avatarStack(extra='+12'){return `<div class="avatars"><span class="avatar-dot">윤</span><span class="avatar-dot">현</span><span class="avatar-dot">서</span><span class="avatar-dot">채</span><span class="avatar-dot more">${extra}</span></div>`}
function progressHTML(value){return `<div class="progress"><span style="width:${value}%"></span></div>`}

function home(){
  const p=pct()
  return `<div class="shell">${header('home')}<main class="page">
    <section class="hero"><div class="hero-grid">
      <div class="hero-copy"><div class="eyebrow">TOGETHER, A BIGGER HAPPINESS</div><h1 class="headline">작은 선물 여러 개보다,<br><span class="grad">정말 원하는 하나.</span></h1><p class="subline">친구들과 한 조각씩 마음을 모아,<br>AI가 더 스마트하게 완성하는 새로운 선물 경험, <b>One pice.</b></p><div class="hero-actions"><button class="btn primary" data-route="create">위시 만들기　→</button><button class="btn secondary" data-route="room">▶　데모 보기</button></div><div class="hero-benefits"><span class="benefit"><i>🎁</i>함께하는 선물</span><span class="benefit"><i>✓</i>안전한 결제</span><span class="benefit"><i>👥</i>진짜 친한 사람들과</span></div><div class="hand-note">좋은 건,<br>함께할 때<br>더 특별하니까 ♥</div><img class="hero-friends" src="assets/hero-friends.png" alt="친구들이 함께하는 모습"></div>
      <div class="card product-hero"><div class="pill orange">🔥 지금 인기 있는 위시</div><div class="product-hero-grid"><div class="product-imagebox"><img src="assets/product-main.png" alt="${state.product.name}"></div><div class="product-info"><div class="muted">${state.product.brand}</div><h2>${state.product.name}</h2><p class="muted">${state.product.description}</p><div class="product-price">${won(state.product.price)}</div>${progressHTML(p)}<div class="progress-label"><span><b>${won(state.collected)}</b> 모였어요</span><span><b>${p}%</b> · 목표 ${won(state.product.price)}</span></div><div class="join-meta">${avatarStack()}<span class="muted">지금, ${state.participants}명이<br>이 선물을 함께하고 있어요</span></div><div class="hero-cta"><button class="btn secondary share-btn">🔗 공유하기</button><button class="btn primary" data-route="room">이 위시에 참여하기　→</button></div></div></div></div>
    </div></section>
    <section class="home-lower"><div><h2 class="section-title">이렇게 시작해보세요</h2><p class="section-sub">복잡한 건 AI에게 맡기고, 설레는 마음만 준비하세요.</p><div class="how-grid">${howCard('01','🔗','링크로 위시 생성','원하는 상품의 링크를 붙여넣으면 AI가 자동으로 정보를 불러와요.')}${howCard('02','👥','친구들과 한 조각씩 참여','각자 원하는 만큼, 비공개로 부담 없이 마음을 보태요.')}${howCard('03','✨','AI가 마지막 완성을 돕기','할인 정보 탐지, 더 좋은 구매처 제안, 부족한 금액까지 AI가 도와요.')}</div><div class="stats">${stat('◉','12,482','활성 위시룸','지금도 많은 사람들이 함께하고 있어요')}${stat('✓','92%','위시 달성률','함께하면, 더 자주 이루어져요')}${stat('◫','28,600원','1인 평균 참여금액','작은 마음이 만드는 큰 기적')}</div></div><aside class="card ai-side"><img src="assets/home-robot.png" alt="AI 캐릭터"><h3>AI가 찾아주는<br>더 좋은 구매 타이밍</h3><p>가격 변동을 실시간으로 분석하고, 할인 소식부터 구매처까지. 마지막 한 조각까지 AI가 함께해요.</p><ul><li><i>🔔</i>가격 하락 시 알림</li><li><i>🛒</i>더 좋은 구매처 추천</li><li><i>✨</i>부족한 금액 AI 지원</li></ul></aside></section>
  </main></div>`
}
function howCard(num,icon,title,text){return `<div class="card how-card"><div class="how-num">${num}</div><div style="font-size:22px;margin-bottom:8px">${icon}</div><h3>${title}</h3><p>${text}</p></div>`}
function stat(icon,val,label,desc){return `<div class="card stat-card"><div class="stat-icon">${icon}</div><div><strong>${val}</strong><span>${label}</span><br><small>${desc}</small></div></div>`}

function create(){
  const group=state.product.price-state.selfAmount
  return `<div class="shell create-page">${header('room')}<main class="page"><div class="container"><div class="page-head"><div class="eyebrow">MAKE A WISH TOGETHER</div><h1 class="headline">위시 만들기</h1><p class="subline">상품 링크만 붙여넣으면, 친구들과 함께하는 특별한 선물이 시작돼요.</p><div class="create-note">좋은 건, 함께할 때<br>더 특별하니까 ♥</div></div><div class="steps"><span class="step active"><b>1</b>상품 불러오기</span><span class="step-line"></span><span class="step"><b>2</b>금액 설정</span><span class="step-line"></span><span class="step"><b>3</b>위시 정보 입력</span><span class="step-line"></span><span class="step"><b>4</b>완료</span></div>
  <div class="create-grid"><section class="card create-main"><div class="field-head"><div class="field-icon">🔗</div><h3>상품 링크를 붙여넣어주세요</h3></div><p class="field-copy">원하는 상품의 URL을 넣으면, AI가 자동으로 정보를 불러와요.</p><div class="input-row"><input class="input" id="productUrl" value="${state.product.url}"/><button class="btn primary" id="analyzeBtn">✦　AI로 상품 불러오기</button></div><div class="source-chips"><span class="source-chip">Apple 공식 홈페이지</span><span class="source-chip">쿠팡</span><span class="source-chip">무신사</span><span class="source-chip">오늘의집</span><span class="source-chip">네이버 스마트스토어</span><span class="source-chip">기타 쇼핑몰</span></div>
  <div class="loaded-product" id="loadedProduct"><div class="loaded-visual"><button class="like-btn" id="likeBtn">${state.liked?'♥':'♡'}</button><img src="assets/product-main.png" alt="상품"></div><div class="loaded-info"><span class="pill purple">✓ 상품이 불러와졌어요!</span><div class="muted" style="margin-top:10px">${state.product.brand}</div><h3>${state.product.name}</h3><div class="muted">${state.product.description}</div><div class="tags" style="margin-top:10px"><span class="tag">무선 헤드폰</span><span class="tag">노이즈 캔슬링</span><span class="tag">공간 음향</span><span class="tag">프리미엄 사운드</span></div><div class="price">${won(state.product.price)}</div><div class="muted">${state.product.source}　↗</div><div class="thumbs"><span class="thumb"><img src="assets/product-main.png"></span><span class="thumb"><img src="assets/product-main.png"></span><span class="thumb"><img src="assets/product-main.png"></span><span class="thumb" style="color:var(--p);font-weight:900">+3</span></div></div></div>
  <div class="budget-grid"><div class="budget-card"><b>⊕　내가 부담할 금액</b><div class="muted" style="font-size:12px">내가 먼저 마음을 더해보세요. (선택사항)</div><div class="amount" id="selfAmountLabel">${won(state.selfAmount)}</div><input class="range" id="selfRange" type="range" min="0" max="${state.product.price}" step="1000" value="${state.selfAmount}"><div class="progress-label"><span>0원</span><span>${won(state.product.price)}</span></div></div><div class="budget-card group-budget"><b>👥　친구들과 함께 채울 금액</b><div class="amount" id="groupAmountLabel">${won(group)}</div><div class="muted">함께하는 만큼, 더 특별한 선물이 될 거예요.</div><div style="margin-top:14px">${avatarStack('+')}</div></div></div><div class="create-actions"><button class="btn secondary" data-route="home">←　이전으로</button><button class="btn primary" id="createRoomBtn">위시룸 생성하기　→</button></div></section>
  <aside class="card guide"><div class="guide-top"><img src="assets/guide-robot.png" alt="AI 가이드"><div><span class="pill purple">AI 추천 ✨</span><h3>AI가 제안하는<br>위시 가이드</h3><div class="muted">이런 점을 고려해보세요!</div></div></div><div class="guide-item"><div><b>👥 추천 참여 인원</b><small>이 가격대는 보통 4~8명이 함께해요.</small></div><strong>4 ~ 8명</strong></div><div class="guide-item"><div><b>◷ 예상 1인 부담금</b><small>5명이 함께하면 1인 약 52,000원이에요.</small></div><strong>약 52,000원</strong></div><div class="guide-item"><div><b>♡ 좋은 타이밍이에요</b><small>최근 한 달간 이 상품의 위시 생성이 42% 증가했어요.</small></div><strong>생일 · 기념일</strong></div><div class="guide-item"><div><b>✦ AI 한 줄 팁</b><small>“함께 듣는 음악이 더 특별한 추억이 될 거예요!”</small></div></div><h3 class="option-title">추천 분담금 옵션</h3><p class="option-copy">친구들이 부담 없이 참여할 수 있는 금액을 설정해보세요.</p><div class="options">${option(5000,'가볍게 참여하기','8명 이상 추천')}${option(10000,'부담 없는 선택','5~8명 추천')}${option(30000,'더 빠르게 완성','3~5명 추천',true)}</div><div class="direct-option">✎ 직접 금액 설정하기</div></aside></div></div></main></div>`
}
function option(amount,label,rec,featured=false){return `<button class="option ${state.selectedContribution===amount?'active':''}" data-option="${amount}">${featured?'<span class="option-badge">👑 가장 많이 선택해요</span>':''}<strong>${won(amount)}</strong><small>${label}<br>(${rec})</small></button>`}

function room(){
 const p=pct(); const filled=Math.max(0,Math.round(p/100*8));
 return `<div class="shell room-page">${header('room')}<main class="page"><div class="container"><div class="room-top"><div class="title-block"><button class="btn soft" data-route="home" style="height:40px;padding:0 14px">← 전체 위시룸 보기</button><h1 class="headline">친구의 생일 위시　🎂</h1><p class="subline">좋은 친구들과 함께 만드는 특별한 선물이에요!</p></div><div class="room-actions"><div class="d-day">📅　D-7　5월 20일까지</div><button class="btn kakao share-btn">🟨　카카오톡으로 공유</button><button class="btn secondary">•••</button></div></div>
 <div class="room-grid"><div class="room-main"><section class="card wish-card"><div class="wish-product-grid"><div class="wish-visual"><div class="confetti"><span></span><span></span><span></span></div><img src="assets/product-main.png" alt="product"><div class="wish-hand">좋은 음악이<br>더 좋은 순간을 만든다 ♫</div></div><div class="wish-info"><div class="muted">${state.product.brand}</div><h2>${state.product.name}</h2><div class="muted">${state.product.description}</div><div class="wish-price">${won(state.product.price)}</div><div class="pill purple">조금만 더! 멋진 선물이 완성돼요 💜</div><div class="puzzle">${Array.from({length:8},(_,i)=>`<div class="piece ${i<filled?'filled':''}"></div>`).join('')}</div><div class="room-progress-row"><span class="room-pct">${p}%</span><span class="room-collected">${won(state.collected)} 모였어요!</span></div>${progressHTML(p)}<div class="room-meta"><span>👥 ${state.participants}명이 함께하고 있어요</span><span>목표 ${won(state.product.price)}</span><span>${won(remain())} 남았어요</span></div></div></div></section>
 <section class="card contribution"><div class="contribution-head"><div><h3>💜　한 조각 보태기</h3><div class="muted">작은 마음이 모여, 정말 특별한 선물이 돼요.</div></div><div class="privacy">🔒 내가 낸 금액은 친구들에게 공개되지 않아요.</div></div><div class="amount-options">${amountButton(5000)}${amountButton(10000)}${amountButton(30000,true)}<button class="amount-btn" data-custom="1">직접 입력</button></div><button class="btn primary full" id="contributeBtn">🎁　${won(state.selectedContribution)} 한 조각 보태기　✨</button></section></div>
 <div style="display:grid;gap:14px"><section class="card friends-panel"><div style="display:flex;justify-content:space-between;align-items:center"><h3>함께하는 친구들</h3><span style="color:var(--p);font-weight:900;font-size:13px">모두 보기　→</span></div><div class="friend-big">${avatarStack('+7')}</div><div style="font-size:21px;font-weight:950">${state.participants}명이 함께하고 있어요!</div><div class="friend-stats"><div class="friend-stat">${state.participants}명<small>참여 친구</small></div><div class="friend-stat">${won(Math.round(state.collected/state.participants))}<small>평균 참여 금액</small></div><div class="friend-stat">${p}%<small>달성률</small></div></div></section><section class="card feed-panel"><h3>💬　실시간 응원 메시지</h3><div class="feed">${state.messages.map(m=>`<div class="feed-item"><div class="feed-avatar">${initials(m.name)}</div><div><div><b>${m.name}</b><span class="feed-time">${m.time}</span></div><p>${m.text}</p></div></div>`).join('')}</div><div class="comment-row"><input id="commentInput" placeholder="응원메시지를 남겨보세요..."><button id="commentBtn">☺</button></div></section></div>
 <aside class="card invite-panel"><h3>이런 카드로<br>친구들을 초대해보세요!</h3><div class="invite-phone"><div class="invite-screen"><div class="brand" style="justify-content:center;font-size:16px"><span class="brand-mark" style="width:25px;height:25px"></span>One pice</div><h3 style="margin:12px 0 4px">친구의<br>생일 위시 🎂</h3><div class="muted" style="font-size:12px">좋은 사람들이 함께 만드는<br>더 특별한 선물</div><div class="invite-thumb"><img src="assets/product-main.png"></div>${progressHTML(p)}<div class="progress-label"><span>${won(state.collected)}</span><b>${p}%</b></div><div style="margin:12px 0">${avatarStack('+7')}</div><button class="btn primary full">지금 함께하기　→</button></div></div><div class="hand">함께하는 마음이<br>더 큰 행복이 되니까 ♥</div></aside></div></div></main></div>`
}
function amountButton(a,featured=false){return `<button class="amount-btn ${state.selectedContribution===a?'active':''} ${featured?'featured':''}" data-amount="${a}">${won(a)}</button>`}

function aiPage(){
 const oldPrice=419000; const current=state.discountApplied?399000:419000; const displayedCollected=state.discountApplied?395000:195000; const target=219000; const completion=Math.min(100,Math.round(displayedCollected/target*100)); const short=Math.max(0,target-displayedCollected)
 return `<div class="shell">${header('ai')}<div class="ai-page"><aside class="side-nav"><div class="side-brand"><span class="brand-mark"></span><span>원피스<br><small style="font-weight:600;color:#7e7d96">One pice</small></span></div><div class="side-menu"><button data-route="home">⌂　홈</button><button class="active">✨　AI 선물 제안</button><button data-route="create">🎁　선물하기</button><button data-route="room">👥　함께하는 선물</button><button>▣　마지막 조각</button><button>♡　내 위시리스트</button></div><div class="side-illustration">좋은 사람들이<br>좋은 선물을 만들어요 ♡<br><br><span style="font-family:Inter;color:#67667d;font-size:13px">작은 마음이 큰 기쁨이 되는 세상</span></div></aside><main class="ai-content"><div class="ai-grid"><section class="card ai-product"><button class="btn soft" data-route="room" style="height:40px">← 위시리스트로 돌아가기</button><div class="ai-product-main" style="margin-top:14px"><div class="ai-product-visual"><img src="assets/product-main.png" alt="product"></div><div class="ai-copy"><span class="pill purple">생일 선물</span><h1>소음을 잊게 하는<br>특별한 순간</h1><div class="muted" style="font-size:18px">프리미엄 무선 헤드폰</div><div class="new-price">${won(current)} <span class="old-price">${won(oldPrice)}</span></div><span class="pill purple">✦ 6월 12일부터 20,000원 할인!</span><div class="features"><div class="feature">🎧<br>최고의 음질</div><div class="feature">〽<br>액티브 노이즈<br>캔슬링</div><div class="feature">▣<br>최대 20시간</div><div class="feature">🎁<br>프리미엄 패키지</div></div></div></div><div class="ai-complete-head"><b>이 선물의 완성도</b><strong>${completion}%</strong></div>${progressHTML(completion)}<div class="big-money"><span>${won(displayedCollected)} <span class="muted">/ ${won(target)}</span></span><span class="shortfall">${won(short)} 부족</span></div><div class="join-meta">${avatarStack('+12')}<span class="muted">지금까지 13명이 함께하고 있어요 💜</span></div><div class="card" style="padding:13px 16px;margin-top:10px;border-radius:14px;box-shadow:none"><b>지은님의 한마디</b>　<span class="muted">“늘 음악으로 힘이 되는 너에게, 이 특별한 마음을 전하고 싶어요. 💜”</span></div></section>
 <div class="ai-side-col"><div class="ai-banner"><img src="assets/ai-robot-banner.png" alt="AI robot"></div><section class="card recommend-card"><div style="display:flex;justify-content:space-between;gap:12px"><h3>✦　원피스 AI 완성 제안</h3><span class="pill purple">AI가 찾아낸 기회예요!</span></div><div class="news"><b>좋은 소식이 있어요! 🎉</b><br>이 상품의 가격이 419,000원에서 <b>399,000원</b>으로 20,000원 인하되었어요.<br>지금이라면 <b>4,000원만 더</b> 있으면 선물이 완성돼요!</div><div class="price-compare"><div class="price-box"><small>기존 가격</small><strong>419,000원</strong></div><div class="arrow">→</div><div class="price-box"><small style="color:var(--p)">새로운 가격</small><strong style="color:var(--p)">399,000원</strong></div></div><div class="recommend-actions"><button class="btn primary" id="applyDiscountBtn">↻　새 가격으로 목표 변경</button><button class="btn secondary" id="payGapBtn">⚡　내가 4,000원 채우기</button></div></section><section class="card seller-card"><div style="display:flex;justify-content:space-between;gap:12px"><h3>🧩　판매자 마지막 조각</h3><span class="pill purple">지금만 가능한 특별한 제안!</span></div><div class="seller-row"><div class="seller-gift">🎁</div><div><b style="font-size:18px">마지막 조각 10,000원 지원</b><p>좋은 선물을 응원하는 판매자의 특별한 혜택이에요. 지금 적용하면 단 4,000원만 더 모으면 선물이 완성돼요!</p></div></div><button class="btn primary full" id="sellerFinishBtn">🎁　적용하고 지금 완성하기</button><div class="completion-toast ${state.sellerApplied?'show':''}" id="completionToast"><h3>선물이 완성되었어요! 🎉</h3><p>친구들의 마음과 AI가 찾은 혜택이 만나, 정말 원하는 하나가 완성되었습니다.</p><button class="btn soft" data-route="room" style="margin-top:12px">완성된 위시룸 보기　→</button></div></section></div></div></main></div></div>`
}
function explore(){return `<div class="shell">${header('explore')}<main class="page"><div class="container"><h1 class="headline">선물 둘러보기</h1><p class="subline">데모에서는 대표 위시를 선택해 전체 흐름을 경험할 수 있어요.</p><div class="card" style="max-width:760px;margin-top:24px;padding:22px"><div class="loaded-product" style="margin:0"><div class="loaded-visual"><img src="assets/product-main.png"></div><div class="loaded-info"><span class="pill orange">🔥 인기 위시</span><div class="muted" style="margin-top:10px">Apple</div><h3>AirPods Max</h3><div class="price">419,000원</div><button class="btn primary" data-route="room">이 위시 보기　→</button></div></div></div></div></main></div>`}
function guide(){return `<div class="shell">${header('guide')}<main class="page"><div class="container"><h1 class="headline">이용방법</h1><p class="subline">링크 하나로 시작하고, 친구들과 마음을 모으고, AI가 마지막까지 완성합니다.</p><div class="how-grid" style="margin-top:24px">${howCard('01','🔗','위시 생성','상품 링크를 붙여넣고 AI가 정보를 불러오게 하세요.')}${howCard('02','👥','친구 초대','카카오톡이나 링크로 친구에게 위시룸을 공유하세요.')}${howCard('03','✨','AI 완성','가격 변동과 마지막 조각 제안으로 실제 선물까지 완성하세요.')}</div></div></main></div>`}

function render(){
  const route=state.route
  app.innerHTML = route==='home'?home():route==='create'?create():route==='room'?room():route==='ai'?aiPage():route==='explore'?explore():guide()
  wire()
}

function wire(){
 document.querySelectorAll('[data-route]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.route)))
 document.querySelectorAll('.share-btn').forEach(el=>el.addEventListener('click',share))
 const analyze=document.getElementById('analyzeBtn'); if(analyze) analyze.addEventListener('click',()=>{const url=document.getElementById('productUrl').value.trim(); if(!url){toast('상품 링크를 입력해주세요.');return} analyze.disabled=true; analyze.textContent='AI가 분석 중...'; setTimeout(()=>{state.product.url=url;state.product.source=sourceFrom(url);save();analyze.disabled=false;analyze.textContent='✓ 상품 불러오기 완료';toast('AI가 상품명·가격·이미지를 읽어왔어요 ✦');render()},900)})
 const like=document.getElementById('likeBtn'); if(like) like.addEventListener('click',()=>{state.liked=!state.liked;save();render();toast(state.liked?'위시리스트에 저장했어요 ♥':'위시리스트에서 뺐어요')})
 const range=document.getElementById('selfRange'); if(range) range.addEventListener('input',()=>{state.selfAmount=Number(range.value);document.getElementById('selfAmountLabel').textContent=won(state.selfAmount);document.getElementById('groupAmountLabel').textContent=won(state.product.price-state.selfAmount);save()})
 document.querySelectorAll('[data-option]').forEach(el=>el.addEventListener('click',()=>{state.selectedContribution=Number(el.dataset.option);save();render()}))
 const cr=document.getElementById('createRoomBtn'); if(cr) cr.addEventListener('click',()=>{state.collected=Math.max(0,state.product.price-state.selfAmount-42000);state.participants=8;save();toast('위시룸이 만들어졌어요! 친구에게 공유해보세요 🎁');setTimeout(()=>go('room'),500)})
 document.querySelectorAll('[data-amount]').forEach(el=>el.addEventListener('click',()=>{state.selectedContribution=Number(el.dataset.amount);save();render()}))
 const custom=document.querySelector('[data-custom]'); if(custom) custom.addEventListener('click',()=>{const v=prompt('보탤 금액을 입력해주세요 (원)','15000');const n=Math.max(1000,Number(v)||0);state.selectedContribution=n;save();render()})
 const contribute=document.getElementById('contributeBtn'); if(contribute) contribute.addEventListener('click',()=>{const amount=Math.min(state.selectedContribution,remain());if(amount<=0){toast('이미 선물이 완성되었어요! 🎉');return}state.collected+=amount;state.participants+=1;state.messages.unshift({name:'새 친구',time:'지금',text:`${won(amount)}의 마음을 한 조각 보탰어요 💜`});save();toast(`${won(amount)}의 마음이 더해졌어요 💜`);render(); if(remain()<=30000)setTimeout(()=>{toast('거의 다 왔어요! AI가 완성 방법을 찾았어요 ✨')},900)})
 const comment=document.getElementById('commentBtn'); if(comment) comment.addEventListener('click',()=>{const input=document.getElementById('commentInput');const text=input.value.trim();if(!text)return;state.messages.unshift({name:'나',time:'지금',text});save();render();toast('응원 메시지를 남겼어요')})
 const apply=document.getElementById('applyDiscountBtn'); if(apply) apply.addEventListener('click',()=>{state.discountApplied=true;state.product.price=399000;state.collected=Math.max(state.collected,395000);save();toast('AI가 새 가격을 반영했어요. 이제 4,000원만 더 있으면 완성돼요!');render()})
 const gap=document.getElementById('payGapBtn'); if(gap) gap.addEventListener('click',()=>{state.product.price=399000;state.collected=399000;state.discountApplied=true;state.sellerApplied=true;save();toast('4,000원을 채워 선물이 완성되었어요 🎉');render()})
 const seller=document.getElementById('sellerFinishBtn'); if(seller) seller.addEventListener('click',()=>{state.product.price=399000;state.collected=399000;state.discountApplied=true;state.sellerApplied=true;save();toast('판매자의 마지막 조각이 적용되어 선물이 완성됐어요 🎉');render()})
 const search=document.getElementById('globalSearch'); if(search) search.addEventListener('keydown',e=>{if(e.key==='Enter'){toast(`“${search.value}” 검색 결과를 데모 위시로 연결했어요`);go('explore')}})
}

function sourceFrom(url){try{const h=new URL(url).hostname.replace('www.','');if(h.includes('apple'))return 'Apple 공식 홈페이지';if(h.includes('coupang'))return '쿠팡';if(h.includes('musinsa'))return '무신사';return h}catch{return '온라인 쇼핑몰'}}
function share(){
 const shareData={title:'One pice 위시룸',text:`친구의 선물이 ${pct()}% 완성됐어요. 한 조각 함께해 주세요!`,url:location.href}
 if(navigator.share){navigator.share(shareData).catch(()=>{})}else{showShareModal()}
}
function showShareModal(){modalRoot.innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><h3>카카오톡으로 공유</h3><p>공모전 데모에서는 실제 카카오 API 대신 공유 링크 복사까지 작동합니다.</p><div class="share-card"><b>🎁 친구의 생일선물이 ${pct()}% 완성됐어요</b><span>지금 ${state.participants}명이 함께하고 있어요.<br>한 조각만 보태도 선물이 더 가까워져요.</span></div><div class="modal-actions"><button class="btn secondary" id="closeModal">닫기</button><button class="btn primary" id="copyLink">공유 링크 복사</button></div></div></div>`;document.getElementById('closeModal').onclick=()=>modalRoot.innerHTML='';document.getElementById('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')modalRoot.innerHTML=''};document.getElementById('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('공유 링크를 복사했어요');}catch{toast('브라우저 주소를 복사해 공유해주세요')}modalRoot.innerHTML=''}}

render()

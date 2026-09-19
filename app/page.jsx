import Image from 'next/image'

function Card({ title, text, icon }: { title: string; text: string; icon: string }) {
  return (
    <div className="card feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-item">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function PhonePreview() {
  return (
    <div className="phone-shell">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="phone-card phone-card-main">
          <div className="phone-mini-top">
            <span className="pill small">AI 추천</span>
            <span className="tiny-muted">78%</span>
          </div>
          <div className="phone-product">
            <Image src="/product.png" alt="product" width={120} height={120} />
          </div>
          <div className="phone-title">AirPods Max</div>
          <div className="phone-progress"><span style={{ width: '78%' }} /></div>
          <div className="phone-meta">327,000원 모였어요</div>
        </div>
        <div className="phone-list">
          {[1, 2, 3].map((item) => (
            <div className="phone-card" key={item}>
              <div className="phone-row">
                <div className="phone-avatar" />
                <div className="phone-lines">
                  <span />
                  <span className="short" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <main className="page">
      <section className="frame">
        <header className="topbar">
          <div className="brand-wrap">
            <div className="brand-mark" />
            <span className="brand-name">One pice</span>
          </div>
          <nav className="topnav">
            <a>홈</a>
            <a>위시룸</a>
            <a>선물 둘러보기</a>
            <a>AI 추천</a>
            <a>이용방법</a>
          </nav>
          <div className="top-actions">
            <div className="search-box">원하는 선물을 검색해보세요...</div>
            <div className="profile-chip">지은 님</div>
          </div>
        </header>

        <section className="hero-grid">
          <div className="hero-left card gradient-panel">
            <div className="eyebrow">TOGETHER, A BIGGER HAPPINESS</div>
            <h1>
              작은 선물 여러 개보다,<br />
              <span>정말 원하는 하나.</span>
            </h1>
            <p>
              친구들과 한 조각씩 마음을 모아,
              <br />
              AI가 더 스마트하게 완성하는 새로운 선물 경험, One pice.
            </p>
            <div className="hero-buttons">
              <button className="btn primary">위시 만들기</button>
              <button className="btn secondary">데모 보기</button>
            </div>
            <div className="handwriting">
              좋은 선물은,<br />
              함께할 때<br />더 특별하니까 ♥
            </div>
            <div className="hero-illustration">
              <div className="ground" />
              <div className="group">
                <span className="person p1" />
                <span className="person p2" />
                <span className="person p3" />
                <span className="person p4" />
              </div>
            </div>
          </div>

          <div className="hero-right card product-panel">
            <div className="badge-row">
              <span className="pill orange">지금 인기 있는 위시</span>
              <span className="pill light">♡ 1.2K</span>
            </div>
            <div className="product-content">
              <div className="product-visual">
                <Image src="/product.png" alt="AirPods Max" width={300} height={300} />
              </div>
              <div className="product-info">
                <div className="mini-brand">Apple</div>
                <h2>AirPods Max</h2>
                <p>음악이 주는 가장 특별한 순간, 함께.</p>
                <div className="price">419,000원</div>
                <div className="progress"><span style={{ width: '78%' }} /></div>
                <div className="progress-row">
                  <b>327,000원</b>
                  <span>78%</span>
                </div>
                <div className="contributors">
                  <div className="avatars">
                    <span>민</span>
                    <span>지</span>
                    <span>서</span>
                    <span>현</span>
                    <span>+12</span>
                  </div>
                  <div className="contributors-copy">지금, 16명이 함께하고 있어요</div>
                </div>
                <div className="cta-row">
                  <button className="btn secondary full">공유하기</button>
                  <button className="btn primary full">한 조각 참여하기</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lower-grid">
          <div className="main-column">
            <div className="section-head">
              <h2>이렇게 시작해보세요</h2>
              <p>복잡한 건 AI에게 맡기고, 설레는 마음만 준비하세요.</p>
            </div>
            <div className="features-row">
              <Card
                icon="01"
                title="링크로 위시 생성"
                text="원하는 상품 링크를 넣으면 AI가 상품명, 가격, 이미지를 자동으로 읽어와요."
              />
              <Card
                icon="02"
                title="친구들과 한 조각씩"
                text="각자 부담 없는 금액으로 참여해요. 내가 낸 금액은 친구들에게 공개되지 않아요."
              />
              <Card
                icon="03"
                title="AI가 완성까지 돕기"
                text="가격 하락, 판매처 혜택, 마지막 조각 제안까지 AI가 완성 경로를 찾아줘요."
              />
            </div>
            <div className="stats-row">
              <Stat value="12,482" label="활성 위시룸" />
              <Stat value="92%" label="위시 달성률" />
              <Stat value="28,600원" label="1인 평균 참여금액" />
            </div>
          </div>

          <aside className="sidebar card ai-card">
            <div className="ai-title-row">
              <div className="robot-face">◕ ◕</div>
              <div>
                <div className="sidebar-eyebrow">AI 추천</div>
                <h3>AI가 찾아주는 더 좋은 구매 타이밍</h3>
              </div>
            </div>
            <p>
              가격 변동을 실시간으로 분석하고, 할인 소식부터 구매처까지.
              마지막 한 조각까지 AI가 함께해요.
            </p>
            <ul className="check-list">
              <li>가격 하락 시 알림</li>
              <li>더 좋은 구매처 추천</li>
              <li>부족한 금액 줄이기</li>
            </ul>
          </aside>
        </section>

        <section className="showcase card">
          <div className="showcase-copy">
            <div className="section-head small-gap">
              <h2>제출용 데모 화면</h2>
              <p>공모전 심사위원이 한눈에 흐름을 이해할 수 있도록 구성한 모바일 미리보기</p>
            </div>
            <div className="showcase-cards">
              <div className="mini-demo">
                <b>위시 만들기</b>
                <span>상품 링크 입력 → AI 상품 불러오기</span>
              </div>
              <div className="mini-demo">
                <b>함께 선물하기</b>
                <span>친구 초대 → 한 조각 보태기 → 진행률 상승</span>
              </div>
              <div className="mini-demo">
                <b>AI 완성 돕기</b>
                <span>가격 재계산 → 더 좋은 구매처 제안 → 선물 완성</span>
              </div>
            </div>
          </div>
          <PhonePreview />
        </section>
      </section>
    </main>
  )
}

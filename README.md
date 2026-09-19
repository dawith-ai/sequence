# One Wish — Wanted AI Championship real MVP

공모전 시안 4개(홈 / 위시 만들기 / 공동 위시룸 / AI 완성)를 실제 작동하는 흐름으로 구현한 Vercel용 MVP입니다.

## 구현된 기능

- 상품 URL 실제 서버 fetch + JSON-LD/OG metadata 추출
- Gemini API가 상품명/브랜드/가격/태그/선물 문구를 구조화
- Supabase 기반 공유 가능한 위시룸 생성
- `/?room=<uuid>` 공유 링크로 다른 휴대폰에서도 같은 룸 조회
- 참여금액/응원메시지 저장 및 3.5초 폴링 동기화
- 한 조각 5천/1만/3만원/직접입력
- 현재 확보금액 = 내가 부담한 금액 + 친구 참여금액 + 판매자 지원
- AI Completion Engine: 상품 URL 재분석 → 현재 가격 비교 → 부족금액 재계산
- 판매자 `마지막 조각` 포털 및 지원금 반영
- Kakao JavaScript Key가 있으면 Kakao Talk Share SDK 사용
- 미설정 환경에서는 로컬 데모 모드로 모든 핵심 버튼이 동작

## Vercel 배포

저장소 루트가 아래와 같아야 합니다.

```text
index.html
styles.css
app.js
build.mjs
package.json
vercel.json
api/
lib/
assets/
supabase.sql
```

기존 Next.js `app/`, `next.config.*`, `tsconfig.json`은 삭제하세요.

## 1. Supabase

Supabase SQL Editor에서 `supabase.sql` 전체 실행.

Vercel Project Settings > Environment Variables에:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

를 추가합니다. Service Role Key는 브라우저 코드에 넣지 않습니다.

## 2. Gemini

Vercel 환경변수:

- `GEMINI_API_KEY`
- 선택: `GEMINI_MODEL=gemini-2.5-flash`

AI 키가 없어도 URL metadata 추출은 시도하지만, 공모전 제출본에는 Gemini 키 연결을 권장합니다.

## 3. Kakao Talk Share (선택)

Kakao Developers 앱 > 플랫폼 > Web에 실제 Vercel 도메인을 등록하고 JavaScript Key를 `KAKAO_JS_KEY`로 추가합니다.

키가 없으면 Web Share / 링크 복사로 자동 fallback합니다.

## 4. 재배포

환경변수 추가 후 Vercel에서 Redeploy.

## 빠른 검증 시나리오

1. `/` → `위시 만들기`
2. 상품 URL 입력 → `AI로 상품 불러오기`
3. 내 부담금 조절 → `위시룸 생성하기`
4. 생성된 `/?room=<uuid>`를 다른 브라우저/휴대폰에서 열기
5. 다른 기기에서 `한 조각 보태기`
6. 원래 기기에서 3~4초 후 진행률이 변경되는지 확인
7. `AI 추천` → `가격 다시 확인`
8. 가격 하락이 실제 URL에서 확인되면 `추천 가격 적용`
9. `마지막 조각` → 판매자 지원금 등록 → 소비자 위시룸 반영

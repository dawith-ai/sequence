# One Wish — Firebase Real MVP

원티드 AI Championship 2026 제출용 실제 MVP입니다.

## 이번 버전의 핵심
- Supabase 제거 → Firebase Firestore 전환
- 다른 휴대폰/브라우저에서 같은 위시룸 공유
- Firestore 실시간 onSnapshot 동기화
- 참여금, 응원 메시지, 판매자 마지막 조각 실시간 반영
- 상품 진행률을 보라색 블록이 아니라 **실제 상품 이미지 12조각이 채워지는 모자이크 UI**로 변경
- Gemini 상품 URL 분석 / AI Completion Engine은 Vercel Functions 유지

## Firebase 설정
Firebase 프로젝트: `one-wish-a40b0`

### 1. Firestore Database 생성
Firebase Console → Firestore Database → Create database

### 2. Rules 적용
프로젝트의 `firestore.rules` 내용을 Firebase Console → Firestore → Rules에 붙여넣고 Publish 합니다.

공모전 데모를 빠르게 동작시키기 위한 public-demo 규칙입니다. 정식 서비스 전에는 Firebase Auth + App Check를 붙이는 것을 권장합니다.

### 3. Vercel
별도의 Supabase 환경변수는 더 이상 필요하지 않습니다.
Gemini 실제 분석을 쓰려면 Vercel Production 환경변수에 아래만 추가합니다.
- `GEMINI_API_KEY`
- 선택: `KAKAO_JS_KEY`

## 검증
```bash
npm run check
npm run build
```

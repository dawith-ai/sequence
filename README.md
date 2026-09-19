# One pice — 공모전용 기능 구현 데모

이미지 시안의 구성에 맞춘 정적 SPA입니다. Next.js/TypeScript를 사용하지 않아 Vercel 빌드 오류를 피합니다.

## 구현된 흐름
- 홈 → 위시 만들기 → 위시룸 → AI 완성 제안
- 상품 URL 입력 및 AI 분석 연출
- 내 부담금 슬라이더
- 추천 분담금 선택
- 위시룸 생성
- 금액별 한 조각 참여 및 진행률 변화
- 실시간 응원 메시지 추가
- 공유 링크 복사 / Web Share
- 가격 인하 AI 제안 적용
- 판매자 마지막 조각으로 선물 완성
- localStorage 상태 저장

## Vercel
이 프로젝트를 GitHub 저장소 루트에 그대로 올리면 됩니다.
- Build Command: `npm run build`
- Output Directory: `dist`
- Framework Preset: Other

`vercel.json`에 buildCommand/outputDirectory가 이미 포함되어 있습니다.

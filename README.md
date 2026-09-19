# One pice — Vercel 배포 수정본

Vercel 빌드에서 TypeScript 패키지 누락으로 실패하지 않도록 JSX 기반으로 정리했습니다.

## 배포
1. 이 폴더를 GitHub 저장소 루트에 덮어쓰기
2. commit / push
3. Vercel에서 Redeploy

Framework Preset: Next.js
Build Command: `npm run build`
Output Directory: 기본값

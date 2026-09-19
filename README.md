# One pice — Vercel build fixed

이번 버전은 Vercel 로그의 TypeScript 의존성 오류를 직접 해결합니다.

- typescript 5.8.2
- @types/node 20.17.6
- @types/react
- @types/react-dom
- next.config.mjs의 deprecated experimental.typedRoutes 제거

GitHub 저장소 루트에 이 프로젝트 내용을 덮어쓰고 commit/push한 뒤 Vercel에서 Redeploy 하세요.

# One pice — Vercel static deployment fixed

이 버전은 기존 Vercel 프로젝트가 Next.js Framework Preset으로 설정되어 있어도
`vercel.json`의 `"framework": null`로 **Other** 프리셋을 강제로 사용합니다.

## GitHub 저장소 루트
아래 파일들이 저장소 최상위에 있어야 합니다.

- index.html
- styles.css
- app.js
- build.mjs
- package.json
- vercel.json
- assets/

기존 Next.js 파일(app/, next.config.mjs, tsconfig.json 등)은 삭제하세요.

## Vercel
Git push 후 Redeploy 하면 됩니다.
Build Command: npm run build
Output Directory: dist
Framework: Other (vercel.json이 강제로 override)

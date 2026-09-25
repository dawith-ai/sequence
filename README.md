# 시퀀스 아레나

친구들을 테이블로 불러 모아 카드 다섯 장을 한 줄로 잇는 온라인 시퀀스 게임입니다.

## 포함 기능

- 2~12명 게임과 3명·5명 등 홀수 인원 지원
- 공개 방 / 비공개 방, 초대 코드, 대기실
- 랜덤 첫 차례 뽑기와 60초 턴 타이머
- 숫자순·모양순 손패 정렬, 최근 착수 강조, 내 차례 조명
- 빨간 잭 칩 제거, 검은 잭 자유 배치, 죽은 카드 교환
- 시퀀스 완성 애니메이션과 셔플 효과음·배경음악
- Firebase Firestore 실시간 방 동기화

## Firebase

Firebase 프로젝트: `sequence-arena-dawith`

Firestore 리전은 `asia-northeast1`이며, 게임 상태는 `sequenceRooms/{방코드}`에 저장됩니다.
현재 규칙은 인증 없는 공개 데모용입니다. 실제 서비스 전에는 Firebase Auth와 App Check를 추가해야 합니다.

## 개발 / 배포

```bash
npm run check
npm run build
firebase deploy --only firestore:rules
```

정적 프론트엔드는 `index.html`, `app.js`, `styles.css`와 `dist/` 산출물로 구성됩니다.

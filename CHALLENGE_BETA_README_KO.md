# Re:chant Challenge β v1.1.0-beta.1

기준: Rechant_Web_v1.0.1_Source.zip. 이전 v0.4.0 소스는 사용하지 않았습니다.

- LOVE ATTACK 한 곡, 기존 42개 chantEvents 사용
- 마이크 RMS 발성 시작 검출, 응원 시점과 1:1 매칭, ±900ms 점수
- 음성 녹음/저장/전송 없음. 현재 서버 제출/랭킹 기능 없음
- 플레이어 독립 실행: 기존 연습 기록·설정 변경하지 않음
- 헤드셋 권장, 스피커 유입이나 모바일 오디오 정책으로 감지 오차 가능

## GitHub 배포
1. 기존 베타 저장소를 백업합니다. 정식 Re-chant 저장소를 덮어쓰지 마세요.
2. 이 ZIP의 **내용물**을 `Re-chant-beta` 저장소 최상위에 올립니다. `.github/workflows/deploy-pages.yml` 포함.
3. GitHub Settings → Pages → Source: GitHub Actions.
4. Actions에서 Test/Build/Deploy 성공 후 https://remine-app.github.io/Re-chant-beta/ 에 접속합니다.
5. 오디오팩 설치 → LOVE ATTACK 연습 화면 → '도전모드 β' → 마이크 허용 → 도전 시작.

## 로컬 실행
`npm ci && npm test && npm run build && npm run dev`

## 제한사항
- 단어/발음 정확도는 판정하지 않으며 실시간 발성 시점만 비교합니다.
- 각 음성 onset은 단 한 개의 응원 이벤트에만 매칭됩니다. 가까운 이벤트의 개별 발성이 합쳐지면 누락으로 계산될 수 있습니다.
- 현재 서버 및 랭킹 시스템 미연동.

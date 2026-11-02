# Re:chant Challenge beta.3 Build Hotfix

## 수정 내용

기존 저장소에 남아 있는 `src/pages/Challenge.tsx`가 beta.2 채점 타입(`matched`, `total`, `averageErrorMs`, `points`)을 참조하여 beta.3 빌드가 실패하는 문제를 해결합니다.

- `matched`: SUCCESS + GOOD + BAD 개수로 계산합니다. (유효 발성이 매칭된 이벤트 수)
- `total`: 전체 응원 이벤트 개수입니다.
- `averageErrorMs`: 항상 `null`입니다. 평균 타이밍 오차는 타이밍 분석 전용이며 채점 결과에서 계산하지 않습니다.
- `points`: 오래된 페이지의 타입 검사 호환을 위한 선택 필드이며 실제 결과에는 넣지 않습니다. 현재 도전 결과 화면은 등급만 표시합니다.

따라서 타이밍 분석과 채점 데이터 분리 원칙은 유지됩니다. 저장되는 채점 이벤트에는 `points`나 타이밍 오차가 추가되지 않습니다.

## 적용 방법 (PowerShell)

ZIP 압축을 푼 폴더에서 실행합니다. `$repo`를 실제 베타 저장소 경로로 바꾸세요.

```powershell
$repo = "D:\Rescene\Re-chant-beta"
Copy-Item ".\src\features\challenge\scoring.ts" "$repo\src\features\challenge\scoring.ts" -Force
Copy-Item ".\tests\challenge-scoring.mjs" "$repo\tests\challenge-scoring.mjs" -Force

Set-Location $repo
npm test
if ($LASTEXITCODE -ne 0) { throw "테스트 실패 - 업로드 중단" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "빌드 실패 - 업로드 중단" }

git add src/features/challenge/scoring.ts tests/challenge-scoring.mjs
git commit -m "Fix beta 3 legacy challenge type compatibility"
git push origin main
```

기존 `public/content`, `vite.config.ts`, GitHub Actions, 음원팩은 수정하지 않습니다.

## 확인 결과

- 채점/타이밍/구조 테스트: 13/13 통과
- `Challenge.tsx`가 참조하는 네 필드와 호환되는 최소 TypeScript fixture: 통과
- 전체 프로젝트 `npm run build`: 실제 베타 저장소에서 실행 필요

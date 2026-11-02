# Re:chant Challenge β v1.1.0-beta.3

## 업데이트 목표
기존 beta.2의 도전모드 UI와 마이크 입력 흐름은 유지하면서 기록 저장, 채점, 베타 타이밍 분석, 앱 백업/복원 기능을 분리해 추가합니다.

## 주요 변경사항

### 1. 도전 기록
- LOVE ATTACK 도전을 완주할 때마다 IndexedDB에 채점 기록을 누적합니다.
- 기록은 자동 만료하지 않습니다.
- 개인 최고 기록은 곡별 내부 점수로 계산합니다.
- 결과 화면에는 숫자 점수 대신 응원문구별 `SUCCESS / GOOD / BAD / MISS`만 표시합니다.
- 도전 화면 하단 정지 버튼 옆 `기록`에서 이전 결과를 다시 확인할 수 있습니다.

### 2. 채점 엔진 (정식 기능으로 유지)
- SUCCESS: 목표 시점과 차이 150ms 이내, 감점 0
- GOOD: 150ms 초과 ~ 350ms 이내, 감점 0
- BAD: 350ms 초과 ~ 700ms 이내, 감점 1
- MISS: 700ms 이내에 대응하는 유효 발성이 없음, 감점 2
- 내부 랭킹 점수: `max(0, 100 - BAD 개수 - 2 × MISS 개수)`
- 하나의 감지 구간은 한 응원 이벤트에만 배정합니다.
- 이벤트 간 매칭은 전체 유효 매칭 수를 우선 최대화하고, 그 안에서 총 시간 오차가 작아지도록 계산합니다.
- 판정 범위는 베타 초기값이며 실제 사용자 테스트 후 조정할 수 있습니다.

### 3. 타이밍 분석 엔진 (베타 전용)
- 채점 엔진과 별도 모듈 및 별도 IndexedDB 저장소로 관리합니다.
- 채점 등급/점수/감점 값을 타이밍 데이터에 기록하지 않습니다.
- 목표 응원 시각, 실제 발성 시작/종료 시각, 발성 지속시간, RMS 통계, 모든 감지 후보 구간, 마이크 분석 설정을 저장합니다.
- 80ms 미만의 짧은 감지 구간도 타이밍 JSON에는 남깁니다. 채점 엔진만 별도로 80ms 미만 구간을 유효 발성에서 제외합니다.
- 음성 원본은 녹음·저장·전송하지 않습니다.
- 타이밍 분석 JSON은 별도로 내보낼 수 있으며 베타 종료 후 모듈을 제거할 수 있도록 구성했습니다.

### 4. 마이크 준비
- 마이크 권한 연결 후 약 1.5초 동안 주변 소음 기준을 측정합니다.
- 측정 중에도 원본 음성은 저장하지 않습니다.
- 측정 완료 후 도전을 시작할 수 있습니다.

### 5. 데이터 관리
설정에 다음 기능을 추가합니다.
- 채점 기록 JSON 내보내기
- 타이밍 분석 JSON 내보내기
- 전체 앱 백업 JSON 저장
- 전체 앱 백업 복원
- 앱 데이터 초기화 및 재설치

전체 앱 백업에는 닉네임, 앱 설정, 일반 연습 기록, 도전 채점 기록, 타이밍 분석 데이터, 콘텐츠 버전 스냅샷, 설치 음원 메타데이터가 포함됩니다. MP3 파일 자체는 포함하지 않습니다.

초기화는 `rechant.*` LocalStorage 키, 도전 IndexedDB, 설치 음원 IndexedDB, Re:chant 이름의 Cache Storage 캐시 및 해당 앱 경로의 서비스 워커를 정리합니다. 배포된 `public/content` 파일은 서버에 있으므로 삭제하지 않습니다. 초기화 후 음원팩을 다시 설치하고 필요한 경우 전체 앱 백업을 복원합니다.

기존 `rechant-user-backup-1` 형식은 설정 및 일반 연습 기록 복원을 위해 계속 지원합니다. 다만 구형 백업에는 도전 기록이 포함되어 있지 않습니다.

## 변경 파일
- `src/config.ts`
- `src/features/challenge/scoring.ts`
- `src/features/challenge/timing.ts` (신규)
- `src/features/challenge/voice.ts`
- `src/pages/Practice.tsx`
- `src/pages/Settings.tsx`
- `src/repositories/local.ts`
- `src/repositories/challenge.ts` (신규)
- `src/repositories/appBackup.ts` (신규)
- `src/styles/app.css`
- `package.json`, `package-lock.json`
- `tests/challenge-scoring.mjs` (신규)
- `tests/challenge-timing.mjs` (신규)
- `tests/challenge-store.mjs` (신규)
- `tests/challenge-structure.mjs` (신규)

## 적용 시 주의
- 기존 베타 저장소의 `vite.config.ts`, GitHub Actions, `public/content`, 음원팩은 덮어쓰지 않습니다.
- beta.2에서 사용하던 `src/app/App.tsx`는 변경하지 않습니다.
- 현재 beta 저장소의 콘텐츠 그룹 수 테스트가 684/688로 불일치하는 문제는 이번 기능 패치에서 임의로 기준값을 바꾸지 않았습니다. 콘텐츠 정합성 문제를 별도로 해결한 뒤 전체 CI를 통과시켜야 합니다.

## 검증
- 새 채점/타이밍/구조 테스트: 로컬 실행 12/12 통과
- 기존 백업/세션/콘텐츠 구조 일부 테스트: 로컬 실행 21/21 통과
- 수정된 TypeScript 모듈 및 React 페이지: TypeScript 검사(외부 UI 타입 임시 스텁 사용) 통과
- 이 실행 환경에서 `npm ci`가 npm registry 응답 대기로 완료되지 않아, 전체 `npm test`와 실제 Vite production build는 아직 실행 확인하지 못했습니다. 베타 저장소에 적용한 뒤 Node.js 22 환경에서 `npm ci`, `npm test`, `npm run build`를 반드시 실행해야 합니다.

## PowerShell로 적용하기
ZIP 압축을 푼 폴더에서 PowerShell을 열고, 아래 `$repo` 값을 실제 베타 저장소 경로로 바꿔 실행합니다.

```powershell
$repo = "D:\Rescene\Re-chant-beta"

Copy-Item ".\src\*" "$repo\src" -Recurse -Force
Copy-Item ".\tests\challenge-*.mjs" "$repo\tests" -Force
Copy-Item ".\package.json" "$repo\package.json" -Force
Copy-Item ".\package-lock.json" "$repo\package-lock.json" -Force

Set-Location $repo
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci 실패" }
npm test
if ($LASTEXITCODE -ne 0) { throw "테스트 실패 - Git 업로드 중단" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "빌드 실패 - Git 업로드 중단" }

git status
git add src package.json package-lock.json tests/challenge-scoring.mjs tests/challenge-timing.mjs tests/challenge-store.mjs tests/challenge-structure.mjs
git commit -m "Add Challenge beta 3 history and timing analysis"
git push origin main
```

주의: 기존 베타 저장소의 미커밋 변경사항이 있으면 먼저 별도 커밋 또는 백업을 진행합니다. `public/content`, `vite.config.ts`, `.github/workflows`는 이 업데이트 ZIP에 포함되지 않으므로 기존 파일을 유지합니다.

# Re:chant Challenge β — GitHub Actions 수정

## 수정 사항
- `tests/structure.mjs`: 정식 배포 경로 문자열을 하드코딩해서 확인하던 검사를 정식/베타 공용 환경변수 기반 설정 검증으로 변경했습니다.
- `.github/workflows/deploy-pages.yml`: 테스트 단계에도 베타 경로 환경변수를 지정했습니다.
- 나머지 v1.1.0 소스와 도전모드 기능은 변경하지 않았습니다.

## 적용
1. 이 ZIP의 내용은 베타 저장소의 **최상위**에 놓고 기존 파일을 덮어씁니다.
2. `.github` 폴더도 반드시 포함합니다.
3. Settings → Pages → Build and deployment → Source를 GitHub Actions로 설정합니다.
4. Actions의 새 실행에서 `Test`, `Build Vite app`, `Configure GitHub Pages`, `Deploy to GitHub Pages`를 차례대로 확인합니다.

## 확인 필요
- 앞선 첫 실행의 `Get Pages site failed (404)`는 저장소의 Pages 설정 자체가 아직 생성되지 않았거나 권한이 없을 때 발생할 수 있습니다. ZIP 수정만으로 해결된다고 단정할 수 없습니다.
- 사용자가 전달한 두 번째 실행에는 Test 단계의 **구체적인 assertion 실패 로그가 포함되지 않았으므로**, 다른 테스트 오류가 있으면 해당 로그를 확인해야 합니다.

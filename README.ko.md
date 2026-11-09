# IRB Watch (웹 앱)

[English](README.md) | **한국어**

IRB Watch의 웹 앱입니다. 임상연구코디네이터가 병원 IRB(연구윤리 부서) 게시판에서 무엇이 바뀌었는지 보고, AI 요약을 읽고, 버전을 비교하고, 원본 파일을 내려받는 곳입니다. 관리자는 출처, 연구 계정, 지정 사용자를 관리하고 매일의 스캔이 정상인지 한눈에 확인합니다.

| | |
|---|---|
| **이 저장소** | **웹 앱** (Next.js) |
| **백엔드 저장소** | [pjh5474/irb-watch](https://github.com/pjh5474/irb-watch): FastAPI 서버, 데이터베이스 스키마(Supabase 마이그레이션), 주요 문서 |
| **운영 중인 앱** | <https://irb-watch-frontend.vercel.app> · API: <https://irb-api.warwarsn.online> |

앱은 Supabase 데이터베이스를 **로그인한 사용자 본인의 권한으로 직접** 읽으므로, 각자에게 무엇이 보이는지는 행 수준 보안(RLS)이 정합니다. 쓰기, 스캔, 요약, 메일 발송, 파일 링크 발급은 모두 백엔드 API를 거칩니다. 스키마와 그 배경이 되는 결정의 기준은 백엔드 저장소입니다.

## 기능

- **로그인** (계정은 관리자가 만들며 회원가입은 없습니다). 기본은 한국어이고 영어도 지원합니다.
- **현황**: 주요 수치(저장된 문서, 감시 중인 출처, 30일간 신규·수정, 마지막 스캔), 최근 추가된 문서, 변경 내역. 불러오지 못한 수치는 0이 아니라 "—"와 안내로 표시합니다.
- **출처**: 출처별 상태 신호, 문서 목록(페이지 이동, "신규만" 필터), 데이터가 오래되었을 수 있을 때의 안내.
- **문서 페이지**: 버전 이력, 버전 간 단어 단위 비교, 서명된 다운로드 링크가 있는 첨부파일, 짧은 README 형식의 AI 요약(관리자는 다시 요약 가능).
- **설정**: 일일 이메일 요약 켜기/끄기. 메일의 링크로 로그인 없이 쓰는 공개 **수신 중지 페이지**가 있습니다.
- **관리**: 출처 추가, 하나 또는 전체 스캔, 출처별 AI 켜기/끄기, 출처를 회원 전용 연구로 전환(병원 계정 저장, 사용자 지정), 상태 표시등(정상, 스캔 중, 확인 필요, 문제), 본인에게 테스트 메일과 주간 보고 미리보기 보내기.
- **사용감**: 로딩 스켈레톤, 서버 상태 점, 중복 클릭 방지, CSS만 쓰는 은은한 움직임(동작 줄이기 설정 시 꺼짐), 마우스를 올릴 때만 밑줄이 생기는 링크.

회원 전용 연구는 관리자와 지정된 사용자에게만 보이고, 그 외 사람에게는 출처 자체가 없는 것처럼 보입니다.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · next-intl (ko, en) · `@supabase/ssr` · TanStack Query · react-markdown + remark-gfm (렌더링 제한) · Vitest, Testing Library · 엔드투엔드 테스트용 Playwright 설정.

이 Next.js 버전은 많은 도구와 모델이 기억하는 것과 다릅니다. 프레임워크 코드를 바꾸기 전에 `AGENTS.md`와 `node_modules/next/dist/docs/`의 문서를 읽으세요.

## 설치

Node.js와 실행 중인 백엔드(로컬 또는 운영 서버)가 필요합니다.

```bash
npm install
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
# .env.local을 채우세요. 절대 커밋하지 마세요
npm run dev                    # http://localhost:3000
```

| 변수 | 의미 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 프로젝트의 **publishable**(공개) 키 |
| `NEXT_PUBLIC_API_URL` | 백엔드 주소. 예: `http://127.0.0.1:8000` 또는 운영 API |

service-role 키나 secret 키는 이 앱에 절대 넣지 마세요. `NEXT_PUBLIC_`이 붙은 값은 모두 브라우저로 전달됩니다. 로컬 개발에서는 백엔드의 `FRONTEND_ORIGINS`에 `http://localhost:3000`이 들어 있어야 합니다.

## 명령어

```bash
npm run dev            # 개발 서버
npm run build          # 프로덕션 빌드
npm run lint           # eslint
npm test               # vitest, 오프라인
npm run test:e2e       # playwright
npm run gen:api-types  # 운영 API의 /openapi.json에서 API 타입 다시 생성
npm run gen:db-types   # Supabase 프로젝트에서 데이터베이스 타입 다시 생성
```

## 배포

`main` 브랜치에서 Vercel로 배포합니다. Vercel 프로젝트에 위 세 변수를 설정하세요. 백엔드의 `FRONTEND_ORIGINS`에 앱의 정확한 출처(예: `https://irb-watch-frontend.vercel.app`, 끝에 슬래시 없음)가 들어 있어야 하며, 그렇지 않으면 브라우저가 호출을 막습니다. 백엔드 배포는 백엔드 저장소의 `docs/deploy-ec2.md`에 설명되어 있습니다.

## 프로젝트 구조

```
src/
  app/[locale]/        페이지: 로그인, 현황, 출처, 문서, 설정, 관리, 수신 중지
  components/          UI: 대시보드, 문서·출처 화면, 관리 화면, 상태 점, ui/ (shadcn)
  lib/                 API 클라이언트, Supabase 클라이언트, 접근·상태 규칙, 도우미
  i18n/                next-intl 라우팅과 내비게이션
  proxy.ts             세션 갱신과 공개 페이지 구분
messages/              ko.json, en.json (화면에 보이는 모든 글)
tests/                 Vitest 테스트
docs/                  프론트엔드 계획과 결정 기록 (참고용 백엔드 문서 사본 포함)
```

계획과 이유는 이 저장소의 `docs/frontend-plan.md`, `docs/frontend-decisions.md`에, 프로젝트 전체의 결정은 백엔드 저장소의 `docs/decisions.md`에 있습니다.

## 라이선스

모든 권리 보유. 아직 어떤 라이선스도 부여하지 않았습니다.

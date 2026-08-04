import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // lib/** 자체는 원본 DB 클라이언트 직접 호출이 허용되는 영역
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    rules: {},
  },
  {
    // app/** 및 components/** 에서 DB 클라이언트 .from() 직접 호출 경고
    // 신규 코드는 lib/fetcher.ts 또는 lib/hooks/useCachedQuery 를 사용하세요.
    // 기존 코드는 점진적으로 마이그레이션 중이므로 warn 수준으로만 설정합니다.
    files: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.ts", "components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "CallExpression[callee.property.name='from'][callee.object.name='supabase']",
          message:
            "원본 DB 클라이언트(.from()) 직접 호출 대신 lib/fetcher.ts 또는 lib/hooks/useCachedQuery 를 사용하세요. 기존 코드는 단계적으로 마이그레이션 중.",
        },
      ],
    },
  },
  {
    rules: {
      // Keep legacy migration-heavy code lintable without blocking local development.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "off",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Async data and realtime flows use intentionally stable dependency sets.
      "react-hooks/exhaustive-deps": "off",
      // Existing UI components use raw img tags in several preview surfaces.
      "@next/next/no-img-element": "off",
      // Existing data-loading components call setState from effects by design.
      "react-hooks/set-state-in-effect": "off",
      // React compiler rules are too strict for the current legacy code shape.
      "react-hooks/immutability": "off",
      // Render-time Date.now and Math.random are used in non-critical UI helpers.
      "react-hooks/purity": "off",
      // Preserve the existing manual memoization patterns for now.
      "react-hooks/preserve-manual-memoization": "off",
      // Treat prefer-const as cleanup guidance, not a deploy blocker.
      "prefer-const": "warn",
    },
  },
  {
    // 한국어 컴포넌트명이 적용된 파일들에서 react-hooks/rules-of-hooks 의사 에러(False Positive) 비활성화
    files: [
      "app/main/모바일/**/*.tsx",
      "app/main/모바일/**/*.ts",
      "app/main/기능부품/**/*.tsx",
      "app/main/기능부품/**/*.ts"
    ],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // Electron 메인·프리로드 프로세스는 CommonJS 로 동작한다.
    // ESM import 로 바꾸면 Electron 이 로드하지 못하므로 require() 를 허용한다.
    files: ["electron-app/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
    // Local agent worktrees and deployment/build artifacts.
    ".claude/**",
    ".codex-temp/**",
    ".open-next/**",
    ".wrangler/**",
    ".venv/**",
    "android-twa/.gradle/**",
    ".vscode/**",
    // 소스가 아닌 보관·스크래치 디렉터리.
    // 이것들이 빠져 있어서 `npm run lint` 가 3,254건(그중 97.8%가 이 디렉터리들)을 뱉으며
    // 상시 exit 1 이었고, 게이트로 쓸 수 없는 상태였다. app/·lib/ 의 실제 에러는 0건이다.
    "handoff/**",
    "backups/**",
    "scratch/**",
    "scratch_zip/**",
    "tmp/**",
    "tmp_orphan/**",
    "analysis_artifacts/**",
    "outputs/**",
    // 루트에 남아 있는 일회성 조회 스크립트 (gitignore 대상이지만 ESLint 는 .gitignore 를 읽지 않는다).
    "scratch_query*.js",
    "scripts/check_msg_tmpl_cols.js",
    // APK extraction scratch directory contains third-party minified JS.
    "tmp_apk_extract/**",
  ]),
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // lib/** 자체는 raw supabase 직접 호출이 허용되는 영역
    files: ["lib/**/*.ts", "lib/**/*.tsx"],
    rules: {},
  },
  {
    // app/** 및 components/** 에서 supabase.from() 직접 호출 경고
    // 신규 코드는 lib/fetcher.ts 또는 lib/hooks/useCachedQuery 를 사용하세요.
    // 기존 코드는 점진적으로 마이그레이션 중이므로 warn 수준으로만 설정합니다.
    files: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.ts", "components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "CallExpression[callee.property.name='from'][callee.object.name='supabase']",
          message:
            "raw supabase 호출 대신 lib/fetcher.ts 또는 lib/hooks/useCachedQuery 를 사용하세요. 기존 코드는 단계적으로 마이그레이션 중.",
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
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
    // Legacy duplicate tree that is not used by the Next.js app.
    "main/**",
    // Local agent worktrees and deployment/build artifacts.
    ".claude/**",
    ".codex-temp/**",
    ".open-next/**",
    ".wrangler/**",
    ".venv/**",
    "android-twa/.gradle/**",
    ".vscode/**",
    // APK extraction scratch directory contains third-party minified JS.
    "tmp_apk_extract/**",
  ]),
]);

export default eslintConfig;

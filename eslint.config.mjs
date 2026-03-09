import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 스타일/타입 관련 규칙들은 경고 대신 비활성화하여 개발 흐름을 막지 않도록 조정
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "off",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // 데이터 패칭·비동기 로직이 많은 특성상 deps를 엄격히 강제하지 않음
      "react-hooks/exhaustive-deps": "off",
      // 디자인 상 직접 <img>를 사용하는 패턴 허용
      "@next/next/no-img-element": "off",
      // 데이터 로딩 후 setState를 사용하는 일반적인 패턴은 허용
      "react-hooks/set-state-in-effect": "off",
      // React 공식 ESLint의 실험적 불변성 규칙은 현재 코드 패턴과 맞지 않아 비활성화
      "react-hooks/immutability": "off",
      // 렌더링 시 Date.now, Math.random 사용에 대한 순수성 규칙은 실사용 패턴 고려해 비활성화
      "react-hooks/purity": "off",
      // 기존 수동 useMemo 패턴을 React Compiler가 강제하지 않도록 비활성화
      "react-hooks/preserve-manual-memoization": "off",
      // let 대신 const 권장은 경고로만 처리
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
    // Next.js에서 사용하지 않는 레거시 샘플 디렉터리
    "main/**",
    // 작업 중 생성된 별도 worktree는 실제 앱 검증 대상에서 제외
    ".claude/**",
  ]),
]);

export default eslintConfig;

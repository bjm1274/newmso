import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 스타일 관련 규칙들은 경고로만 처리해 개발 흐름을 막지 않도록 조정
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
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
    "next-env.d.ts",
    // Next.js에서 사용하지 않는 레거시 샘플 디렉터리
    "main/**",
  ]),
]);

export default eslintConfig;

// Security-focused ESLint flat config used by the CI Security Scan workflow.
// Runs against src/ only and only enforces the dangerous-pattern rules from
// eslint-plugin-security + eslint-plugin-no-unsanitized. Warnings are kept
// informational; errors fail the job.
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist",
      "build",
      "node_modules",
      "supabase/functions/**",
      "scripts/**",
      "tests/**",
      "src/test/**",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      security,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-unsafe-regex": "warn",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-pseudoRandomBytes": "error",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },
];

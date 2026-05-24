// Security-focused ESLint flat config used by the CI Security Scan workflow.
// Runs against src/ only and only enforces the dangerous-pattern rules from
// eslint-plugin-security + eslint-plugin-no-unsanitized. Warnings are kept
// informational; errors fail the job.
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import reactHooks from "eslint-plugin-react-hooks";
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
    // Register react-hooks so existing `// eslint-disable-next-line react-hooks/*`
    // directives in source files do not trip "rule not found" errors.
    plugins: {
      security,
      "no-unsanitized": noUnsanitized,
      "react-hooks": reactHooks,
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
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
      // Keep react-hooks rules registered but quiet — full project lint runs
      // them in the main eslint.config.js.
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];

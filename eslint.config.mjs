import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "no-debugger": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    "src/lib/test_compliance.js",
    "src/lib/test_d1_integration.js",
    "src/lib/db-migrate.js",
    "src/lib/logger.js",
  ]),
]);

export default eslintConfig;

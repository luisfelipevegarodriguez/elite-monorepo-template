import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-with": "error",
      "no-plusplus": "error",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
      "no-constant-binary-expression": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "warn"
    }
  }
]);

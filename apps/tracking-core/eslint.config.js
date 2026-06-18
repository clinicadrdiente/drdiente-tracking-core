import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "public/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Pragmatic downgrades for an existing codebase that was never linted:
      // surface these as warnings rather than blocking the gate.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // ESLint 10 added these as recommended errors; adopt as warnings on first
      // lint pass so the gate isn't blocked by pre-existing stylistic nits.
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
    },
  },
  prettier,
);

import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "no-console": "off",
    },
  },
  {
    ignores: ["out/**", "dist/**", "node_modules/**", ".vscode-test/**"],
  },
];

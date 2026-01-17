// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["**/*.ts"],
  extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
  },
  ignores: [
    ".svelte-kit",
    "static/libarchive/build/compiled/archive-reader.d.ts",
    "static/libarchive/build/compiled/compressed-file.d.ts",
    "static/libarchive/build/compiled/libarchive.d.ts",
    "static/libarchive/build/compiled/utils.d.ts",
    "**/*.svelte",
    "**/*.js",
  ],
});

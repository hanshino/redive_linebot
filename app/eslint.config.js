const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");
const prettierPlugin = require("eslint-plugin-prettier");

module.exports = [
  js.configs.recommended,
  prettier,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: 2018,
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "prettier/prettier": [
        "error",
        {
          trailingComma: "es5",
          singleQuote: false,
        },
      ],
    },
  },
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];

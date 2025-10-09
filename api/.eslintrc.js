module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
  },
  extends: "eslint:recommended",
  overrides: [
    {
      env: {
        node: true,
      },
      files: [".eslintrc.{js,cjs}"],
      parserOptions: {
        sourceType: "script",
      },
    },
  ],
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "prefer-const": "off",
    semi: "off",
    quotes: "off",
    indent: "off",
    "comma-dangle": "off",
    "arrow-parens": "off",
    "no-multiple-empty-lines": "off",
    "no-prototype-builtins": "off",
  },
};

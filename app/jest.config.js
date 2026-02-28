module.exports = {
  testEnvironment: "node",
  moduleFileExtensions: ["js"],
  transformIgnorePatterns: ["/node_modules/"],
  testMatch: ["<rootDir>/**/__tests__/**/*.test.js", "<rootDir>/**/*.{spec,test}.js"],
  setupFiles: ["./__tests__/setup.js"],
};

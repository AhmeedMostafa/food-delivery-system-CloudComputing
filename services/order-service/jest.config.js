export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.js', '!src/index.js'],
  testMatch: ['**/tests/**/*.test.js'],
};

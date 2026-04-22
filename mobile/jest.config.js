const preset = require('jest-expo/jest-preset');

module.exports = {
  ...preset,
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.test.tsx',
  ],
  setupFiles: [...(preset.setupFiles ?? []), '<rootDir>/jest.setup.ts'],
};

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['Config.ts'],
      rules: {
        quotes: ['error', 'double', {avoidEscape: true}],
      },
    },
  ],
};

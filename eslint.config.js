import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '.next', 'node_modules', 'apps/web', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './packages/contracts/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ command }) => ({
  base: process.env.GITHUB_PAGES
    ? '/Grading-Calculator/'
    : command === 'build'
      ? '/calculator/'
      : '/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
}))

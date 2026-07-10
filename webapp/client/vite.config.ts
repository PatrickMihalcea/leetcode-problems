import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project-page URL is https://<user>.github.io/<repo>/, so the
// build needs that repo name as its base path. Local dev stays at "/".
const REPO_NAME = 'leetcode-problems'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
}))

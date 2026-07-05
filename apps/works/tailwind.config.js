import preset from '../../tailwind-preset.mjs'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/master-data/src/**/*.{ts,tsx}',
  ],
}

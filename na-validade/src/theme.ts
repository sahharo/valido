// Light / dark / automatic (follows the phone) theme. The choice is kept on this device only.
export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'nv-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): ThemeChoice {
  const v = localStorage.getItem(KEY)
  return v === 'dark' || v === 'system' ? v : 'light'
}

function apply() {
  const choice = getTheme()
  const dark = choice === 'dark' || (choice === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1420' : '#f3f1ec')
}

export function setTheme(choice: ThemeChoice) {
  localStorage.setItem(KEY, choice)
  apply()
}

export function initTheme() {
  apply()
  media.addEventListener('change', apply)
}

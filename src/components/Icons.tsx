import type { SVGProps } from 'react'

const paths = {
  arrow: <><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></>,
  book: <><path d="M12 6c-3-3-7-3-9-2v14c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 2Z"/><path d="M12 6v14"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9Z"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>,
  minus: <path d="M5 12h14"/>,
  plus: <path d="M5 12h14M12 5v14"/>,
  play: <path d="m8 5 12 7-12 7Z"/>,
  pause: <path d="M9 5v14m6-14v14"/>,
  replay: <><path d="M4 11a8 8 0 1 1 2 7M4 5v6h6"/></>,
  scroll: <><path d="M7 3h13a2 2 0 0 1 2 2v2h-4M7 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a2 2 0 0 0 2-2v-2H8v2a2 2 0 0 1-2 2M7 3h8a3 3 0 0 1 3 3v11M8 8h6M8 12h6"/></>,
  target: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  people: <><circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/></>,
} as const

export function Icon({name, ...props}: SVGProps<SVGSVGElement> & {name:keyof typeof paths}) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>
}

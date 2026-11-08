import type { CSSProperties } from 'react'
import type { Faction } from './types'

export type FactionLookup = ReadonlyMap<string,Faction>

export function factionStyle(faction:Faction):CSSProperties {
  const channels = [1,3,5].map(index=>parseInt(faction.color.slice(index,index+2),16)/255)
  const luminance = channels.reduce((total,value,i) =>
    total+[.2126,.7152,.0722][i]*(value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4),0)
  return {
    '--faction':faction.color,
    '--faction-light':faction.paperColor,
    '--faction-border':faction.borderColor,
    '--faction-on-color':luminance>.179 ? '#211d17' : '#fff8e6',
  } as CSSProperties
}

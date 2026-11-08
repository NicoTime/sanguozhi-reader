import { factionStyle } from '../faction-style'
import type { FactionLookup } from '../faction-style'
import type { MarchArrow } from '../marches'

export function MarchPaths({arrows,selectedId,factions}:{arrows:MarchArrow[]; selectedId:string|null;factions:FactionLookup}) {
  return <g className="march-paths" aria-hidden="true">
    {arrows.map(({march,from,control,tip,tailLeft,tailRight}) => {
      const d = `M${from.x} ${from.y}Q${control.x} ${control.y} ${tip.x} ${tip.y}`
      const points = [tip,tailLeft,tailRight].map(({x,y}) => `${x},${y}`).join(' ')
      return <g key={march.id} className="march-arrow" data-faction={march.faction} style={factionStyle(factions.get(march.faction)!)} data-selected={selectedId===march.id}
        data-order={march.order}>
        <path className="march-halo" d={d}/>
        <polygon className="march-head-halo" points={points}/>
        <path className="march-shaft" d={d}/>
        <polygon className="march-head" points={points}/>
      </g>
    })}
  </g>
}

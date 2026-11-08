import type { CSSProperties } from 'react'
import { factionStyle } from '../faction-style'
import type { FactionLookup } from '../faction-style'
import type { MarchArrow } from '../marches'
import type { Deployment, HistoricalRiver, HistoricalRivers, March } from '../types'
import { layoutTactics } from '../tactical-layout'
import type { Box, Point } from '../tactical-layout'

type Props = {
  width:number; height:number; project:(coordinates:[number,number])=>Point
  factions:FactionLookup; deployments:Deployment[]; rivers:HistoricalRivers|null; arrows:MarchArrow[]; obstacles:Box[]
  selectedId:string|null; onDeployment:(flag:Deployment)=>void; onRiver:(river:HistoricalRiver)=>void; onMarch:(march:March)=>void
}
export const deploymentPrecision = {'approximate-area':'区域约略', 'relative-only':'态势示意', unlocated:'未定位'} as const
export const riverPaths = (river:HistoricalRiver) => river.geometry.type==='LineString'
  ? [river.geometry.coordinates] : river.geometry.coordinates

export function FlagMark() {
  return <svg className="flag-mark" viewBox="0 0 26 28" fill="none" aria-hidden="true">
    <path d="M5 25V3m-2 22h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M5 5c5.8-3.3 11.2 3.3 17 0l-3.4 6 3.4 5.8c-5.8 3.3-11.2-3.3-17 0V5Z" fill="currentColor"/>
    <path d="M8 7.6c3.1-.6 6.3 2.2 9.5 2" stroke="#fff9e9" strokeWidth="1" strokeLinecap="round"/>
  </svg>
}

function coordinates(box:Box):CSSProperties {
  return {left:box.x,top:box.y,width:box.width,height:box.height}
}

export function TacticalOverlay({width,height,project,deployments,factions,rivers,arrows,obstacles,selectedId,onDeployment,onRiver,onMarch}:Props) {
  if (!width || !height || (!deployments.length && !rivers && !arrows.length)) return null
  const screenFlags = deployments.flatMap(deployment => deployment.coordinates
    ? [{deployment,anchor:project(deployment.coordinates)}] : [])
  const screenRivers = rivers?.features.map(river => ({river,paths:riverPaths(river).map(line => line.map(project))})) ?? []
  const reserved:Box[] = [
    {x:8,y:8,width:155,height:34}, {x:width-74,y:8,width:67,height:76},
    {x:8,y:height-43,width:194,height:40}, {x:width-94,y:height-33,width:91,height:30},
  ]
  const {flagLabels,riverLabels,marchLabels} = layoutTactics(width,height,screenFlags,screenRivers,[...obstacles,...reserved],arrows)
  return <div className="tactical-overlay">
    <svg className="tactical-leaders" width={width} height={height} aria-hidden="true">
      {riverLabels.map(({river,anchor,box}) => <path key={river.properties.id} className="river-leader"
        d={`M${anchor.x} ${anchor.y}L${box.x+box.width/2} ${box.y+box.height/2}`}/>)}
      {flagLabels.map(({deployment,anchor,box}) => <g key={deployment.id} data-faction={deployment.faction} style={factionStyle(factions.get(deployment.faction)!)} className="flag-leader">
        <path d={`M${anchor.x} ${anchor.y}L${box.x+box.width/2} ${box.y+box.height/2}`}/>
        <circle cx={anchor.x} cy={anchor.y} r={3.4}/>
      </g>)}
      {marchLabels.map(({arrow,anchor,box}) => <path key={arrow.march.id} className="march-badge-leader"
        data-faction={arrow.march.faction} style={factionStyle(factions.get(arrow.march.faction)!)} d={`M${anchor.x} ${anchor.y}L${box.x+box.width/2} ${box.y+box.height/2}`}/>)}
    </svg>
    {marchLabels.map(({arrow:{march},box}) => <button type="button" className="march-badge" style={{...coordinates(box),...factionStyle(factions.get(march.faction)!)}} key={march.id}
      data-faction={march.faction} aria-label={`${factions.get(march.faction)!.name}行军 ${march.order}：${march.label}`}
      aria-pressed={selectedId===march.id} onClick={() => onMarch(march)}>{march.order}</button>)}
    {riverLabels.map(({river,box}) => <button type="button" className="historical-river-pin" style={coordinates(box)} key={river.properties.id}
      aria-label={`历史河道：${river.properties.name}`} aria-pressed={selectedId===river.properties.id}
      onClick={() => onRiver(river)}><span className="river-pin-symbol" aria-hidden="true"/> {river.properties.name}</button>)}
    {flagLabels.map(({deployment,box}) => <button type="button" key={deployment.id} className="army-flag" style={{...coordinates(box),...factionStyle(factions.get(deployment.faction)!)}}
      data-faction={deployment.faction} aria-label={`${factions.get(deployment.faction)!.name}军旗：${deployment.label}`}
      aria-pressed={selectedId===deployment.id} onClick={() => onDeployment(deployment)}>
      <FlagMark/><strong>{deployment.label}</strong><small>{factions.get(deployment.faction)!.name}</small>
    </button>)}
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { withinProfile } from '../engine'
import type { ResolvedScene } from '../engine'
import { assetUrl, isMapped, mercatorY, movementLines } from '../geo'
import type { BattlePhase, Deployment, HistoricalRiver, HistoricalRivers, March, Place, Scene } from '../types'
import { projectMarches } from '../marches'
import type { MappedMarch } from '../marches'
import { MarchPaths } from './MarchPaths'
import { riverPaths, TacticalOverlay } from './TacticalOverlay'
import { atlasViewport, overviewPadding } from '../atlas-viewport'
import { atlasLabelPoint } from '../atlas-style'
import type { AtlasFeature } from '../historical-atlas'

type Props = {
  resolved:ResolvedScene
  overview:boolean
  scene:Scene; places:Map<string,Place>; selected:Place|null; onSelect:(id:string)=>void
  phase:BattlePhase|null; rivers:HistoricalRivers|null; selectedTactic:string|null
  onDeployment:(flag:Deployment)=>void; onRiver:(river:HistoricalRiver)=>void
  routes:MappedMarch[]; onMarch:(march:March)=>void
  atlasFeatures:AtlasFeature[]; onAtlasSelect:(feature:AtlasFeature)=>void
}

export function FallbackMap({resolved,overview,scene,places,selected,onSelect,phase,rivers,selectedTactic,onDeployment,onRiver,routes,onMarch,
  atlasFeatures,onAtlasSelect}:Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size,setSize] = useState({width:0,height:0})
  const [failedImages,setFailedImages] = useState<string[]>([])
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({width:entry.contentRect.width,height:entry.contentRect.height})
    })
    observer.observe(ref.current!)
    return () => observer.disconnect()
  }, [])
  const {width,height} = size
  const {mapProfile:profile,camera:{center,points}} = resolved
  const {west,south,east,north} = overview ? atlasViewport.overviewBounds : profile.bounds
  const imagePath = overview ? atlasViewport.imagePath : profile.reliefPath
  const imageBounds = overview ? atlasViewport.imageBounds : profile.bounds
  const baseX = (lon:number) => lon*Math.PI/180
  const baseY = (lat:number) => -mercatorY(lat)
  const focus = selected?.coordinates && withinProfile(selected.coordinates,profile) ? selected.coordinates : center
  const dx = Math.min(.85,(east-west)*.15), dy = Math.min(.43,(north-south)*.15)
  const local = !overview && (points.length>0 || (!!selected?.coordinates && withinProfile(selected.coordinates,profile)))
  const longitudes = local ? [Math.max(west,focus[0]-dx),Math.min(east,focus[0]+dx),...points.map(point=>point[0])] : [west,east]
  const latitudes = local ? [Math.max(south,focus[1]-dy),Math.min(north,focus[1]+dy),...points.map(point=>point[1])] : [south,north]
  const left = baseX(Math.min(...longitudes)), right = baseX(Math.max(...longitudes))
  const top = baseY(Math.max(...latitudes)), bottom = baseY(Math.min(...latitudes))
  const padding = overview ? overviewPadding(width,height) : {left:40,right:40,top:37.5,bottom:37.5}
  const scale = Math.max(.01,Math.min((width-padding.left-padding.right)/(right-left),(height-padding.top-padding.bottom)/(bottom-top)))
  const shiftX = (width-(left+right)*scale)/2
  const shiftY = (height-(top+bottom)*scale)/2
  const project = ([lon,lat]:[number,number]) => ({x:baseX(lon)*scale+shiftX,y:baseY(lat)*scale+shiftY})
  const imageTop = project([imageBounds.west,imageBounds.north]), imageBottom = project([imageBounds.east,imageBounds.south])
  const grid = (min:number,max:number) => {
    const step = local ? 1 : max-min>20 ? 5 : 2
    const first = Math.ceil(min/step), last = Math.floor(max/step)
    return Array.from({length:Math.max(0,last-first+1)},(_,i)=>(first+i)*step)
  }
  const arrows = projectMarches(routes,project)
  const active = new Set(scene.placeIds)
  for (const {march} of routes) {
    if (march.from) active.add(march.from)
    if (march.to) active.add(march.to)
  }
  const dots = [...places.values()].filter(isMapped).filter(place => withinProfile(place.coordinates,profile) && (active.has(place.id) || selected?.id===place.id))
    .map(place => ({place,point:project(place.coordinates)}))
  const obstacles = dots.map(({place,point}) => ({x:point.x-5,y:point.y-9,width:14+12*place.name.length,height:18}))
  const polyline = (line:[number,number][]) => line.map(project).map(({x,y})=>`${x},${y}`).join(' ')
  return <div className="fallback-map" ref={ref}>
    <svg className="fallback-geography" width={width} height={height} aria-label={overview?'全国地势与经纬度方位图':'根据经纬度投影的地点方位图'}>
      <rect width={width} height={height} fill="#e2e0c5"/>
      {!failedImages.includes(imagePath) && <image key={imagePath} href={assetUrl(imagePath)} x={imageTop.x} y={imageTop.y} width={imageBottom.x-imageTop.x} height={imageBottom.y-imageTop.y}
        preserveAspectRatio="none" onError={() => setFailedImages(previous=>[...previous,imagePath])}/>}
      {grid(west,east).map(deg => <path key={deg} d={`M${project([deg,profile.center[1]]).x} 0v${height}`} className="fallback-grid"/>)}
      {grid(south,north).map(deg => <path key={deg} d={`M0 ${project([profile.center[0],deg]).y}h${width}`} className="fallback-grid"/>)}
      {atlasFeatures.filter(feature=>feature.properties.kind==='island').map(feature=>{
        const {x,y} = project(atlasLabelPoint(feature))
        return x>20 && x<width-20 && y>25 && y<height-25 ? <text key={feature.properties.id} x={x} y={y}
          className="fallback-island-label" role="button" tabIndex={0} onClick={()=>onAtlasSelect(feature)}
          onKeyDown={event=>{if (event.key==='Enter' || event.key===' ') {event.preventDefault();onAtlasSelect(feature)}}}>
          {feature.properties.name}</text> : null
      })}
      {rivers?.features.flatMap(river => riverPaths(river).map((line,i) =>
        <g key={`${river.properties.id}-${i}`}><polyline points={polyline(line)} className="fallback-river-corridor"/>
          <polyline points={polyline(line)} className="fallback-river"/></g>))}
      {!phase && scene.marches===undefined && movementLines(scene,places).features.map(({geometry},i) => <polyline key={i}
        points={geometry.coordinates.map(([x,y])=>`${project([x,y]).x},${project([x,y]).y}`).join(' ')} className="fallback-move"/>)}
      <MarchPaths arrows={arrows} factions={resolved.factions} selectedId={selectedTactic}/>
      {dots.map(({place,point}) => <g key={place.id} role="button" tabIndex={0} aria-label={`地图地点：${place.name}`} onClick={() => onSelect(place.id)}
        onKeyDown={event => {if (event.key==='Enter' || event.key===' ') {event.preventDefault();onSelect(place.id)}}}
        transform={`translate(${point.x} ${point.y})`} className="fallback-marker">
        <circle r={selected?.id===place.id?5.5:3.5} fill={place.precision==='site'?'#a54730':'#f1ebd7'} stroke="#a54730" strokeWidth="1.5"/>
        <text x="8" y="3">{place.name}</text>
      </g>)}
    </svg>
    <TacticalOverlay width={width} height={height} project={project} deployments={resolved.mapDeployments} factions={resolved.factions}
      rivers={rivers} arrows={arrows} obstacles={obstacles} selectedId={selectedTactic} onDeployment={onDeployment} onRiver={onRiver} onMarch={onMarch}/>
  </div>
}

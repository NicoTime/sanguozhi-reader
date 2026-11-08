import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { GeoJSONSource, Map as LibreMap, Marker, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { withinProfile } from '../engine'
import type { ResolvedScene } from '../engine'
import { assetUrl, distance, isMapped, movementLines, prefersStill } from '../geo'
import type { XY } from '../geo'
import type { BattlePhase, Deployment, HistoricalRiver, HistoricalRivers, March, Place, Scene } from '../types'

import { projectMarches } from '../marches'
import type { MappedMarch } from '../marches'
import { MarchPaths } from './MarchPaths'
import { TacticalOverlay } from './TacticalOverlay'
import type { Box } from '../tactical-layout'
import { atlasViewport, corners, imageCorners, overviewPadding } from '../atlas-viewport'
import type { FreeViewport } from '../atlas-viewport'
import { atlasLabelPoint, atlasLayerIds, atlasMapLayers, atlasSourceId } from '../atlas-style'
import type { AtlasFeature } from '../historical-atlas'

export type MapActions = {zoom: (step:number)=>void}
export type CameraRequest = {serial:number; place:Place|null; overview?:boolean}
type Props = {
  resolved:ResolvedScene
  scene:Scene; places:Map<string,Place>; selected:Place|null
  phase:BattlePhase|null; rivers:HistoricalRivers|null; selectedTactic:string|null
  onDeployment:(flag:Deployment)=>void; onRiver:(river:HistoricalRiver)=>void
  routes:MappedMarch[]; onMarch:(march:March)=>void
  following:boolean; modern:boolean; camera:CameraRequest; visible:boolean
  freeViewport:RefObject<FreeViewport|null>; appliedRequest:RefObject<number>
  atlasFeatures:AtlasFeature[]; onAtlasSelect:(feature:AtlasFeature)=>void; onAtlasFailure:()=>void
  onManual:()=>void; onPlace:(id:string)=>void; onFailure:(reason:string)=>void
  onNationalFailure:()=>void
  onModernFailure:(layer:'water'|'cities')=>void; onHistoricalFailure:()=>void
}
type MarkerEntry = {place:Place; marker:Marker; element:HTMLButtonElement; label:HTMLSpanElement}
type ModernEntry = {marker:Marker; coordinates:XY}
const blank = {type:'FeatureCollection' as const, features:[]}
const historicalId = 'historical-water'
const modernId = 'modern-water'
const nationalId = 'national-relief'

function overviewOptions(map:LibreMap) {
  const {clientWidth,clientHeight} = map.getContainer()
  return {padding:overviewPadding(clientWidth,clientHeight)}
}

export const MapCanvas = forwardRef<MapActions, Props>(function MapCanvas(props, ref) {
  const root = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LibreMap|null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const [ready, setReady] = useState(false)
  const [overlay, setOverlay] = useState({width:0,height:0,obstacles:[] as Box[]})
  const [atlasLabels,setAtlasLabels] = useState<{feature:AtlasFeature;x:number;y:number}[]>([])
  const markers = useRef<MarkerEntry[]>([])
  const modernMarkers = useRef<ModernEntry[]>([])
  const lastFocus = useRef<XY|null>(null)
  const lastHadAnchors = useRef<boolean|null>(null)

  useImperativeHandle(ref, () => ({zoom(step) {
    const map = mapRef.current
    if (!map) return
    propsRef.current.onManual()
    const currentZoom = map.getZoom()
    const nextZoom = currentZoom+step
    const duration = prefersStill()?0:220
    if (step<0) {
      const bounds = corners(atlasViewport.overviewBounds)
      const options = overviewOptions(map)
      const overview = map.cameraForBounds(bounds,options)
      if (overview?.zoom!==undefined && currentZoom>overview.zoom && nextZoom<=overview.zoom) {
        map.fitBounds(bounds,{...options,duration,linear:true})
        return
      }
    }
    map.zoomTo(nextZoom,{duration})
  }}), [])

  function showMarkers() {
    const map = mapRef.current
    if (!map) return
    const {scene, selected, modern, phase, routes} = propsRef.current
    const activeIds = new Set(scene.placeIds)
    if (scene.marches===undefined && !phase) scene.movements.forEach(move => {activeIds.add(move.from); activeIds.add(move.to)})
    for (const {march} of routes) {
      if (march.from) activeIds.add(march.from)
      if (march.to) activeIds.add(march.to)
    }
    const ordered = [...markers.current].sort((a,b) => priority(b.place.id)-priority(a.place.id))
    const labelRects: Box[] = []
    const width = map.getContainer().clientWidth
    const height = map.getContainer().clientHeight
    const pointRects: XY[] = []
    function priority(id:string) {
      return selected?.id===id ? 4 : scene.focusPlaceId===id ? 3 : activeIds.has(id) ? 2 : 1
    }
    for (const entry of ordered) {
      const id = entry.place.id
      const rank = priority(id)
      const point = map.project(entry.place.coordinates!)
      const onScreen = point.x > -28 && point.y > -28 && point.x < width + 28 && point.y < height + 28
      const behindOther = pointRects.some(([x,y]) => Math.hypot(point.x-x, point.y-y) < (rank > 1 ? 13 : 19))
      const show = onScreen && !behindOther && (rank>1 || propsRef.current.resolved.camera.points.length>0)
      entry.element.hidden = !show
      entry.element.dataset.active = String(rank>1)
      entry.element.dataset.focus = String(rank>=3)
      entry.element.setAttribute('aria-pressed', String(selected?.id===id))
      if (!show) continue
      pointRects.push([point.x,point.y])
      const w = entry.place.name.length * (rank>1 ? 15 : 12) + 14
      const x = point.x + 11, y = point.y
      const label = (rank > 1 || map.getZoom() >= 7.25) && !labelRects.some(rect =>
        Math.abs(rect.y+10-y)<20 && rect.x+rect.width>x && x+w>rect.x)
      entry.label.hidden = !label
      if (label) labelRects.push({x,y:y-10,width:w,height:20})
    }
    for (const entry of modernMarkers.current) {
      const point = map.project(entry.coordinates)
      const el = entry.marker.getElement()
      const crowded = pointRects.some(([x,y]) => Math.hypot(point.x-x, point.y-y)<26) ||
        labelRects.some(rect => Math.abs(rect.y+10-point.y)<17 && rect.x-20<point.x && rect.x+rect.width+20>point.x)
      el.hidden = !modern || crowded || map.getZoom()<6.7
    }
    const atlasRects:Box[] = []
    const zoom = map.getZoom()
    const features = [...propsRef.current.atlasFeatures].sort((a,b)=>
      Number(b.properties.kind==='island')-Number(a.properties.kind==='island') ||
      a.properties.priority-b.properties.priority)
    setAtlasLabels(features.flatMap(feature=>{
      const {kind,priority,name,id} = feature.properties
      if (kind!=='island' && (priority===3 && zoom<6.5 || priority===2 && zoom<4.2 || kind==='seat' && zoom<4.2 ||
          id==='yellow-main' && zoom>=6 && !!propsRef.current.rivers?.features.length)) return []
      const {x,y} = map.project(atlasLabelPoint(feature))
      const labelWidth = Math.min(16,Array.from(name).length)*11+10
      if (x<labelWidth/2 || x>width-labelWidth/2 || y<32 || y>height-35) return []
      const rect = {x:x-labelWidth/2,y:y-9,width:labelWidth,height:18}
      const collides = [...labelRects,...atlasRects].some(other=>
        rect.x<other.x+other.width && rect.x+rect.width>other.x && rect.y<other.y+other.height && rect.y+rect.height>other.y)
      if (collides && kind!=='island') return []
      atlasRects.push(rect)
      return [{feature,x,y}]
    }))
    if (width && height) setOverlay({width,height,obstacles:[
      ...labelRects,
      ...pointRects.map(([x,y]) => ({x:x-8,y:y-8,width:16,height:16})),
    ]})
  }

  useEffect(() => {
    const container = root.current!
    let disposed = false
    let map:LibreMap|undefined
    let observer:ResizeObserver|undefined
    let timeout:number|undefined
    let markersFrame = 0
    let loaded = false
    let nationalFailed = false
    const stopWith = (reason:string) => {if (!disposed) propsRef.current.onFailure(reason)}
    void import('maplibre-gl').then(lib => {
      if (disposed) return
      const {places,resolved:{mapProfile:profile},following,freeViewport} = propsRef.current
      const saved = following ? null : freeViewport.current
      const style:StyleSpecification = {
        version:8,
        sources:{
          [nationalId]:{type:'image',url:assetUrl(atlasViewport.imagePath),coordinates:imageCorners(atlasViewport.imageBounds)},
          relief:{type:'image',url:assetUrl(profile.reliefPath),coordinates:imageCorners(profile.bounds)},
          movements:{type:'geojson',data:blank},
          [historicalId]:{type:'geojson',data:blank},
          [atlasSourceId]:{type:'geojson',data:blank},
        },
        layers:[
          {id:'paper',type:'background',paint:{'background-color':'#d9d8bd'}},
          {id:nationalId,type:'raster',source:nationalId,paint:{'raster-fade-duration':0}},
          {id:'relief',type:'raster',source:'relief',paint:{'raster-fade-duration':0,
            'raster-opacity':['interpolate',['linear'],['zoom'],4.2,0,5.7,1]}},
          ...atlasMapLayers,
          {id:'historic-corridor',type:'line',source:historicalId,layout:{'line-join':'round','line-cap':'round'},
            paint:{'line-color':'#d1e2d2','line-width':9,'line-opacity':0.75}},
          {id:historicalId,type:'line',source:historicalId,layout:{'line-join':'round','line-cap':'round'},
            paint:{'line-color':'#1d625a','line-width':2.65,'line-opacity':0.94,'line-dasharray':[4,2]}},

          {id:'movements',type:'line',source:'movements',layout:{'line-cap':'round'},
            paint:{'line-color':'#9b472f','line-width':2,'line-opacity':0.82,'line-dasharray':[2,3]}},
        ],
      }
      map = new lib.Map({
        container, style, center:saved?.center ?? profile.center, zoom:saved?.zoom ?? (profile.minZoom+profile.maxZoom)/2,
        minZoom:atlasViewport.minZoom, maxZoom:Math.max(profile.maxZoom,saved?.zoom ?? 0),
        maxBounds:corners(atlasViewport.panBounds), renderWorldCopies:false,
        dragRotate:false, pitchWithRotate:false, touchPitch:false, scrollZoom:false,
        attributionControl:false,
      })
      map.touchZoomRotate.disableRotation()
      map.keyboard.disableRotation()
      map.getCanvas().setAttribute('aria-label',`${profile.label}地势交互地图`)
      map.addControl(new lib.ScaleControl({maxWidth:74,unit:'metric'}),'bottom-right')
      mapRef.current = map
      map.on('movestart', event => {
        if ('originalEvent' in event && event.originalEvent) propsRef.current.onManual()
      })
      map.on('move', () => {
        if (map) propsRef.current.freeViewport.current = {center:map.getCenter().toArray(),zoom:map.getZoom()}
        if (!markersFrame) markersFrame = requestAnimationFrame(() => {markersFrame=0;showMarkers()})
      })
      map.on('error', event => {
        const sourceId = (event as {sourceId?:string}).sourceId
        if (sourceId === nationalId) {
          nationalFailed = true
          propsRef.current.onNationalFailure()
          if (loaded) map?.setPaintProperty('relief','raster-opacity',1)
          return
        }
        if (sourceId === modernId) return propsRef.current.onModernFailure('water')
        if (sourceId === historicalId) return propsRef.current.onHistoricalFailure()
        if (sourceId === atlasSourceId) return propsRef.current.onAtlasFailure()
        if (sourceId === 'relief' || !loaded) stopWith('地形底图加载失败，已切换到地点方位图。')
      })
      map.getCanvas().addEventListener('webglcontextlost', () => stopWith('交互地图无法继续显示，已切换到地点方位图。'))
      map.on('load', () => {
        if (disposed || !map) return
        loaded = true
        if (nationalFailed) map.setPaintProperty('relief','raster-opacity',1)
        window.clearTimeout(timeout)
        markers.current = [...places.values()].filter(isMapped).filter(place=>withinProfile(place.coordinates,profile)).map(place => {
          const element = document.createElement('button')
          const dot = document.createElement('span')
          const label = document.createElement('span')
          element.className = 'map-pin'
          element.type = 'button'
          element.setAttribute('aria-label', `地图地点：${place.name}`)
          element.dataset.precision = place.precision
          dot.className = 'pin-dot'
          label.className = 'pin-label'
          label.textContent = place.name
          element.append(dot,label)
          element.addEventListener('click', event => {event.stopPropagation(); propsRef.current.onPlace(place.id)})
          const marker = new lib.Marker({element, anchor:'center'}).setLngLat(place.coordinates).addTo(map!)
          return {place,marker,element,label}
        })
        setReady(true)
        showMarkers()
      })
      map.on('click',event=>{
        const feature = map?.queryRenderedFeatures(event.point,{layers:atlasLayerIds})[0]
        const selected = propsRef.current.atlasFeatures.find(item=>item.properties.id===feature?.properties.id)
        if (selected) propsRef.current.onAtlasSelect(selected)
      })
      observer = new ResizeObserver(() => {
        if (container.offsetWidth && container.offsetHeight) map?.resize()
        showMarkers()
      })
      observer.observe(container)
      timeout = window.setTimeout(() => {if (!loaded) stopWith('地形底图未能及时载入，已切换到地点方位图。')}, 9000)
    }).catch(() => stopWith('此环境无法启动交互地图，已切换到地点方位图。'))

    return () => {
      disposed = true
      cancelAnimationFrame(markersFrame)
      window.clearTimeout(timeout)
      observer?.disconnect()
      markers.current.forEach(entry => entry.marker.remove())
      modernMarkers.current.forEach(entry => entry.marker.remove())
      markers.current = []
      modernMarkers.current = []
      mapRef.current = null
      map?.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    let aborted = false
    let failure = false
    const abort = new AbortController()
    const layer = map.getLayer(modernId)
    if (layer) map.setLayoutProperty(modernId,'visibility', props.modern?'visible':'none')
    showMarkers()
    if (!props.modern) return
    const profile = props.resolved.mapProfile
    if (profile.modernRiversPath && !map.getSource(modernId)) {
      map.addSource(modernId,{type:'geojson',data:assetUrl(profile.modernRiversPath)})
      map.addLayer({id:modernId,type:'line',source:modernId,paint:{'line-color':'#416c9f',
        'line-width':['interpolate',['linear'],['zoom'],6,1.2,10,2.6],'line-opacity':0.82}}, 'historic-corridor')
    }
    if (profile.modernCitiesPath && !modernMarkers.current.length) void Promise.all([
      import('maplibre-gl'), fetch(assetUrl(profile.modernCitiesPath),{signal:abort.signal}).then(response => {
        if (!response.ok) throw Error('modern cities'); return response.json() as Promise<{name:string;coordinates:XY}[]>
      }),
    ]).then(([lib, cities]) => {
      if (aborted) return
      modernMarkers.current = cities.filter(city=>withinProfile(city.coordinates,profile)).map(({name,coordinates}) => {
        const element = document.createElement('div')
        element.className = 'modern-pin'
        element.textContent = name
        const marker = new lib.Marker({element,anchor:'bottom'}).setLngLat(coordinates).addTo(map)
        return {marker,coordinates}
      })
      showMarkers()
    }).catch(() => {if (!aborted && !failure) {failure=true;propsRef.current.onModernFailure('cities')}})
    return () => {aborted=true;abort.abort()}
  }, [ready, props.modern, props.resolved.mapProfile])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    // v1 movement lines span the scene. Phase records have their own
    // actions, and scene-wide lines must not imply the same instant.
    map.getSource<GeoJSONSource>('movements')?.setData(props.phase || props.scene.marches!==undefined ? blank : movementLines(props.scene, props.places))
    showMarkers()
  }, [ready, props.scene, props.selected, props.places, props.phase, props.routes])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    mapRef.current.getSource<GeoJSONSource>(historicalId)?.setData(props.rivers ?? blank)
  }, [ready, props.rivers])

  useEffect(()=>{
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource<GeoJSONSource>(atlasSourceId)?.setData({type:'FeatureCollection',features:props.atlasFeatures})
    map.setPaintProperty('atlas-river','line-opacity',props.rivers?.features.length
      ? ['interpolate',['linear'],['zoom'],5.5,.86,6.5,['case',['==',['get','id'],'yellow-main'],.18,.86]] : .86)
    showMarkers()
  },[ready,props.atlasFeatures,props.rivers])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !props.visible) return
    // Stage and footer heights can change together when a new scene opens.
    // Fit against the current viewport rather than the previous render's size.
    map.resize()
    const requestChanged = props.camera.serial !== props.appliedRequest.current
    props.appliedRequest.current = props.camera.serial
    const duration = prefersStill() || !lastFocus.current ? 0 : 560
    if (requestChanged && props.camera.overview) {
      map.fitBounds(corners(atlasViewport.overviewBounds),{...overviewOptions(map),duration,linear:true})
      return
    }
    if (requestChanged && props.camera.place) {
      const point = props.camera.place.coordinates
      if (point && withinProfile(point,props.resolved.mapProfile))
        map.easeTo({center:point,zoom:Math.max(map.getZoom(),Math.min(props.resolved.mapProfile.maxZoom,8.25)),offset:[0,-26],duration})
      return
    }
    if (!props.following) return
    const {camera:{center,points},mapProfile:profile} = props.resolved
    const {west,south,east,north} = profile.bounds
    const allVisible = points.every(point => {
      const pixel = map.project(point)
      return pixel.x > 48 && pixel.y > 55 && pixel.x < map.getContainer().clientWidth-60 &&
        pixel.y < map.getContainer().clientHeight-50
    })
    const hasAnchors = points.length>0
    if (!requestChanged && lastHadAnchors.current===hasAnchors && lastFocus.current &&
        distance(lastFocus.current,center)<0.4 && allVisible) return
    lastFocus.current = center
    lastHadAnchors.current = hasAnchors
    const halfLon = Math.min(.68,(east-west)*.12), halfLat = Math.min(.32,(north-south)*.12)
    const longitudes = hasAnchors ? [Math.max(west,center[0]-halfLon),Math.min(east,center[0]+halfLon),...points.map(p=>p[0])] : [west,east]
    const latitudes = hasAnchors ? [Math.max(south,center[1]-halfLat),Math.min(north,center[1]+halfLat),...points.map(p=>p[1])] : [south,north]
    const width = map.getContainer().clientWidth
    const height = map.getContainer().clientHeight
    const h = Math.min(73,Math.max(26,width*0.15)), v = Math.min(70,Math.max(24,height*0.15))
    map.fitBounds([[Math.min(...longitudes),Math.min(...latitudes)],[Math.max(...longitudes),Math.max(...latitudes)]],
      {padding:{top:v,right:h,bottom:v,left:h},maxZoom:profile.maxZoom,duration,linear:true})
  }, [ready, props.resolved, props.following, props.camera, props.visible, overlay.width, overlay.height])

  const map = ready ? mapRef.current : null
  const arrows = map ? projectMarches(props.routes, point=>map.project(point)) : []
  return <div className="map-canvas" ref={root} aria-label="地形与历史地点">
    {!ready && <div className="map-loading" role="status">正在绘制地形…</div>}
    {arrows.length>0 && <svg className="march-map-layer" width={overlay.width} height={overlay.height} aria-hidden="true">
      <MarchPaths arrows={arrows} factions={props.resolved.factions} selectedId={props.selectedTactic}/>
    </svg>}
    {map && <TacticalOverlay {...overlay} project={point => map.project(point)}
      deployments={props.resolved.mapDeployments} factions={props.resolved.factions} rivers={props.rivers} arrows={arrows} selectedId={props.selectedTactic}
      onDeployment={props.onDeployment} onRiver={props.onRiver} onMarch={props.onMarch}/>}
    {atlasLabels.map(({feature,x,y})=><button type="button" className="atlas-feature-label" key={feature.properties.id}
      data-kind={feature.properties.kind} data-feature-id={feature.properties.id} style={{left:x,top:y}}
      onClick={event=>{event.stopPropagation();props.onAtlasSelect(feature)}}>{feature.properties.name}</button>)}
  </div>
})

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { assetUrl, movementLines, relatedScenes } from '../geo'
import { resolveScene, riversForScene, sceneYear } from '../engine'
import { parseHistoricalRivers } from '../types'
import type { BattlePhase, Chapter, Deployment, HistoricalRiver, HistoricalRivers, March, Place, Scene, Source } from '../types'
import { FallbackMap } from './FallbackMap'
import { ArmyCard, MarchCard, MarchList, PhasePicker, PhaseSummary, RiverCard } from './TacticalCards'
import { Icon } from './Icons'
import { LocationCard } from './LocationCard'
import { MapCanvas } from './MapCanvas'
import type { CameraRequest, MapActions } from './MapCanvas'
import type { FreeViewport } from '../atlas-viewport'
import { atlasFeatures, atlasManifestSchema, parseAtlas, referenceSnapshot } from '../historical-atlas'
import type { AtlasData, AtlasFeature, AtlasLayers } from '../historical-atlas'
import { useReaderResource } from '../use-reader-resource'
import { AtlasFeatureDialog } from './ReaderDialogs'

type Props = {
  panelRef: RefObject<HTMLElement|null>; chapter:Chapter; scene:Scene
  places:Map<string,Place>; sources:Map<string,Source>; selected:Place|null; cameraRequest:number|null
  mobileOpen:boolean; setMobileOpen:(open:boolean)=>void; onSelect:(id:string)=>void
  onClose:()=>void; onNavigate:(id:string)=>void
}

type RiverState = {status:'loading'|'unavailable'|'error'} | {status:'ready';data:HistoricalRivers}
type TacticSelection = {kind:'army'|'river'|'march'; id:string; sceneId:string; phaseId?:string; at:'map'|'footer'}
const emptyAtlas:AtlasFeature[] = []

export function MapPanel({panelRef,chapter,scene,places,sources,selected,cameraRequest,mobileOpen,setMobileOpen,onSelect,onClose,onNavigate}:Props) {
  const [following, setFollowing] = useState(true)
  const [overview, setOverview] = useState(false)
  const [modern, setModern] = useState(false)
  const [failure, setFailure] = useState('')
  const [nationalFailure, setNationalFailure] = useState(false)
  const [modernWaterFailed, setModernWaterFailed] = useState(false)
  const [modernCitiesFailed, setModernCitiesFailed] = useState(false)
  const modernFailure = modernWaterFailed || modernCitiesFailed
  const [historicalFailure, setHistoricalFailure] = useState(false)
  const [atlasError,setAtlasError] = useState(false)
  const [atlasData,setAtlasData] = useState<AtlasData|null>(null)
  const [atlasLayers,setAtlasLayers] = useState<AtlasLayers>({region:true,seat:true,water:true})
  const [snapshotId,setSnapshotId] = useState<string|null>(null)
  const [atlasSelection,setAtlasSelection] = useState<AtlasFeature|null>(null)
  const atlasResource = useReaderResource('/data/atlas-v7/manifest.json',atlasManifestSchema.parse)
  const manifest = atlasResource.state==='ready' ? atlasResource.data : undefined
  const [riverState, setRiverState] = useState<RiverState>({status:chapter.historicalRiver.geojsonPath?'loading':'unavailable'})
  const [riverAttempt,setRiverAttempt] = useState(0)
  const [phaseChoice,setPhaseChoice] = useState<{sceneId:string;phaseId:string}|null>(null)
  const [tactic,setTactic] = useState<TacticSelection|null>(null)
  const [camera, setCamera] = useState<CameraRequest>({serial:0,place:null})
  const actions = useRef<MapActions>(null)
  const appliedCamera = useRef<number|null>(null)
  const appliedRequest = useRef(0)
  const freeViewport = useRef<FreeViewport|null>(null)
  const scenePlaces = scene.placeIds.map(id => places.get(id)!)
  const phaseId = phaseChoice?.sceneId===scene.id ? phaseChoice.phaseId : undefined
  const resolved = useMemo(() => resolveScene(chapter,{sceneId:scene.id,phaseId}),[chapter,scene.id,phaseId])
  const {phase,phases,marches,routes,mapProfile,factions,historicalRiverIds} = resolved
  const hasSceneLocations = resolved.camera.points.length>0
  const showTactics = !!phase && (phases.length>1 || resolved.deployments.length>0 || marches.length>0)
  const hasLines = scene.marches===undefined && !phase && movementLines(scene,places).features.length>0
  const historical = chapter.historicalRiver
  const riverCollection = riverState.status==='ready' && (failure || !historicalFailure) ? riverState.data : null
  const rivers = useMemo(() => riversForScene(riverCollection,historicalRiverIds),[riverCollection,historicalRiverIds])
  const sceneUsesRivers = historicalRiverIds?.length!==0
  const hasModern = !!(mapProfile.modernRiversPath || mapProfile.modernCitiesPath || atlasData)
  const snapshot = manifest && (manifest.snapshots.find(item=>item.id===snapshotId) ?? referenceSnapshot(manifest,scene.time))
  const coastNote = atlasData?.features.find(feature=>feature.properties.id==='eastsea')
  const visibleAtlas = useMemo(()=>atlasData && snapshot
    ? atlasFeatures(atlasData,snapshot.id,atlasLayers,modern) : emptyAtlas,[atlasData,snapshot,atlasLayers,modern])
  const activeTactic = !selected && tactic?.sceneId===scene.id && tactic.phaseId===phase?.id ? tactic : null
  const selectedFlag = activeTactic?.kind==='army' ? phase?.deployments.find(flag=>flag.id===activeTactic.id) : undefined
  const selectedMarch = activeTactic?.kind==='march' ? marches.find(march=>march.id===activeTactic.id) : undefined
  const selectedRiver = activeTactic?.kind==='river' ? rivers?.features.find(river=>river.properties.id===activeTactic.id) : undefined

  useEffect(()=>{
    if (!manifest) return
    const controller = new AbortController()
    fetch(assetUrl(manifest.geojsonPath),{signal:controller.signal,cache:'no-cache'})
      .then(response=>{
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      }).then(raw=>{
        if (!controller.signal.aborted) setAtlasData(parseAtlas(raw,manifest))
      }).catch(()=>{
        if (!controller.signal.aborted) setAtlasError(true)
      })
    return ()=>controller.abort()
  },[manifest])

  useEffect(() => {
    const path = historical.geojsonPath
    if (!path) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(assetUrl(path),{signal:controller.signal,cache:'no-cache'})
        if (!response.ok) throw new Error(`历史河道读取失败：HTTP ${response.status}`)
        const data = parseHistoricalRivers(await response.json(),chapter)
        if (!controller.signal.aborted) setRiverState({status:'ready',data})
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('历史河道载入失败',error)
          setRiverState({status:'error'})
        }
      }
    })()
    return () => controller.abort()
  }, [chapter,historical.geojsonPath,riverAttempt])

  useEffect(() => {
    setFailure('')
    setNationalFailure(false)
    setModernWaterFailed(false)
    setModernCitiesFailed(false)
    setHistoricalFailure(false)
  }, [mapProfile.id])

  useEffect(() => {
    setPhaseChoice(null)
    setTactic(null)
  }, [scene.id])

  useEffect(() => {
    if (selected) setTactic(null)
  }, [selected])

  useEffect(() => {
    if (cameraRequest===null || cameraRequest===appliedCamera.current || !selected) return
    appliedCamera.current = cameraRequest
    setCamera(previous => ({serial:previous.serial+1,place:selected}))
  }, [cameraRequest,selected])

  function choosePhase(next:BattlePhase) {
    if (phase?.id===next.id) return
    onClose()
    setTactic(null)
    setPhaseChoice({sceneId:scene.id,phaseId:next.id})
  }

  function selectPlace(id:string) {
    setTactic(null)
    onSelect(id)
  }
  function selectAtlas(feature:AtlasFeature) {
    setTactic(null)
    onClose()
    setAtlasSelection(feature)
  }

  function selectDeployment(flag:Deployment, at:'map'|'footer' = 'map') {
    onClose()
    setTactic({kind:'army',id:flag.id,sceneId:scene.id,phaseId:phase?.id,at})
  }

  function selectRiver(river:HistoricalRiver, at:'map'|'footer' = 'map') {
    onClose()
    setTactic({kind:'river',id:river.properties.id,sceneId:scene.id,phaseId:phase?.id,at})
  }

  function selectMarch(march:March, at:'map'|'footer' = 'map') {
    onClose()
    setTactic({kind:'march',id:march.id,sceneId:scene.id,phaseId:phase?.id,at})
  }

  function resume() {
    setTactic(null)
    onClose()
    setFollowing(true)
    setOverview(false)
    setCamera(previous => ({serial:previous.serial+1,place:null}))
  }
  function showOverview() {
    setTactic(null)
    onClose()
    setFollowing(false)
    setOverview(true)
    setCamera(previous => ({serial:previous.serial+1,place:null,overview:true}))
  }
  function retry() {
    setFailure('')
    setNationalFailure(false)
    setModernWaterFailed(false)
    setModernCitiesFailed(false)
    setHistoricalFailure(false)
  }

  function retryRiver() {
    setHistoricalFailure(false)
    setRiverState({status:'loading'})
    setRiverAttempt(value=>value+1)
  }

  const tacticalCard = selectedFlag && phase
    ? <ArmyCard flag={selectedFlag} phase={phase} chapter={chapter} factions={factions} places={places} sources={sources} onClose={() => setTactic(null)}/>
    : selectedMarch && phase
      ? <MarchCard march={selectedMarch} phase={phase} chapter={chapter} factions={factions} sources={sources} onClose={() => setTactic(null)}/>
      : selectedRiver && <RiverCard river={selectedRiver} sources={sources} onClose={() => setTactic(null)}/>

  return <section className="atlas" aria-labelledby="map-title" ref={panelRef} tabIndex={-1} data-mobile-open={mobileOpen}>
    <header className="atlas-header">
      <div>
        <p className="eyebrow"><span className="atlas-index">01</span> 地势图 · {mapProfile.label}</p>
        <h2 id="map-title">{scene.title}</h2>
        <p className="atlas-time">{[...new Set([scene.time.era,sceneYear(scene.time)])].join(' · ')}</p>
        {!hasSceneLocations && <p className="map-location-unknown">本段没有可核定的地图位置</p>}
      </div>
      <div className="atlas-header-tools">
        {hasModern && <button className="quiet-button modern-switch" type="button" aria-pressed={modern} disabled={!!failure}
          onClick={() => setModern(value => !value)}><Icon name="layers"/>现代对照<span className="switch-indicator" aria-hidden="true"/></button>}
        <button className="icon-button mobile-map-toggle" type="button" onClick={() => setMobileOpen(!mobileOpen)}
          aria-controls="map-contents" aria-expanded={mobileOpen} aria-label={mobileOpen?'收起地图':'展开地图'} title={mobileOpen?'收起地图':'展开地图'}><Icon name="chevron"/></button>
      </div>
    </header>
    <div className="atlas-body" id="map-contents">
      {manifest && atlasData && !failure && <div className="atlas-layer-tools">
        <div role="group" aria-label="历史地图图层">
          {([['region','州郡概略'],['seat','治所'],['water','古河湖海岸']] as const).map(([key,label])=>
            <button type="button" key={key} className="quiet-button" aria-pressed={atlasLayers[key]}
              onClick={()=>setAtlasLayers(previous=>({...previous,[key]:!previous[key]}))}>{label}</button>)}
        </div>
        <div className="atlas-snapshot">
          <select aria-label="参考断面" value={snapshotId ?? ''} onChange={event=>{setSnapshotId(event.target.value||null);setAtlasSelection(null)}}>
            <option value="">随文 · 参考 {snapshot?.year} 年</option>
            {manifest.snapshots.map(item=><option key={item.id} value={item.id}>参考 {item.year} 年</option>)}
          </select>
        </div>
        <p className="atlas-period">
          {snapshotId ? `手动参考断面 · ${snapshot?.year} 年` : scene.time.year===null
            ? '本段年代未定，显示参考断面'
            : scene.time.certainty==='inferred' ? '本段纪年为推定，显示最近参考断面' : snapshot?.label}
        </p>
      </div>}
      {showTactics && phase && <PhasePicker phases={phases} selected={phase} onChange={choosePhase}/>}
      <div className="map-stage">
        {failure ? <FallbackMap key={mapProfile.id} resolved={resolved} scene={scene} places={places} selected={selected} onSelect={selectPlace} overview={overview}
          phase={phase} rivers={rivers} routes={routes} onMarch={selectMarch} selectedTactic={activeTactic?.id ?? null} onDeployment={selectDeployment} onRiver={selectRiver}
          atlasFeatures={visibleAtlas} onAtlasSelect={selectAtlas}/> :
          <MapCanvas key={mapProfile.id} ref={actions} resolved={resolved} scene={scene} places={places} selected={selected} following={following}
            phase={phase} rivers={rivers} routes={routes} onMarch={selectMarch} selectedTactic={activeTactic?.id ?? null} onDeployment={selectDeployment} onRiver={selectRiver}
            modern={modern && hasModern} camera={camera} visible={mobileOpen || !matchMedia('(max-width: 860px)').matches}
            freeViewport={freeViewport} appliedRequest={appliedRequest} onNationalFailure={() => setNationalFailure(true)}
            atlasFeatures={visibleAtlas} onAtlasSelect={selectAtlas} onAtlasFailure={()=>setAtlasError(true)}
            onManual={() => setFollowing(false)} onPlace={selectPlace} onFailure={setFailure}
            onModernFailure={layer => layer==='water' ? setModernWaterFailed(true) : setModernCitiesFailed(true)} onHistoricalFailure={() => setHistoricalFailure(true)}/>}
        <div className="map-mode">
          <span className="map-mode-dot"/>{failure ? (overview ? '全国地势 · 静态' : '地点方位图') : modern && hasModern ? (modernFailure ? '现代对照有缺失' : '历史地图 + 现代对照') : !hasSceneLocations && following ? '区域底图 · 本段未定位' : rivers ? '历史地望 · 现代地势' : '古地名 · 现代地势'}
        </div>
        <div className="map-compass" aria-label="上方为北"><span>北</span><svg viewBox="0 0 24 32" width="18" height="24" aria-hidden="true"><path d="m12 2 8 25-8-5-8 5z" fill="#f9f3df" stroke="currentColor"/><path d="M12 2v20l-8 5z" fill="currentColor"/></svg></div>
        {!failure && <div className="map-tools">
          <button className="icon-button" type="button" aria-label="放大地图" onClick={() => actions.current?.zoom(1)}><Icon name="plus"/></button>
          <button className="icon-button" type="button" aria-label="缩小地图" onClick={() => actions.current?.zoom(-1)}><Icon name="minus"/></button>
        </div>}
        {selected && <div className="map-detail">
          <LocationCard place={selected} sources={sources} related={relatedScenes(chapter,selected.id)} activeId={scene.id}
            onClose={onClose} onNavigate={id => {onClose();onNavigate(id)}}/>
        </div>}
        {activeTactic?.at==='map' && tacticalCard && <div className="map-detail">{tacticalCard}</div>}
        <div className="map-follow">
          {!failure && <span className="follow-indicator" data-following={following}><i/>{following ? '镜头跟随' : '跟随已暂停'}</span>}
          <button className="quiet-button" type="button" onClick={showOverview}><Icon name="compass"/>天下总览</button>
          <button className="quiet-button" type="button" onClick={resume}><Icon name="target"/>回到本段</button>
        </div>
      </div>
      <footer className="atlas-footer">
        {failure && <div className="map-alert" role="status"><span>{failure}</span><button type="button" className="text-button" onClick={retry}>重试地图</button></div>}
        {!failure && nationalFailure && <p className="map-alert" role="status">全国地势加载失败，仍可查看本段区域底图。</p>}
        {(atlasError || atlasResource.state==='error') && <p className="map-alert" role="status">历史图集暂不可用，仍可查看本段地图。</p>}
        {!failure && modern && modernFailure && <p className="map-alert" role="status">部分现代参考图层载入失败。</p>}
        {(sceneUsesRivers && (riverState.status==='error' || (historicalFailure && !failure))) &&
          <div className="map-alert" role="status"><span>历史河道图层载入失败。</span>
            <button type="button" className="text-button" onClick={retryRiver}>重试河道</button></div>}
        {showTactics && phase && <PhaseSummary factions={factions} phase={phase} selected={activeTactic?.id ?? null} onSelect={flag=>selectDeployment(flag,'footer')}/>}
        {activeTactic?.at==='footer' && selectedFlag && <div className="tactical-footer-detail">{tacticalCard}</div>}
        {marches.length>0 && <MarchList factions={factions} marches={marches} selectedId={activeTactic?.id ?? null}
          onSelect={march=>selectMarch(march,'footer')}/>}
        {activeTactic?.at==='footer' && selectedMarch && <div className="tactical-footer-detail">{tacticalCard}</div>}
        <div className="map-place-list">
          <span>本段地点</span>
          {scenePlaces.length ? scenePlaces.map(place => <button key={place.id} type="button" aria-pressed={selected?.id===place.id}
            onClick={() => selectPlace(place.id)}>{place.name}</button>) : <span>本段无标记地点</span>}
        </div>
        <div className="map-legend">
          <span><i className="legend-active"/>本段地点</span><span><i className="legend-approx"/>约略或存疑</span>
          {routes.length>0 && <span><i className="legend-march"/>行军方向 · 示意</span>}
          {hasLines && <span><i className="legend-line"/>行动示意</span>}
          {modern && mapProfile.modernRiversPath && !failure && !modernWaterFailed && <span><i className="legend-river"/>现代河流</span>}
          {rivers && <span><i className="legend-historic"/>历史河道 · 约略示意</span>}
          {atlasData && !failure && atlasLayers.region && <span><i className="legend-atlas-area"/>州区概略 · 示意</span>}
          {atlasData && !failure && atlasLayers.water && <span><i className="legend-atlas-water"/>古河湖与已考海岸 · 示意</span>}
          {coastNote && atlasLayers.water && <button type="button" className="text-button" onClick={()=>selectAtlas(coastNote)}>东海岸线说明</button>}
          {resolved.deployments.length>0 && <span><i className="legend-deployment"/>军旗 · 区域态势</span>}
        </div>
        {hasLines && <p className="map-movements">行动示意 · {scene.movements.map(move => move.label).join('；')}</p>}
        <p className="map-attribution">
          {rivers ? <span className="river-index">
            {rivers.features.map(river => <button type="button" className="text-button" key={river.properties.id}
              onClick={() => selectRiver(river,'footer')}>{river.properties.name} · 出处</button>)}
          </span> : <span className="river-status" title={historical.explanation}>
            {historical.status==='unavailable' ? '本篇历史河道尚未复原' :
              !sceneUsesRivers ? '本段无历史河道图层' : riverState.status==='loading' ? '正在载入历史河道…' : '历史河道未显示'}
          </span>}
          <span className="map-credit">地图资料 · {mapProfile.attribution} 全国地势海陆参考为现代 Natural Earth。</span>
        </p>
        {activeTactic?.at==='footer' && selectedRiver && <div className="tactical-footer-detail">{tacticalCard}</div>}
      </footer>
    </div>
    {manifest && atlasSelection && <AtlasFeatureDialog feature={atlasSelection} manifest={manifest} close={()=>setAtlasSelection(null)}/>}
  </section>
}

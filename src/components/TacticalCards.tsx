import type { BattlePhase, Chapter, Deployment, HistoricalRiver, March, Place, Source } from '../types'
import { Icon } from './Icons'
import { SourceLink } from './Sources'
import { factionStyle } from '../faction-style'
import type { FactionLookup } from '../faction-style'
import { deploymentPrecision, FlagMark } from './TacticalOverlay'

export function PhasePicker({phases,selected,onChange}:{phases:BattlePhase[];selected:BattlePhase;onChange:(phase:BattlePhase)=>void}) {
  return <div className="phase-picker">
    <span className="phase-caption">态势时点</span>
    <div className="phase-options" role="group" aria-label="态势阶段">
      {phases.map((phase,index) => <button type="button" key={phase.id} onClick={() => onChange(phase)}
        aria-pressed={selected.id===phase.id} title={phase.title}><i>{String(index+1).padStart(2,'0')}</i>{phase.title}</button>)}
    </div>
  </div>
}

function Evidence({ids,sources}:{ids:string[];sources:Map<string,Source>}) {
  return <p className="location-sources">出处：{ids.map(id => <SourceLink source={sources.get(id)!} key={id}/>)}</p>
}

export function PhaseSummary({phase,selected,onSelect,factions}:{phase:BattlePhase;factions:FactionLookup;selected:string|null;onSelect:(flag:Deployment)=>void}) {
  return <div className="phase-summary" aria-label="本阶段态势">
    {phase.deployments.length>0 && <div className="army-roster">
      {phase.deployments.map(flag => <button type="button" key={flag.id} data-faction={flag.faction} style={factionStyle(factions.get(flag.faction)!)}
        aria-pressed={selected===flag.id} onClick={() => onSelect(flag)} title={`${factions.get(flag.faction)!.name} · ${deploymentPrecision[flag.precision]}`}>
        <FlagMark/><b>{flag.label}</b><small>{factions.get(flag.faction)!.name}{flag.coordinates ? '' : ' · 未定位'}</small>
      </button>)}
    </div>}
    <p>{phase.summary}</p>
  </div>
}

type CardProps = {sources:Map<string,Source>;onClose:()=>void}
export function ArmyCard({flag,phase,chapter,places,sources,onClose,factions}:CardProps & {
  flag:Deployment;phase:BattlePhase;chapter:Chapter;places:Map<string,Place>;factions:FactionLookup
}) {
  const commander = chapter.persons.find(person => person.id===flag.commanderId)
  const place = flag.placeId ? places.get(flag.placeId) : undefined
  return <aside className="location-card tactical-card army-card" data-faction={flag.faction} style={factionStyle(factions.get(flag.faction)!)} aria-label={`${flag.label}军旗详情`}>
    <div className="location-heading">
      <div><p className="eyebrow"><FlagMark/>{factions.get(flag.faction)!.name} · {phase.title}</p><h3>{flag.label}</h3></div>
      <button type="button" className="icon-button" aria-label="关闭军旗详情" onClick={onClose}><Icon name="close"/></button>
    </div>
    <p className="location-modern"><strong>{flag.role}</strong><span>{deploymentPrecision[flag.precision]}</span></p>
    {commander && <p className="location-note"><b>统帅</b>　{commander.name}</p>}
    <p className="location-note"><b>此时行动</b>　{flag.action}</p>
    <p className="location-note"><b>{place ? `位置依据 · ${place.name}` : '位置依据'}</b>　{flag.positionBasis}</p>
    <Evidence ids={flag.sourceIds} sources={sources}/>
  </aside>
}

export function RiverCard({river,sources,onClose}:CardProps & {river:HistoricalRiver}) {
  const {name,period,precisionNote,method,sourceIds} = river.properties
  return <aside className="location-card tactical-card river-card" aria-label={`${name}河道详情`}>
    <div className="location-heading">
      <div><p className="eyebrow">历史河道 · {period}</p><h3>{name}</h3></div>
      <button type="button" className="icon-button" aria-label="关闭河道详情" onClick={onClose}><Icon name="close"/></button>
    </div>
    <p className="location-modern"><span>约略示意</span></p>
    <p className="location-note"><b>精度</b>　{precisionNote}</p>
    <p className="location-note"><b>线位依据</b>　{method}</p>
    <Evidence ids={sourceIds} sources={sources}/>
  </aside>
}

export function MarchList({marches,selectedId,onSelect,factions}:{
  marches:March[];factions:FactionLookup; selectedId:string|null; onSelect:(march:March)=>void
}) {
  return <section className="march-index" aria-label="本阶段行军顺序">
    <div className="march-index-heading"><strong>行军顺序</strong><span>编号按本段各军分别计</span></div>
    <div className="march-index-items">
      {marches.map(march => <button type="button" className="march-index-button" data-faction={march.faction} style={factionStyle(factions.get(march.faction)!)} key={march.id}
        aria-pressed={selectedId===march.id} onClick={() => onSelect(march)}>
        <span className="march-index-order">{march.order}</span><small>{factions.get(march.faction)!.name}</small><span>{march.label}</span>
        {march.precision==='unlocated' && <small className="march-unmapped">未绘路线</small>}
      </button>)}
    </div>
  </section>
}

export function MarchCard({march,phase,chapter,sources,onClose,factions}:CardProps & {
  march:March;phase:BattlePhase;chapter:Chapter;factions:FactionLookup
}) {
  const commander = chapter.persons.find(person => person.id===march.commanderId)
  return <aside className="location-card tactical-card march-card" data-faction={march.faction} style={factionStyle(factions.get(march.faction)!)} aria-label={`${march.label}行军详情`}>
    <div className="location-heading">
      <div><p className="eyebrow">行军 {march.order} · {factions.get(march.faction)!.name} · {phase.title}</p><h3>{march.label}</h3></div>
      <button type="button" className="icon-button" aria-label="关闭行军详情" onClick={onClose}><Icon name="close"/></button>
    </div>
    <div className="march-endpoints" aria-label="出发与到达">
      <div><small>出发</small><strong>{march.fromLabel}</strong></div>
      <Icon name="arrow"/>
      <div><small>到达</small><strong>{march.toLabel}</strong></div>
    </div>
    <p className="location-modern"><span>{march.precision==='schematic' ? '区域方向示意' : '地望未定 · 未绘路线'}</span>
      {commander && <strong>统帅　{commander.name}</strong>}</p>
    <p className="location-note">{march.description}</p>
    <Evidence ids={march.sourceIds} sources={sources}/>
  </aside>
}

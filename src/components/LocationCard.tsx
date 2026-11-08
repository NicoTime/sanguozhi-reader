import { Icon } from './Icons'
import { SourceLink } from './Sources'
import type { Place, Scene, Source } from '../types'

export const precisionNames: Record<Place['precision'], string> = {
  site:'遗址位置', 'approximate-area':'区域约略', uncertain:'定位存疑', unlocated:'未定位',
}
const kindNames: Record<Place['kind'],string> = {
  city:'城址', county:'县域', ford:'津渡', battlefield:'战场', region:'区域', other:'地点',
}

type Props = {place:Place; sources:Map<string, Source>; related:Scene[]; activeId:string; onClose:()=>void;
  onNavigate:(id:string)=>void; onShowMap?:()=>void}
export function LocationCard({place, sources, related, activeId, onClose, onNavigate, onShowMap}:Props) {
  return <aside className="location-card" aria-label={`${place.name}地点详情`}>
    <div className="location-heading">
      <div><p className="eyebrow">地名索引 · {kindNames[place.kind]}</p><h3>{place.name}</h3></div>
      <button className="icon-button" aria-label="关闭地点详情" onClick={onClose}><Icon name="close"/></button>
    </div>
    <p className="location-modern"><strong>{place.modernName}</strong><span>{precisionNames[place.precision]}</span></p>
    <p className="location-note">{place.note}</p>
    <p className="location-sources">出处：{place.sourceIds.map(id => <SourceLink key={id} source={sources.get(id)!}/>)}</p>
    {related.length > 0 && <div className="location-related"><span>相关片段</span>{related.map(item =>
      <button type="button" key={item.id} onClick={() => onNavigate(item.id)} aria-current={activeId===item.id ? 'step' : undefined}>{item.title}</button>)}</div>}
    {onShowMap && <button type="button" className="quiet-button" onClick={onShowMap}><Icon name="compass"/>查看地图</button>}
  </aside>
}

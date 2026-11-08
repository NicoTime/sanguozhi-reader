import { legacyChapterId, legacyProgressKey } from './types'
import type { Chapter } from './types'

type Storage = {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
export const progressKey = (id:string) => `sanguozhi-reader:${id}:scene:v2`
export function readProgress(chapter:Chapter, storage:Pick<Storage,'getItem'>):string {
  try {
    const current = storage.getItem(progressKey(chapter.id))
    const legacy = current===null && chapter.id===legacyChapterId ? storage.getItem(legacyProgressKey) : null
    const saved = current ?? legacy
    if (saved && chapter.scenes.some(scene=>scene.id===saved)) return saved
    const namespaced = saved ? `${chapter.id}-${saved}` : null
    if (namespaced && chapter.scenes.some(scene=>scene.id===namespaced)) return namespaced
  } catch { /* Browser storage may be disabled. */ }
  return chapter.scenes[0].id
}
export function saveProgress(chapter:Chapter, id:string, storage:Pick<Storage,'setItem'>) {
  if (!chapter.scenes.some(scene=>scene.id===id)) return
  try {storage.setItem(progressKey(chapter.id),id)} catch { /* Reader stays usable with storage disabled. */ }
}

import { mkdir, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { catalogShape } from '../src/catalog.ts'
import { chapterV2Shape } from '../src/types.ts'

const folder = new URL('../docs/schema/',import.meta.url)
await mkdir(folder,{recursive:true})
for (const [filename,schema] of [['chapter-v2.schema.json',chapterV2Shape],['catalog.schema.json',catalogShape]] as const) {
  const json = z.toJSONSchema(schema,{target:'draft-2020-12',io:'input'})
  await writeFile(new URL(filename,folder),JSON.stringify(json,null,2)+'\n')
}

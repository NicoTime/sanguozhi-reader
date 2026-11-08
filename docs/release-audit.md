# 开源发布审查

状态：代码首发，完整素材尚不具备发布条件。审查日期：2026-11-08。

## 本地副本与发布范围

- 这是原私有阅读器的独立文件副本，不继承其 Git 历史；本地快照包含代码、九卷内容、地图、人物图和音画，以便审查与验证。
- `public/data/`、`public/maps/`、`public/media/`、`public/portraits/`、`content/`、`tests/`、`scripts/extract_epub.py` 及部分来源文档暂被 Git 忽略。这是保守的待审范围，不代表所有文件都不可发布。`scripts/extract_epub.py` 内也包含历史地名和坐标，不能只审查 JSON。
- 原始 EPUB、工作素材、缓存、构建结果、私人部署配置和原项目协作记录不在拟发布清单中。
- 对独立副本已经移除私人站点统计脚本，并将 EPUB 默认路径改为 `sources/epub/`。它们不影响原项目。
- 本地快照不自动等同于线上版本；正式发布前应选定明确基线、冻结文件并记录版本。正式构建应在全新克隆、只使用可公开分发的素材的环境中通过。

## 来源清单与待办

| 类别和本地位置 | 现有证据 | 公开前待完成 |
| --- | --- | --- |
| 古籍正文、裴注及现代整理本：`public/data/` | 九卷从本地 EPUB 提取；项目原记录称电子包同时出现公有领域、CC BY-SA 3.0、GFDL 等声明。 | 确定每份 EPUB 的来源、适用版本和各声明覆盖范围；记录电子整理、标点、转换、署名和再分发要求。不能仅因古籍年代久远而将当前电子文本全部标为 MIT。 |
| 历史地名：`public/data/`、`content/`、`scripts/extract_epub.py` | 部分坐标引用 CHGIS/TGAZ；2026-11-08 核实[白马县单条页面](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82320)标注 CHGIS 与 CC BY-NC 4.0。[CHGIS V6 下载页](https://chgis.fas.harvard.edu/data/chgis/v6/)则列有禁止商业使用和再分发的条款，适用范围不同。 | 逐条核实当前记录、数据来源和具体许可；确认对改编、再分发及商用的影响。必要时取得授权或更换为可公开使用、证据充分的独立来源。不能将单条页面与 CHGIS V6 数据集许可混为一谈。 |
| 现代地形：`public/maps/` | 使用 Mapzen/Tilezen Terrain Tiles；[数据集](https://registry.opendata.aws/terrain-tiles/)指向其来源署名说明。 | 核实实际区域的数据来源与[署名要求](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)，提供可见署名和对应条款。 |
| 现代河流、地名：`public/maps/` 及章节数据 | 原记录涉及 Natural Earth 和 OpenStreetMap。 | 按各资产核验来源、适用范围、署名和许可证；特别确认 ODbL 数据及衍生作品的义务。 |
| 自绘历史图层：`public/data/atlas-v7/` | 原研究记录称图层为依据文字材料自行绘制的区域示意，未描摹 CHGIS V6 几何。 | 逐项审计底图、地名、参考材料和具体数据的权利；不要将研究结论直接当成许可结论。 |
| AI 图像、声音：`public/media/`、`public/portraits/` | 包含已用于阅读器的生成式人物图、场景图和音频。 | 按文件追溯具体供应商、生成日期、输入素材、参考人像/声音、适用服务条款及输出使用权；排除未经确认的参考素材和试音。 |
| 白话、编辑和注音：`content/`、`public/data/` | 项目编排数据包含自写说明及来源材料。 | 区分自有内容与第三方整理内容，为自有内容选择许可证，并核查混合文件的再分发条件。 |
| 代码、脚本、测试 | 项目用户选定 MIT 作为自有代码的许可证。 | 检查脚本内嵌坐标和文本、测试样本、依赖及第三方代码，标明不适用 MIT 的部分；最终提供依赖许可清单。 |

初步文本定位发现含 CHGIS/TGAZ 引用的文件包括 `public/data/guandu.json`、`public/data/chapters/{wudi,wendi,mingdi,sanshaodi}/chapter.json`、`public/data/atlas-v7/manifest.json`、多卷 `content/*/editorial.json` 和 `scripts/extract_epub.py`。这只是定位清单，并非逐项权利判断，其他文件仍须审查。

## 完成发布前的检查

1. 明确发布范围，完成上述来源和许可审计；替换、移除或单独授权无法确认的内容，并保留足够的来源记录与署名。
2. 移除 `.gitignore` 中已通过审查的对应排除项，检查所有拟纳入文件、历史文本、样本、凭据、私人信息和文件大小。不要用强制添加绕过待审排除项。
3. 完善公开版 README、素材许可证说明与第三方声明；在全新目录仅用待发布文件安装、运行测试、构建并做必要的浏览器验收。
4. 核实 GitHub 仓库的可见性及现有内容，再从本独立仓库提交推送；不得更改原私有仓库 remote 或现有线上部署。
5. 记录快照版本和后续从私有项目挑选同步改动的方式。

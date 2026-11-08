# 素材来源与许可证

本项目包含多个来源，**不是整个仓库都使用同一个许可证**。下表区分文件中的内容；混合 JSON 中的正文、原创解读和第三方坐标分别保留各自的许可及署名。使用或再发布时应遵守所有实际涉及部分的条件。

| 内容 | 范围、来源和许可 |
| --- | --- |
| 程序代码 | 本项目作者有权授权的程序代码采用 [MIT](../LICENSE)。第三方 npm 包仍遵循各自许可证；参见 [依赖清单](attributions/npm-installed-licenses.md) 和包自身许可证。 |
| 古籍电子文本 | 陈寿《三国志》和裴松之注为古代作品。项目中的正文、裴注、异文及测试引用提取自维基文库电子版及其简体转换版本。电子版 `OPS/about.xhtml` 明示可选择 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 或 GFDL；本项目对电子版整理内容选用 **CC BY-SA 3.0**，保留署名与相同方式共享要求。原版电子书贡献者见 [完整名单](attributions/wikisource-contributors.md)。 |
| 自有白话、说明及编排 | 作者爱巡山的大王对其有权授权的原创部分采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；对电子版整理内容的改编、第三方数据及其他非自有内容不以此覆盖其原有许可证。 |
| 历史地名和坐标 | 部分取自 CHGIS / 复旦 TGAZ 单条记录，页面标注 © CHGIS、[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)。本仓库保留近似取点与来源，进行了舍入和编排；其使用**仅限非商业用途**，须署名并注明修改。这不是对 CHGIS V6 数据集下载包的许可判断。各记录链接在下面列出。 |
| 现代村落参考点 | 官渡桥村和东史固村的参考位置来自 [OpenStreetMap](https://www.openstreetmap.org/copyright)，© OpenStreetMap contributors，[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。该数据的再利用与衍生数据库须遵守 ODbL；项目将其作为区域示意，不是历史战场定位。 |
| 现代地形底图 | `public/maps/*relief.jpg` 使用 [Mapzen / Tilezen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) 的 Terrarium 高程瓦片，经拼接、投影转换和地形着色生成；详见 [底图说明](../public/maps/README.md) 和 [Tilezen 原始数据与署名条款](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。SRTM / GMTED2010 data courtesy of the U.S. Geological Survey；地形为现代参考，非古代地貌复原。 |
| 现代城市、河流与陆地 | 基于 [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) 公开领域数据经筛选、裁剪与制图处理。 |
| 历史图集示意 | `public/data/atlas-v7/` 为本项目依据文字地理关系自绘的概略层；州区不是行政边界或控制范围，河湖和海岸不是精确复原。参考出处保留在清单中；其原创绘制部分 CC BY 4.0，不授予对参考史料或地图原件的权利。 |
| AI 图片和音频 | 作者对其有权授权的生成内容及项目编排采用 CC BY 4.0。`public/portraits/` 的 3 张曹操人物肖像和 `public/media/` 的 104 张场景图为 OpenAI image_gen 生成的艺术想象；104 段音频为 ZenMux 调用 Google Gemini TTS 生成的表演，不使用真人录音克隆。图片及音频具体文件哈希见 [素材清单](attributions/generated-assets.sha256)。AI 输出可能不具备版权保护，授权仅在作者享有相关权利的范围内适用；不改变第三方权利或服务条款。参见 [OpenAI 服务条款](https://openai.com/policies/terms-of-use/)、[Google Gemini 服务条款](https://ai.google.dev/gemini-api/terms)和 [ZenMux 用户协议](https://zenmux.ai/docs/terms-of-service)。 |

## 维基文库原文来源

正文及裴注取自[《三国志》维基文库电子版](https://zh.wikisource.org/wiki/三國志)，按 [卷 1](https://zh.wikisource.org/wiki/三國志/卷01)、[卷 2](https://zh.wikisource.org/wiki/三國志/卷02)、[卷 3](https://zh.wikisource.org/wiki/三國志/卷03)、[卷 4](https://zh.wikisource.org/wiki/三國志/卷04)、[卷 32](https://zh.wikisource.org/wiki/三國志/卷32)、[卷 34](https://zh.wikisource.org/wiki/三國志/卷34)、[卷 35](https://zh.wikisource.org/wiki/三國志/卷35)、[卷 47](https://zh.wikisource.org/wiki/三國志/卷47)、[卷 48](https://zh.wikisource.org/wiki/三國志/卷48)整理。项目对电子版进行了简繁转换、提取、分段、注锚和异文整理，并加入独立的现代解读和展示数据；原始 EPUB 不随本仓库提供。各卷 JSON 的来源记录及覆盖审计保留具体文件名、卷内路径与哈希。维基文库当前页面与本地电子版可能存在版本差异；[贡献者列表](attributions/wikisource-contributors.md)依据所用 EPUB 的声明保留。

## CHGIS / TGAZ 单条记录

以下 12 个单条页面的许可在 2026-11-08 核对为 CC BY-NC 4.0：

- [扬州](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_30056)、[谯县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_43340)、[东平陵县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_45020)、[邺县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82196)
- [酸枣县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82282)、[黎阳县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82316)、[白马县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82320)、[阳武县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82525)
- [雒阳县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82828)、[许县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_83011)、[鄄城县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_85065)、[东武阳县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_85093)

不把单条网页许可推广到 [CHGIS V6 下载数据](https://chgis.fas.harvard.edu/data/chgis/v6/)：V6 页面另有限制。尚未找到能同时保持现有历史地望依据和完全消除非商业限制的替代点；因此明确保留并标注现有条件，不将整套素材声称为可自由商用。

## 开源版与原站的河道差异

原官渡样章中的两条河线含现代历史地图集经纬网读点，未确认其几何再分发条件。开源版改用本项目 v7 图集中依据文字地理关系独立绘制的黄河广域方向线，并暂不绘制官渡水线。该修改不影响原站。原版点位提取脚本不随仓库发布；黄河示意并非实测河槽，不能据此判断渡口或战场位置。

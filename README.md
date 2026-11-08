# 三国志 · 原文伴读

**作者与制作：爱巡山的大王**

线上体验：**[sanguozhi.zzwt.fun](https://sanguozhi.zzwt.fun/)**

- **B 站**：[爱巡山的大王](https://space.bilibili.com/3043064)（UID：3043064）
- **小红书**：[爱巡山的大王](https://www.xiaohongshu.com/user/profile/5c53be6b000000001003506f)（小红书号：613044745）
- **抖音**：旋转五花肉（抖音号：`xunshan11853`）

一款辅助阅读《三国志》原文和裴松之注的静态网页。项目将正文、白话义注、人物和历史地理示意结合起来，并为部分片段提供声音和插画。地图是阅读辅助示意，不代表精确历史疆界或历史现场复原；人物图像和声音为现代艺术演绎。

收录《武帝纪》《文帝纪》《明帝纪》《三少帝纪》《先主传》《二主妃子传》《诸葛亮传》《吴主传》《三嗣主传》九卷的正文和裴注。曹操与诸葛亮部分发言有 AI 音画，新增音频未逐句听审。

## 本地运行

需要 Node.js 20.19+ 或 22.12+、npm 和 FFmpeg（构建时使用 `ffprobe` 检查音画）。项目无需 API 密钥即可运行，仓库含运行所需正文、地图和音画，下载约 120 MB 的静态素材。

```sh
git clone https://github.com/NicoTime/sanguozhi-reader.git
cd sanguozhi-reader
npm ci
npm test
npm run build
npm run preview -- --port 4173 --strictPort
```

访问 <http://127.0.0.1:4173/>。开发时使用 `npm run dev`；生成文件位于 `dist/`，可部署到支持静态文件的服务器。地图的数据来源和使用限制见下文。

正文提取脚本支持项目使用过的特定电子版结构。重提取需要自行准备有权使用的 EPUB，默认放在 `sources/epub/`，也可使用 `--epub-dir` 指定；原始 EPUB 不包含在仓库中。旧官渡样章提取脚本使用了历史图集读点，不随开源版提供。

## 许可证与来源

**程序代码采用 MIT，但整个项目并非都可自由商用。** 九卷电子文本适用 CC BY-SA 3.0；作者有权授权的原创解读和 AI 音画采用 CC BY 4.0；部分历史地名来自 CHGIS/TGAZ，适用 **CC BY-NC 4.0，仅限非商业用途**；部分现代村落坐标来自 OpenStreetMap，适用 ODbL 1.0。各部分的来源、署名、许可及修改记录见 [素材来源与许可证](docs/licenses.md)。

开源版为避免未经确认授权的历史图集读点，采用独立绘制的黄河广域方向线，暂不绘制官渡水线；这与线上网站的原地图不同。地理图层是阅读示意，不应视作精确复原。

代码和其他 npm 依赖各自适用的许可证见 [依赖清单](docs/attributions/npm-installed-licenses.md)。

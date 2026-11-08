# 官渡样章史料与地理交接

2026-11-05 v0.2 增补见 [历史河道与军旗的依据](historical-geography-v2.md)。现有数据含两段历史河流示意、11 个态势阶段和 23 条具名部署。以下保留 v0.1 史料校读及当时的地理范围。

本次整理《三国志》卷一《武帝纪》建安五年（公元 200 年）选读。交付数据为 `public/data/guandu.json`，含 7 个阅读片段、5 条裴注、10 个地点、20 个人物和 26 条来源。生成脚本为 `scripts/extract_epub.py`。数据可用于本地样章体验。

## 选材与校读

| 片段 | 卷内段落索引 | 正文字符范围 | 裴注 |
| --- | --- | --- | --- |
| 白马解围 | 46 | [0, 159) | 无 |
| 延津反击 | 46 | [159, 411) | 无 |
| 官渡相持 | 47 | [0, 192) | 《汉晋春秋》所记许攸建议、裴松之驳曹军人数 |
| 截烧粮车 | 50 | [0, 82) | 无 |
| 夜袭乌巢 | 50 | [82, 252) | 《曹瞒传》所记献计、夜行和火攻 |
| 袁军溃退 | 50 | [252, 342) | 《献帝起居注》所录曹操奏报 |
| 焚书与受降 | 50 | [342, 372) | 《魏氏春秋》所记曹操焚书之说 |

段落编号是 `OPS/c4_san_guo_zhi_juan01.xhtml` 中全部 XHTML `p` 的零基索引。每段字符位置从去除注块后的正文起算，右端不含。保留入选三个原段的全部正文与裴注。选读起于 p[46]，此前的东征刘备（p[45]）未选入。p[47] 后略去孙策谋袭许与汝南支线（p[48]、p[49]），在章首和跨段出处说明中标出。

正文保留本地简体转换本的字词与标点。注块保留所引书名与原文，移除排版隐藏括号与悬浮异文文字。《曹瞒传》的“子卿远”和“且”对应两条异文，另存于可选 `notes[].variants`。每条记录有底文、异读和底文偏移。可选 `notes[].provenance` 保留段号、小注顺序、注入位置和 XHTML 标识。场景 provenance 附字符起止位置。现有应用校验只消费契约必需字段，异文与附加偏移在原始 JSON 备查。

义注依《武帝纪》顺序处理，日期照录传统季月。正文明记的月份与承前推定分开。正文叙述、引用的古书、现代解释分列。许攸投曹的动机按本纪归属，曹军人数旁列裴松之的质疑，七万余首级归于曹操奏文。《徐晃传》把首次截粮车系于故市，《张郃传》给出乌巢之名并另记降、溃顺序。义注说明后一处异说。人物身份对读本 EPUB 的《袁绍传》《荀彧荀攸贾诩传》《张郃传》《关羽传》等。

## 地图点位

- 白马、黎阳、阳武、许采用 CHGIS 东汉古县治参考点，坐标舍入至百分之一度。白马与滑县留固镇公布的白马墙村遗址相符，许与许昌建安区公布的张潘故城地域相符。点位用于读图，精度统一标作“大致区域”。[白马县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82320) · [黎阳县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82316) · [阳武县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82525) · [许县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_83011) · [白马古城遗址](https://www.hnhx.gov.cn/jczwgk/jdzjczwgk/lgz/ggwhfw/webinfo/2022/11/1672745123515782.htm) · [汉魏许都故城](https://www.jianan.gov.cn/jagk/002003/20180711/21d701f7-882c-4a7a-9f56-a59b579a75dc.html)
- 官渡取中牟官渡桥村附近作为区域锚点。后世地志提供中牟、官渡水、曹公垒的地望线索，战场边界和营垒位置未核定。[《通鉴地理通释》](https://www.shidianguji.com/mid-page/7352264494015512585) · [官渡桥村节点](https://www.openstreetmap.org/node/6945971714)
- 延津用古酸枣县治附近提示古河段地望，具体渡口、登岸点和延津南交战位置未核定。乌巢用东史固村附近标示地方比定的一种说法，粮屯位置和古泽岸线未核定。两点均标作“位置有争议”。[《水经注》河水](https://www.shidianguji.com/book/CADAL02030776/chapter/1l1xa0l7bhlx0) · [酸枣县](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82282) · [延津县政府僧固乡报道](https://www.yanjin.gov.cn/newsinfo/22360.html) · [《新乡日报》东史固说](https://news.xxrb.com.cn/html/2026/xinxiang_0112/427808.html) · [东史固村节点](https://www.openstreetmap.org/node/6626944424)
- 故市、黄河古河段、冀州保留释义与来源，坐标为 `null`。故市亭和故市县故城不能直接合并。地图只提供三条有原文支撑的曹军行动示意，白马至延津、延津至官渡、官渡至乌巢。许是退军提议及写信人的关联地点。袁绍败退渡河的起终点无法落实，叙事关系见义注。[《水经注》济水](https://www.shidianguji.com/book/SBCK047/chapter/1j715dhpatoor_23)
- `historicalRiver.status` 为 `unavailable`。区域研究可以说明黄河多次改道，现有材料不足以画出建安五年官渡战区的河岸。现代水系仅供现代对照。[《地理学报》区域综述](https://www.geog.com.cn/EN/abstract/article/0375-5444/49025)

## 复现与验证

- 在样章根目录运行 `python3 scripts/extract_epub.py` 可从本地三份 EPUB 重建 JSON。脚本使用 Python 3.9 或更新版本的标准库，支持以 `--epub-dir` 指定书籍目录。生成文件在同目录原子替换。
- `python3 scripts/extract_epub.py --check` 通过。三个源卷 XHTML 的 SHA-256 与脚本记录一致，简体无裴注版的正文逐字一致，繁体本用于对照段落标点、小注结构与锚点顺序。简体无裴注版与繁体本均来自同一导出源，不能当作不同版本独立校勘。
- 另用 DOM 解析独立复核，拼接结果等于三段完整源正文，5 条裴注的可见文字、插入位置和 2 条异文的底文偏移均与数据对应。未执行繁简逐字自动换算或底本校勘。
- `npm run validate:content` 通过，检查全局 ID、引用、正文拼接、裴注锚点、坐标和河道状态。最终数据 SHA-256 为 `b7ed5056179a55e9862338d7226c4c557e3349d930bbc68f8813477cc1776d1f`。网页交互与构建另由开发和验收会话核验。

EPUB 卷末将古籍作品标为 Public domain，包级元数据同时声明 CC BY-SA 3.0 和 GFDL。JSON 分别保留这些声明、源文件名、卷内路径、卷文件哈希与维基文库卷页。CHGIS 采用复旦 TGAZ 单条记录，所列许可为 CC BY-NC 4.0。两处现代村落参考点保留 OpenStreetMap 贡献者署名及 ODbL 1.0。后续公开使用时需依来源条款处理数字版本和地图数据。 [维基文库《武帝纪》](https://zh.wikisource.org/wiki/三國志/卷01) · [CHGIS 记录与许可](https://tgaz.fudan.edu.cn/tgaz/placename/hvd_82320) · [OpenStreetMap 署名与许可](https://www.openstreetmap.org/copyright)

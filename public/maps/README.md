# 官渡样章底图数据

- `central-plains-relief.jpg` 为 [Mapzen / Tilezen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) Terrarium 高程切片生成的地势阴影。SRTM 与 GMTED2010 高程数据由 U.S. Geological Survey 提供。切片集与原始来源条款见 [Tilezen 署名说明](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。
- 用第 8 级 XYZ 的 x = 205–214、y = 97–107，共 110 张瓦片。拼接后为 2560 × 2816，Web Mercator，范围由 `bounds.json` 记录。依据高程着色并夸大局部坡度阴影，以显示山地和平原。
- `modern-rivers.geojson` 与 `modern-cities.json` 来自 [Natural Earth v5.1.2 仓库](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson) 的 1:10m 河流线与居民地数据，按样章覆盖范围和相关城市筛选。Natural Earth 为公有领域，详见 [使用条款](https://www.naturalearthdata.com/about/terms-of-use/)。
- 当前所有底图文件由本地静态服务提供。地图显示的是现代地势，河流和现代城市为区域尺度对照。原文地名及行动示意来自样章内容文件及其出处。

可在样章根目录使用 Python 3 和支持 PNG 解码、JPEG 编码的 FFmpeg，运行 `python3 scripts/build-map-assets.py` 重建。脚本下载公开数据并缓存于 `.local/map-cache/`。

`eastern-china-relief.jpg` 为供完整纪传使用的广域图，同样使用 Mapzen / Tilezen Terrarium 高程。采用第 7 级 XYZ 的 x = 98–110、y = 46–57，共 156 张瓦片，3328 × 3072。覆盖 95.625°E 至 132.1875°E、16.6362°N 至 45.0890°N。配套现代城市与河流仍来自 Natural Earth v5.1.2。运行 `python3 scripts/build-map-assets.py --profile eastern-china` 可重建；精确四至见 `eastern-china-bounds.json`。官渡仍可使用原有中原精细图。

`national-relief.jpg` 是天下总览的现代地势远景，使用 Terrarium 第 5 级 XYZ 的 x = 22–28、y = 9–15，共 49 张瓦片，1792 × 1792。以 [Natural Earth 1:50m 陆地面](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_50m_land.geojson) 区分现代陆海。底图真实四至见 `national-bounds.json`。运行 `python3 scripts/build-map-assets.py --profile national` 可重建。

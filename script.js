/* global cityData */

const olGlobal = window.ol;
if (!olGlobal) {
  console.error("OpenLayers не загрузился");
}

const { Map, View } = olGlobal;
const { Tile: TileLayer, Vector: VectorLayer } = olGlobal.layer;
const { OSM, Vector: VectorSource } = olGlobal.source;
const { Feature } = olGlobal;
const { Circle: CircleGeom } = olGlobal.geom;
const { Style, Fill, Stroke, Text } = olGlobal.style;
const { fromLonLat } = olGlobal.proj;

const totalCount = cityData.reduce((acc, item) => acc + item.count, 0);
const mappedCities = cityData.filter((c) => c.coords);
const offMapCities = cityData.filter((c) => !c.coords);

const formatNum = (n) => n.toLocaleString("ru-RU");

const emojiFor = (nameRaw) => {
  const name = String(nameRaw || "").toLowerCase();
  if (name.includes("неизвест")) return "❓";
  if (name.includes("world")) return "🌐";
  if (name.includes("сербия")) return "🇷🇸";
  if (name.includes("минск") || name.includes("брест")) return "🇧🇾";
  if (name.includes("сочи") || name.includes("новороссийск")) return "🏖️";
  if (name.includes("москва")) return "🏛️";
  if (name.includes("санкт")) return "🌉";
  if (name.includes("екатерин")) return "⛰️";
  if (name.includes("казань")) return "🕌";
  return "🏙️";
};

const countryFor = (item) => {
  const name = String(item?.name || "").toLowerCase();
  if (!item?.coords) {
    if (name.includes("world")) return { key: "world", label: "Мир", flag: "🌍" };
    if (name.includes("неизвест")) return { key: "unknown", label: "Неизвестно", flag: "❓" };
    return { key: "unknown", label: "Неизвестно", flag: "❓" };
  }
  if (name.includes("сербия")) return { key: "rs", label: "Сербия", flag: "🇷🇸" };
  if (name.includes("минск") || name.includes("брест") || name.includes("беларус")) {
    return { key: "by", label: "Беларусь", flag: "🇧🇾" };
  }
  // Смешанные записи — считаем отдельно
  if (name.includes("//")) return { key: "mixed", label: "Несколько стран", flag: "🧭" };
  return { key: "ru", label: "Россия", flag: "🇷🇺" };
};

// UI badges
document.getElementById("totalBadge").textContent = `Всего: ${formatNum(totalCount)}`;
document.getElementById("citiesBadge").textContent = `Городов: ${cityData.length}`;
document.getElementById("offmapTotal").textContent = offMapCities
  .reduce((a, b) => a + b.count, 0)
  .toLocaleString("ru-RU");

// Страны
const countriesEl = document.getElementById("countries");
if (countriesEl) {
  const byCountry = cityData.reduce((acc, item) => {
    const c = countryFor(item);
    if (!acc[c.key]) acc[c.key] = { ...c, count: 0 };
    acc[c.key].count += item.count;
    return acc;
  }, {});

  const list = Object.values(byCountry).sort((a, b) => b.count - a.count);
  const maxC = Math.max(...list.map((x) => x.count));

  list.forEach((c) => {
    const row = document.createElement("div");
    row.className = "country-row";
    row.innerHTML = `
      <div style="width:100%">
        <div class="country-left">
          <span class="flag">${c.flag}</span>
          <div class="country-name">${c.label}</div>
        </div>
        <div class="country-mini"><div style="width:${Math.max(6, (c.count / maxC) * 100)}%"></div></div>
      </div>
      <div class="country-count">${formatNum(c.count)}</div>
    `;
    countriesEl.appendChild(row);
  });
}

// OpenLayers карта + круги по численности
const maxCount = Math.max(...mappedCities.map((c) => c.count));
const radiusFor = (count) => {
  const minR = 12000;
  const maxR = 180000;
  const scale = Math.pow(count / maxCount, 0.55); // чуть усиливаем разницу
  const base = minR + scale * (maxR - minR);
  return count === maxCount ? base * 1.15 : base; // топ-город ещё крупнее
};
const zoomScale = (zoom) => {
  if (!zoom && zoom !== 0) return 1;
  const scaled = 1.3 + Math.max(0, zoom - 3) * 0.18; // растёт при приближении
  return Math.min(2.4, Math.max(1.1, scaled));
};

// Объединяем точки с одинаковыми координатами, чтобы не было наложения меток
const mergedByCoord = mappedCities.reduce((acc, city) => {
  const key = `${city.coords[0].toFixed(3)},${city.coords[1].toFixed(3)}`;
  if (!acc[key]) {
    acc[key] = { ...city, aliases: [city.name] };
  } else {
    acc[key].count += city.count;
    acc[key].aliases.push(city.name);
    // если это крупнейший, поднимаем имя
    if (city.count > acc[key].count) acc[key].name = city.name;
  }
  return acc;
}, {});

const mergedCities = Object.values(mergedByCoord);

const features = mergedCities.map((city) => {
  const center = fromLonLat([city.coords[1], city.coords[0]]);
  const circle = new CircleGeom(center, radiusFor(city.count));
  const feature = new Feature(circle);
  feature.set("name", city.name);
  feature.set("count", city.count);
  feature.set("aliases", city.aliases);
  feature.set("emoji", emojiFor(city.name));
  return feature;
});

const view = new View({
  center: fromLonLat([55, 55]),
  zoom: 4
});

const circlesLayer = new VectorLayer({
  source: new VectorSource({ features }),
  style: (feature) => {
    const count = feature.get("count");
    const emoji = feature.get("emoji") || "🏙️";
    const alpha = Math.min(0.5, 0.18 + count / maxCount);
    const zoom = view.getZoom ? view.getZoom() : 4;
    const sizeScale = zoomScale(zoom);
    const showText = zoom >= 6;
    return new Style({
      geometry: new CircleGeom(feature.getGeometry().getCenter(), feature.getGeometry().getRadius() * sizeScale),
      fill: new Fill({ color: `rgba(249, 115, 22, ${alpha})` }),
      stroke: new Stroke({ color: "#f97316", width: 2 }),
      text: showText
        ? new Text({
            text: `${emoji} ${count}`,
            fill: new Fill({ color: "#0b0c10" }),
            stroke: new Stroke({ color: "#e0f2fe", width: 3 }),
            font: "600 12px Manrope, sans-serif",
            backgroundFill: new Fill({ color: "rgba(14,17,23,0.78)" }),
            backgroundStroke: new Stroke({ color: "rgba(224,242,254,0.6)", width: 1 }),
            padding: [2, 4, 2, 4]
          })
        : undefined
    });
  }
});

const map = new Map({
  target: "map",
  layers: [
    new TileLayer({
      source: new OSM()
    }),
    circlesLayer
  ],
  view,
  controls: olGlobal.control && typeof olGlobal.control.defaults === "function"
    ? olGlobal.control.defaults({ attribution: false })
    : undefined
});

view.on("change:resolution", () => circlesLayer.changed());

if (features.length) {
  const extent = circlesLayer.getSource().getExtent();
  map.getView().fit(extent, { padding: [30, 30, 30, 30], maxZoom: 7 });
}

// Инсайты
const insightsEl = document.getElementById("insights");
const topCities = [...cityData]
  .filter((c) => c.coords)
  .sort((a, b) => b.count - a.count)
  .slice(0, 5);

const top1 = topCities[0];
const top2 = topCities[1];
const unknown = offMapCities.find((c) => c.name.toLowerCase().includes("неизвест"));

const insights = [
  `#1: <strong>${emojiFor(top1.name)} ${top1.name}</strong> — ${formatNum(top1.count)} чел. (${Math.round(
    (top1.count / totalCount) * 100
  )}% от команды).`,
  top2
    ? `Следом <strong>${emojiFor(top2.name)} ${top2.name}</strong> — ${formatNum(top2.count)} чел.`
    : null,
  unknown
    ? `${emojiFor(unknown.name)} ${unknown.name}: ${formatNum(unknown.count)} чел. (${Math.round(
        (unknown.count / totalCount) * 100
      )}% данных без города).`
    : null,
  `Отмечено на карте: ${mappedCities.length} городов в 2 странах.`,
  `Медианный размер точки — ${formatNum(
    Math.round(mappedCities.sort((a, b) => a.count - b.count)[
      Math.floor(mappedCities.length / 2)
    ].count)
  )} чел.`
].filter(Boolean);

insights.forEach((text) => {
  const el = document.createElement("div");
  el.className = "insight";
  el.innerHTML = text;
  insightsEl.appendChild(el);
});

// Бар-чарт
const barsEl = document.getElementById("bars");
topCities.forEach((city) => {
  const pct = Math.round((city.count / totalCount) * 1000) / 10;
  const row = document.createElement("div");
  row.className = "bar";
  row.innerHTML = `
    <div class="bar-row">
      <strong>${emojiFor(city.name)} ${city.name}</strong>
      <span class="muted">${pct}% • ${formatNum(city.count)}</span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" style="width:${Math.min(100, pct)}%"></div>
    </div>
  `;
  barsEl.appendChild(row);
});

// Стек под картой — доля топ-10 городов
const stackEl = document.getElementById("stack");
const stackLegend = document.getElementById("stackLegend");
if (stackEl && stackLegend) {
  const top10 = [...cityData].sort((a, b) => b.count - a.count).slice(0, 10);
  const palette = ["#7dd3fc", "#a855f7", "#f472b6", "#34d399", "#facc15", "#60a5fa", "#fb923c", "#22d3ee", "#c084fc", "#9ca3af"];

  top10.forEach((city, idx) => {
    const pct = Math.round((city.count / totalCount) * 1000) / 10;
    const seg = document.createElement("div");
    seg.className = "segment";
    seg.style.width = `${pct}%`;
    seg.style.background = palette[idx % palette.length];
    seg.textContent = `${pct}%`;
    stackEl.appendChild(seg);

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span class="dot" style="background:${palette[idx % palette.length]}"></span>${emojiFor(city.name)} ${city.name} — ${pct}% · ${formatNum(city.count)}`;
    stackLegend.appendChild(chip);
  });
}

// Список вне карты
const offmapEl = document.getElementById("offmapList");
offmapEl.className = "offmap-list";
offMapCities.forEach((city) => {
  const pill = document.createElement("div");
  pill.className = "pill";
  pill.innerHTML = `<span>${emojiFor(city.name)} ${city.name}</span><span class="count">${formatNum(
    city.count
  )}</span>`;
  offmapEl.appendChild(pill);
});


import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const YEARS = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025];

const ECART_SERIES = [
  { key: "ecartPrevRef", label: "Objectif vs. sans action", color: "#378ADD" },
  { key: "ecartExpostRef", label: "Résultat réel vs. sans action", color: "#1D9E75" },
  { key: "ecartExpostPrev", label: "Résultat réel vs. objectif", color: "#EF9F27" },
];

const formatBigNumber = (val) => {
  if (!val && val !== 0) return "—";
  return Math.round(val).toLocaleString("fr-FR").replace(/\s/g, " ");
};

// Comparaisons concrètes pour rendre les chiffres parlants
const COMPARAISONS = {
  ges: (abs) => {
    const voitures = Math.round(abs / 2.4);
    return `≈ ${voitures.toLocaleString("fr-FR")} voitures retirées de la route pendant 1 an`;
  },
  energie: (abs) => {
    const foyers = Math.round((abs * 1000) / 4.7);
    return `≈ la consommation de ${foyers.toLocaleString("fr-FR")} foyers pendant 1 an`;
  },
  pm: (abs) => {
    const diesels = Math.round(abs / 0.005);
    return `≈ les particules émises par ${diesels.toLocaleString("fr-FR")} véhicules diesel/an`;
  },
  nox: (abs) => `≈ ${Math.round(abs / 0.04).toLocaleString("fr-FR")} camions en moins sur les routes`,
  hc: () => null,
  co: () => null,
};

const getComparaison = (indicator, value) => {
  const abs = Math.abs(typeof value === "string" ? parseInt(value.replace(/\s/g, "").replace("−", "-")) : value);
  if (!abs) return null;
  return COMPARAISONS[indicator]?.(abs) || null;
};

const DATA = {
  ges: {
    label: "GES", unit: "tCO₂e",
    objA: 80, objB: 55,
    lastA: "−4 200", lastB: "−2 600", cumA: "−28 500", cumB: "−18 200",
    barA: [-800,-1100,-1500,-1900,-2300,-2700,-3100,-3500,-3800,-4000,-4200],
    barB: [-400,-600,-800,-1000,-1300,-1600,-1900,-2100,-2300,-2450,-2600],
    trajApost: [120,118,115,112,108,104,100,96,92,88,84],
    trajAprev: [120,117,114,110,106,102,98,94,90,86,82],
    trajBpost: [95,94,93,92,90,88,87,86,85,83,82],
    trajBprev: [95,93,91,89,87,85,83,81,79,77,75],
    ecartA: [-1200,-2800,-4900,-7300,-10100,-13200,-16600,-20400,-24500,-26600,-28500],
    ecartB: [-600,-1500,-2600,-3900,-5500,-7400,-9500,-11800,-14200,-16100,-18200],
  },
  energie: {
    label: "Énergie", unit: "GWh",
    objA: 72, objB: 68,
    lastA: "−14", lastB: "−20", cumA: "−92", cumB: "−122",
    barA: [-1.5,-2,-2.8,-3.5,-4.5,-6,-7.5,-9,-11,-12.5,-14],
    barB: [-2,-3,-4,-5.5,-7,-9,-11,-13.5,-16,-18,-20],
    trajApost: [80,78,76,74,71,68,65,62,59,57,55],
    trajAprev: [80,77,74,71,68,65,62,59,56,53,50],
    trajBpost: [70,69,68,67,66,65,64,63,62,61,60],
    trajBprev: [70,68,66,64,62,60,58,56,54,52,50],
    ecartA: [-2,-5,-9,-14,-20,-27,-35,-44,-55,-68,-80],
    ecartB: [-3,-7,-12,-19,-27,-38,-50,-65,-82,-102,-122],
  },
  pm: {
    label: "PM", unit: "t PM",
    objA: 65, objB: 48,
    lastA: "−110", lastB: "−42", cumA: "−680", cumB: "−290",
    barA: [-10,-15,-22,-30,-40,-52,-65,-78,-90,-100,-110],
    barB: [-4,-6,-8,-11,-15,-20,-25,-30,-35,-39,-42],
    trajApost: [500,490,478,464,448,430,410,388,364,342,320],
    trajAprev: [500,488,475,461,446,430,413,395,376,356,335],
    trajBpost: [300,297,293,288,282,275,267,258,248,237,225],
    trajBprev: [300,295,289,283,276,269,261,252,242,231,219],
    ecartA: [-10,-28,-55,-92,-143,-208,-288,-382,-490,-612,-680],
    ecartB: [-4,-11,-20,-33,-50,-72,-99,-132,-172,-218,-290],
  },
  nox: {
    label: "NOx", unit: "t NOx",
    objA: 70, objB: 52,
    lastA: "−95", lastB: "−38", cumA: "−590", cumB: "−250",
    barA: [-8,-12,-18,-26,-35,-46,-58,-70,-80,-88,-95],
    barB: [-3,-5,-7,-9,-13,-17,-22,-27,-32,-35,-38],
    trajApost: [400,392,382,370,357,342,326,308,288,268,248],
    trajAprev: [400,390,379,368,356,343,329,314,298,281,263],
    trajBpost: [250,247,244,240,235,229,222,214,205,195,184],
    trajBprev: [250,246,241,236,230,223,215,206,196,185,173],
    ecartA: [-8,-22,-44,-74,-114,-165,-228,-305,-398,-502,-590],
    ecartB: [-3,-9,-17,-28,-43,-62,-85,-114,-148,-188,-250],
  },
  hc: {
    label: "HC", unit: "t HC",
    objA: 60, objB: 45,
    lastA: "−55", lastB: "−22", cumA: "−330", cumB: "−140",
    barA: [-5,-7,-10,-14,-19,-25,-32,-39,-45,-50,-55],
    barB: [-2,-3,-4,-6,-8,-11,-14,-17,-19,-21,-22],
    trajApost: [200,196,191,185,178,170,161,151,140,129,118],
    trajAprev: [200,195,189,183,176,168,159,149,138,126,113],
    trajBpost: [150,148,146,143,140,136,132,127,121,115,108],
    trajBprev: [150,147,144,140,136,131,126,120,113,106,98],
    ecartA: [-5,-13,-25,-41,-62,-89,-122,-162,-208,-260,-330],
    ecartB: [-2,-6,-11,-18,-27,-40,-55,-73,-93,-115,-140],
  },
  co: {
    label: "CO", unit: "t CO",
    objA: 75, objB: 60,
    lastA: "−180", lastB: "−75", cumA: "−1 100", cumB: "−480",
    barA: [-15,-22,-32,-44,-58,-74,-92,-112,-130,-155,-180],
    barB: [-6,-9,-13,-17,-23,-30,-38,-47,-57,-65,-75],
    trajApost: [700,685,668,648,625,600,572,541,507,470,430],
    trajAprev: [700,682,663,642,619,594,566,535,501,464,424],
    trajBpost: [450,445,439,432,424,415,404,391,376,360,342],
    trajBprev: [450,443,435,426,416,405,393,379,363,346,327],
    ecartA: [-15,-39,-76,-127,-196,-284,-392,-522,-674,-852,-1100],
    ecartB: [-6,-16,-30,-49,-74,-107,-147,-196,-255,-322,-480],
  },
};

const INDICATORS = ["ges","energie","pm","nox","hc","co"];
const IND_LABELS = { ges:"Gaz à effet de serre", energie:"Énergie", pm:"Particules fines", nox:"Oxydes d'azote", hc:"Hydrocarbures", co:"Monoxyde de carbone" };

const COLOR_A = "#3B82F6";
const COLOR_B = "#D97706";

const formatTick = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v);

function GaugeBar({ pct, color, label }) {
  return (
    <div className="card-shadow p-6 text-center">
      <div className="text-xs font-medium mb-3 text-[#6b7280] flex items-center gap-1.5 justify-center">
        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
        {label}
      </div>
      <div className="relative w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-2xl font-semibold" style={{ color }}>{pct}%</div>
      <div className="text-xs text-[#9ca3af] mt-1">de l'objectif atteint</div>
    </div>
  );
}

export default function ComparaisonActions() {
  const navigate = useNavigate();
  const [ind, setInd] = useState("ges");
  const [selectedEcart, setSelectedEcart] = useState("ecartExpostRef");
  const d = DATA[ind];

  // Derive 3 écarts from barA/barB (= expostRef) and objA/objB (achievement %)
  const buildGainsData = (bar, obj) => {
    const ach = obj / 100;
    return YEARS.map((y, i) => {
      const expostRef = bar[i];
      const prevRef = Math.round(expostRef / ach);
      const expostPrev = expostRef - prevRef;
      return { year: y, ecartPrevRef: prevRef, ecartExpostRef: expostRef, ecartExpostPrev: expostPrev };
    });
  };
  const gainsA = buildGainsData(d.barA, d.objA);
  const gainsB = buildGainsData(d.barB, d.objB);

  const trajData = YEARS.map((y, i) => ({ year: y, A_expost: d.trajApost[i], A_prev: d.trajAprev[i], B_expost: d.trajBpost[i], B_prev: d.trajBprev[i] }));
  const ecartData = YEARS.map((y, i) => ({ year: y, A: d.ecartA[i], B: d.ecartB[i] }));

  const green = "#1D9E75";

  return (
    <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
          <FiArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-[#111]">Face à face : 2 actions comparées</h1>
          <p className="text-sm text-[#888] flex items-center gap-1.5 flex-wrap mt-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR_A }} /> Développement réseau cyclable
            <span className="mx-2 text-[#ccc]">vs</span>
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR_B }} /> Rénovation bâtiments publics
          </p>
        </div>
      </div>

      {/* Indicator tabs */}
      <div className="card-shadow p-4 flex gap-2 flex-wrap">
        {INDICATORS.map((key) => (
          <button
            key={key}
            onClick={() => setInd(key)}
            className={`px-4 py-1.5 rounded-md text-xs cursor-pointer border transition-all ${
              ind === key
                ? "bg-[#1D9E75] text-white border-[#1D9E75] font-medium"
                : "bg-transparent text-[#888] border-[#ddd] hover:border-[#1D9E75] hover:text-[#555]"
            }`}
          >
            {IND_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Gauges */}
      <div>
        <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium mb-3">
          Où en est-on ? · {d.label}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <GaugeBar pct={d.objA} color={COLOR_A} label="Action A" />
          <GaugeBar pct={d.objB} color={COLOR_B} label="Action B" />
        </div>
      </div>

      {/* Metric cards */}
      <div>
        <div className="text-xs text-[#9ca3af] uppercase tracking-wider font-medium mb-3">
          Résultats concrets · {d.label}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Réduction cette année", a: d.lastA, b: d.lastB, unit: d.unit, comparaison: true },
            { label: "Total économisé depuis le début", a: d.cumA, b: d.cumB, unit: d.unit, comparaison: true },
            { label: "Progression Action A", a: `${d.objA}%`, b: null, unit: "de l'objectif atteint" },
            { label: "Progression Action B", a: null, b: `${d.objB}%`, unit: "de l'objectif atteint" },
          ].map(({ label, a, b, unit, comparaison }) => (
            <div key={label} className="card-shadow p-4">
              <div className="text-xs text-[#9ca3af] font-medium mb-2">{label}</div>
              <div className="flex items-baseline gap-3 flex-wrap">
                {a && <span className="text-xl font-semibold" style={{ color: COLOR_A }}>{a}</span>}
                {b && <span className="text-xl font-semibold" style={{ color: COLOR_B }}>{b}</span>}
              </div>
              <div className="text-[11px] text-[#9ca3af] mt-1">{unit}</div>
              {comparaison && a && getComparaison(ind, a) && (
                <div className="text-[10px] text-[#6b7280] mt-2 italic">{getComparaison(ind, a)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chart: écarts & gains par année */}
      <ChartCard
        title={`${d.label} · Réductions année par année`}
        sub={`Ce qui a été évité chaque année par rapport à un scénario sans action · ${d.unit}`}
      >
        <div className="flex gap-1 mb-4">
          {ECART_SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSelectedEcart(s.key)}
              className={`px-3.5 py-1 rounded-md text-xs cursor-pointer border transition-all ${
                selectedEcart === s.key
                  ? "text-white font-medium"
                  : "bg-transparent text-[#888] border-[#ddd] hover:text-[#555]"
              }`}
              style={selectedEcart === s.key ? { background: s.color, borderColor: s.color } : undefined}
            >
              {s.label}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={YEARS.map((y, i) => ({ year: y, A: gainsA[i][selectedEcart], B: gainsB[i][selectedEcart] }))} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#999" }} />
            <YAxis tick={{ fontSize: 11, fill: "#999" }} tickFormatter={formatTick} />
            <Tooltip
              formatter={(value, name) => [
                `${formatBigNumber(value)} ${d.unit}`,
                name === "A" ? "Action A" : "Action B",
              ]}
              labelFormatter={(label) => `Année ${label}`}
            />
            <Bar dataKey="A" name="A" fill={COLOR_A} radius={[3, 3, 0, 0]} />
            <Bar dataKey="B" name="B" fill={COLOR_B} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart: trajectoires */}
      <ChartCard
        title={`Évolution ${d.label} · Ce qu'on visait vs. ce qu'on a obtenu`}
        sub="Comparaison entre les objectifs fixés au départ et les résultats réels"
      >
        <div className="flex flex-wrap gap-4 mb-3 text-xs text-[#6b7280]">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block" style={{ background: COLOR_A }} /> A · Résultat réel</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed inline-block" style={{ borderColor: COLOR_A }} /> A · Objectif visé</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block" style={{ background: COLOR_B }} /> B · Résultat réel</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed inline-block" style={{ borderColor: COLOR_B }} /> B · Objectif visé</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trajData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#999" }} />
            <YAxis tick={{ fontSize: 11, fill: "#999" }} />
            <Tooltip />
            <Line type="monotone" dataKey="A_expost" name="A · Résultat réel" stroke={COLOR_A} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="A_prev" name="A · Objectif visé" stroke={COLOR_A} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
            <Line type="monotone" dataKey="B_expost" name="B · Résultat réel" stroke={COLOR_B} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="B_prev" name="B · Objectif visé" stroke={COLOR_B} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart: écarts cumulés */}
      <ChartCard
        title={`Total des réductions depuis le lancement · ${d.label}`}
        sub="Tout ce qui a été évité au fil des années, cumulé"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={ecartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#999" }} />
            <YAxis tick={{ fontSize: 11, fill: "#999" }} tickFormatter={formatTick} />
            <Tooltip formatter={(value) => [`${value.toLocaleString()} ${d.unit}`]} />
            <Bar dataKey="A" name="Action A" fill={COLOR_A} radius={[3, 3, 0, 0]} />
            <Bar dataKey="B" name="Action B" fill={COLOR_B} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="card-shadow p-6">
      <div className="text-sm font-semibold text-[#111] mb-1">{title}</div>
      <div className="text-xs text-[#9ca3af] mb-4">{sub}</div>
      {children}
    </div>
  );
}

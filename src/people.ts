import type { DashboardData, Legislator } from './types';

export type LegislatorWithSlug = Legislator & { slug: string };

export interface MonthlyDebtPoint {
  date: string;
  total: number;
  entityCount: number;
  maxSituation: number;
}

export interface PersonStats {
  monthlySeries: MonthlyDebtPoint[];
  firstMonth: string | null;
  latestMonth: string | null;
  latestDebt: number;
  peakMonth: string | null;
  peakDebt: number;
  averageMonthlyDebt: number;
  totalReportedDebt: number;
  monthsWithDebt: number;
  entityCount: number;
  familiaresCount: number;
  latestSituation: number | null;
  latestVariationPct: number | null;
}

export const SITE_URL = 'https://cuantodeben.visualizando.ar';

export function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export function mergeDashboardPeople(
  dbData: DashboardData,
  politicosData: DashboardData,
  judicialData: DashboardData,
): LegislatorWithSlug[] {
  const rawLegisladores = dbData.data;
  const rawPoliticos = politicosData.data;
  const rawJudicial = judicialData.data;

  const politicosByCuit = new Map(rawPoliticos.map((p) => [p.cuit, p]));
  const merged = rawLegisladores.map((l) => {
    const pol = politicosByCuit.get(l.cuit);
    return pol
      ? { ...l, unidad: pol.unidad, poder: 'legislativo' as const }
      : { ...l, poder: 'legislativo' as const };
  });

  const legCuits = new Set(rawLegisladores.map((l) => l.cuit));
  const execCuits = new Set(rawPoliticos.map((p) => p.cuit));
  const combined = [
    ...merged,
    ...rawPoliticos
      .filter((p) => !legCuits.has(p.cuit))
      .map((p) => ({ ...p, poder: 'ejecutivo' as const })),
    ...rawJudicial
      .filter((j) => !legCuits.has(j.cuit) && !execCuits.has(j.cuit))
      .map((j) => ({ ...j, poder: 'judicial' as const })),
  ];

  const seen = new Map<string, number>();
  return combined.map((l) => {
    let slug = slugify(l.nombre);
    if (seen.has(slug)) {
      const count = seen.get(slug)! + 1;
      seen.set(slug, count);
      slug = `${slug}-${count}`;
    } else {
      seen.set(slug, 1);
    }

    return { ...l, slug };
  });
}

export function getPersonSlugFromPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const match = normalized.match(/^\/persona\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function readEmbeddedPersonData() {
  const node = document.getElementById('person-page-data');
  if (!node?.textContent) return null;

  try {
    return JSON.parse(node.textContent) as LegislatorWithSlug;
  } catch {
    return null;
  }
}

export function formatMonthLabel(value: string | null) {
  if (!value) return 'Sin datos';

  const [year, month] = value.split('-');
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const monthIndex = Number(month) - 1;

  if (!year || monthIndex < 0 || monthIndex >= monthNames.length) {
    return value;
  }

  return `${monthNames[monthIndex]} ${year}`;
}

export function formatMoneyArs(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value * 1000);
}

export function formatCompactMoneyArs(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value * 1000);
}

export function getMonthlyDebtSeries(legislator: Legislator) {
  const monthly = new Map<string, { total: number; entities: Set<string>; maxSituation: number }>();

  for (const record of legislator.historial || []) {
    const current = monthly.get(record.fecha) || {
      total: 0,
      entities: new Set<string>(),
      maxSituation: 0,
    };

    current.total += record.monto;
    current.entities.add(record.entidad);
    current.maxSituation = Math.max(current.maxSituation, record.situacion || 0);
    monthly.set(record.fecha, current);
  }

  return [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      total: value.total,
      entityCount: value.entities.size,
      maxSituation: value.maxSituation,
    }));
}

export function getPersonStats(legislator: Legislator): PersonStats {
  const monthlySeries = getMonthlyDebtSeries(legislator);
  const firstPoint = monthlySeries[0];
  const latestPoint = monthlySeries[monthlySeries.length - 1];
  const previousPoint = monthlySeries[monthlySeries.length - 2];
  const peakPoint = monthlySeries.reduce<MonthlyDebtPoint | null>((max, point) => {
    if (!max || point.total > max.total) return point;
    return max;
  }, null);

  const totalReportedDebt = monthlySeries.reduce((sum, point) => sum + point.total, 0);
  const entityCount = new Set((legislator.historial || []).map((record) => record.entidad)).size;
  const familiaresCount = (legislator.familiares || []).filter((f) => (f.historial || []).length > 0).length;

  return {
    monthlySeries,
    firstMonth: firstPoint?.date ?? null,
    latestMonth: latestPoint?.date ?? null,
    latestDebt: latestPoint?.total ?? 0,
    peakMonth: peakPoint?.date ?? null,
    peakDebt: peakPoint?.total ?? 0,
    averageMonthlyDebt: monthlySeries.length > 0 ? totalReportedDebt / monthlySeries.length : 0,
    totalReportedDebt,
    monthsWithDebt: monthlySeries.length,
    entityCount,
    familiaresCount,
    latestSituation: legislator.situacion_bcra ?? latestPoint?.maxSituation ?? null,
    latestVariationPct:
      latestPoint && previousPoint && previousPoint.total > 0
        ? ((latestPoint.total - previousPoint.total) / previousPoint.total) * 100
        : null,
  };
}

export function getPowerLabel(legislator: Legislator) {
  switch (legislator.poder) {
    case 'legislativo':
      return 'Poder Legislativo';
    case 'ejecutivo':
      return 'Poder Ejecutivo';
    case 'judicial':
      return 'Poder Judicial';
    default:
      return 'Funcionario';
  }
}

export function getPersonRoute(slug: string) {
  return `/persona/${slug}/`;
}

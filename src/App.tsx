import { useMemo, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Dashboard from './Dashboard';
import PeopleDirectoryPage from './PeopleDirectoryPage';
import PersonPage from './PersonPage';
import type { DashboardData } from './types';
import {
  type LegislatorWithSlug,
  type PersonDirectoryItem,
  formatMonthLabel,
  formatMoneyArs,
  getPeopleDirectoryEntries,
  getPersonSlugFromPath,
  isPeopleDirectoryPath,
  mergeDashboardPeople,
  readEmbeddedPeopleDirectory,
  readEmbeddedPersonData,
} from './people';
import { withBasePath } from './site';
import { usePostHog } from '@posthog/react';

// scrollToExplorer function removed as we now use tabs

interface AppProps {
  initialPathname?: string;
  initialSearch?: string;
}

export default function App({ initialPathname, initialSearch }: AppProps) {
  const posthog = usePostHog();
  const pathname = initialPathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const search = initialSearch ?? (typeof window !== 'undefined' ? window.location.search : '');
  const personSlug = useMemo(() => getPersonSlugFromPath(pathname), [pathname]);
  const isPeopleDirectory = useMemo(() => isPeopleDirectoryPath(pathname), [pathname]);
  const [embeddedPerson] = useState<LegislatorWithSlug | null>(() => (
    personSlug ? readEmbeddedPersonData() : null
  ));
  const [embeddedPeopleDirectory] = useState<PersonDirectoryItem[] | null>(() => (
    isPeopleDirectory ? readEmbeddedPeopleDirectory() : null
  ));
  const [dbData, setDbData] = useState<DashboardData | null>(null);
  const [politicosData, setPoliticosData] = useState<DashboardData | null>(null);
  const [judicialData, setJudicialData] = useState<DashboardData | null>(null);
  const [peopleDirectory, setPeopleDirectory] = useState<PersonDirectoryItem[] | null>(embeddedPeopleDirectory);
  const [person, setPerson] = useState<LegislatorWithSlug | null>(embeddedPerson);
  const [personNotFound, setPersonNotFound] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'resumen' | 'explorador' | 'acerca'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('funcionarios') || params.get('legisladores')) {
        return 'explorador';
      }
    }
    return 'resumen';
  });
  const [selectedProvincia, setSelectedProvincia] = useState<string | null>(null);

  useEffect(() => {
    if (personSlug && embeddedPerson) return;
    if (isPeopleDirectory && embeddedPeopleDirectory) return;

    const params = new URLSearchParams(search);
    const hasPreselected = !!(params.get('funcionarios') || params.get('legisladores'));

    Promise.all([
      fetch(withBasePath('/legisladores_full.json')).then(r => r.json()),
      fetch(withBasePath('/politicos_full.json')).then(r => r.json()),
      fetch(withBasePath('/judicial_full.json')).then(r => r.json()),
    ]).then(([db, pol, jud]) => {
      const merged = mergeDashboardPeople(db, pol, jud);

      if (personSlug) {
        const found = merged.find((candidate) => candidate.slug === personSlug) || null;
        setPerson(found);
        setPersonNotFound(!found);
        return;
      }

      if (isPeopleDirectory) {
        setPeopleDirectory(getPeopleDirectoryEntries(merged));
        return;
      }

      setDbData(db);
      setPoliticosData(pol);
      setJudicialData(jud);
      if (hasPreselected) {
        setActiveTab('explorador');
      }
    });
  }, [embeddedPeopleDirectory, embeddedPerson, isPeopleDirectory, personSlug, search]);

  const heroMetrics = useMemo(() => {
    if (!dbData || !politicosData || !judicialData) return null;
    const combined = mergeDashboardPeople(dbData, politicosData, judicialData);

    let latestMonth = '';
    combined.forEach((l) => {
      (l.historial || []).forEach((h) => {
        if (h.fecha > latestMonth) latestMonth = h.fecha;
      });
      (l.familiares || []).forEach((f) => {
        (f.historial || []).forEach((h) => {
          if (h.fecha > latestMonth) latestMonth = h.fecha;
        });
      });
    });

    let totalDebt = 0;
    let totalTitular = 0;
    let totalFamiliar = 0;
    
    const deudaPorPoder = { legislativo: 0, ejecutivo: 0, judicial: 0 };
    const deudaPorProvincia: Record<string, number> = {};
    const situacionCounts = { normal: 0, riesgo: 0, sin_datos: 0 };
    const ranking: { person: LegislatorWithSlug, totalPersonDebt: number }[] = [];

    combined.forEach((l) => {
      let personTitularDebt = 0;
      let personFamiliarDebt = 0;

      (l.historial || []).forEach(h => {
        if (h.fecha === latestMonth) personTitularDebt += h.monto;
      });

      (l.familiares || []).forEach(f => {
        (f.historial || []).forEach(h => {
          if (h.fecha === latestMonth) personFamiliarDebt += h.monto;
        });
      });

      const totalPersonDebt = personTitularDebt + personFamiliarDebt;
      
      totalTitular += personTitularDebt;
      totalFamiliar += personFamiliarDebt;
      totalDebt += totalPersonDebt;

      if (totalPersonDebt > 0) {
        ranking.push({ person: l, totalPersonDebt });
      }

      if (l.poder === 'legislativo') deudaPorPoder.legislativo += totalPersonDebt;
      else if (l.poder === 'ejecutivo') deudaPorPoder.ejecutivo += totalPersonDebt;
      else if (l.poder === 'judicial') deudaPorPoder.judicial += totalPersonDebt;

      if (l.distrito && l.distrito.trim() !== '' && totalPersonDebt > 0) {
        deudaPorProvincia[l.distrito] = (deudaPorProvincia[l.distrito] || 0) + totalPersonDebt;
      }

      const sit = l.situacion_bcra || 0;
      if (sit === 1) situacionCounts.normal++;
      else if (sit >= 2 && sit <= 6) situacionCounts.riesgo++;
      else situacionCounts.sin_datos++;
    });

    ranking.sort((a, b) => b.totalPersonDebt - a.totalPersonDebt);
    const top3 = ranking.slice(0, 3);
    const averageDebt = combined.length > 0 ? totalDebt / combined.length : 0;

    const provinciasList = Object.entries(deudaPorProvincia)
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, monto]) => ({ nombre, monto }));

    return {
      funcionariosCount: combined.length,
      latestMonthLabel: formatMonthLabel(latestMonth),
      totalDebt,
      totalTitular,
      totalFamiliar,
      deudaPorPoder,
      deudaPorProvincia: provinciasList,
      situacionCounts,
      top3,
      fullRanking: ranking,
      averageDebt,
      latestMep: dbData.meta.mep[latestMonth] || null,
    };
  }, [dbData, politicosData, judicialData]);

  if (personSlug) {
    if (person) {
      return <PersonPage person={person} />;
    }

    if (personNotFound) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6">
          <div className="max-w-xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-3xl font-black uppercase text-gray-950">Persona no encontrada</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              La URL no coincide con ninguna ficha generada. Volvé al explorador para buscar otra persona o abrir una comparativa.
            </p>
            <a
              href={withBasePath("/")}
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Ir al inicio
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Cargando ficha…</p>
      </div>
    );
  }

  if (isPeopleDirectory) {
    if (peopleDirectory) {
      return <PeopleDirectoryPage entries={peopleDirectory} />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Cargando directorio…</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-gray-50 flex flex-col overflow-hidden font-sans text-gray-800">
      {/* Navbar with Glassmorphism */}
      <header className="flex-none bg-white/70 backdrop-blur-md border-b border-gray-200 z-50 px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setActiveTab('resumen')}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white font-bold text-sm shadow-md transition-transform duration-300 group-hover:scale-105">
            CD
          </div>
          <h1 className="font-black text-lg tracking-tight text-gray-900 hidden sm:block group-hover:text-blue-600 transition-colors duration-300">¿CUÁNTO DEBEN?</h1>
        </div>
        
        <nav className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-xl border border-gray-200/50">
          <button 
            onClick={() => setActiveTab('resumen')}
            className={`px-3 md:px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'resumen' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
          >
            Resumen
          </button>
          <button 
            onClick={() => { posthog?.capture('explorer_tab_clicked'); setActiveTab('explorador'); }}
            className={`px-3 md:px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'explorador' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
          >
            Explorador
          </button>
          <button 
            onClick={() => setActiveTab('acerca')}
            className={`px-3 md:px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === 'acerca' ? 'bg-white shadow-sm text-blue-600 ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
          >
            Acerca
          </button>
        </nav>
        
        <div className="hidden md:block">
          <a
            href={withBasePath("/personas/")}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
          >
            Directorio <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* Resumen Tab */}
        {activeTab === 'resumen' && (
          <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-white to-gray-50 animate-in fade-in duration-500">
            <div className="max-w-5xl mx-auto px-6 py-8 md:py-16 flex flex-col justify-center min-h-full">
              <div className="max-w-3xl space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/50 px-4 py-1.5 text-xs font-semibold tracking-widest text-blue-700 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  DATOS OFICIALES BCRA
                </span>
                
                <h2 className="text-4xl md:text-6xl font-black tracking-tight text-gray-900 leading-[1.1]">
                  Visualizador de <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-400">Deuda Pública</span>
                </h2>
                
                <p className="text-lg text-gray-600 max-w-2xl leading-relaxed">
                  Explora la evolución mensual de deuda reportada para figuras públicas argentinas, con ajustes en pesos constantes o en dólares. Incluye funcionarios, legisladores y sus familiares.
                </p>
                
                {/* Modern Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 pt-4">
                  
                  {/* Basic Stats */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 col-span-2 md:col-span-2 rounded-2xl bg-white/60 backdrop-blur-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Base de Datos</p>
                      <p className="mt-2 text-2xl font-black text-gray-900">{heroMetrics ? heroMetrics.funcionariosCount.toLocaleString('es-AR') : '…'} <span className="text-sm font-normal text-gray-500">registros</span></p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200/50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mes Analizado</p>
                      <p className="mt-1 text-sm font-bold text-gray-700">{heroMetrics ? (heroMetrics.latestMonthLabel || 'Sin datos') : '…'}</p>
                    </div>
                  </div>

                  {/* Riesgo BCRA */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 col-span-2 md:col-span-2 rounded-2xl bg-amber-50/60 backdrop-blur-xl border border-amber-200/60 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
                    <div>
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Situación Crediticia</p>
                      <p className="mt-2 text-3xl font-black text-amber-900">{heroMetrics ? heroMetrics.situacionCounts.riesgo : '…'}</p>
                      <p className="text-sm text-amber-800/80">en situación irregular o riesgo (2 al 5)</p>
                    </div>
                    <div className="mt-4 text-xs font-semibold text-amber-700/60">
                      {heroMetrics ? heroMetrics.situacionCounts.normal : '…'} en situación 1 (Normal)
                    </div>
                  </div>

                  {/* Top 3 */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 col-span-2 md:col-span-2 rounded-2xl bg-red-50/60 backdrop-blur-xl border border-red-200/60 p-5 shadow-sm hover:shadow-md transition-all" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">Top 3 Deudores</p>
                    <div className="space-y-3">
                      {heroMetrics?.top3.map((item, i) => (
                        <div key={item.person.cuit} className="flex items-center justify-between group cursor-pointer" onClick={() => window.location.href = withBasePath(`/personas/${item.person.slug}`)}>
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="flex-none w-5 h-5 rounded-full bg-red-200 text-red-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                            <p className="text-sm font-bold text-gray-900 truncate group-hover:text-red-600 transition-colors" title={item.person.nombre}>{item.person.nombre}</p>
                          </div>
                          <p className="text-xs font-bold text-red-700 whitespace-nowrap pl-2">{formatMoneyArs(item.totalPersonDebt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deuda Total & Poder */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 col-span-2 md:col-span-4 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 backdrop-blur-xl border border-violet-200/60 p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-6" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-violet-600 uppercase tracking-wider flex items-center gap-2">Deuda Total Acumulada <span className="px-2 py-0.5 bg-violet-200 text-violet-800 rounded-full text-[10px]">Titulares + Familiares</span></p>
                        <p className="mt-2 text-4xl font-black text-gray-900 tracking-tight">
                          {heroMetrics ? formatMoneyArs(heroMetrics.totalDebt) : '…'}
                        </p>
                      </div>
                      {heroMetrics?.latestMep && (
                        <div className="text-left md:text-right">
                          <p className="text-xs font-semibold text-violet-500 uppercase tracking-wider">Equivalente USD (MEP)</p>
                          <p className="text-2xl font-bold text-violet-800">
                            ~ US$ {new Intl.NumberFormat('es-AR').format(Math.round((heroMetrics.totalDebt * 1000) / heroMetrics.latestMep))}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {/* Progress Bar Poder */}
                    <div className="w-full space-y-2">
                      <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                        <span>Desglose por Poder del Estado</span>
                      </div>
                      <div className="h-6 w-full rounded-full flex overflow-hidden bg-gray-200">
                        <div className="bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap px-1" style={{ width: `${heroMetrics ? (heroMetrics.deudaPorPoder.legislativo / heroMetrics.totalDebt) * 100 : 0}%` }} title="Legislativo">
                          {heroMetrics && heroMetrics.deudaPorPoder.legislativo > 0 ? formatMoneyArs(heroMetrics.deudaPorPoder.legislativo) : ''}
                        </div>
                        <div className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap px-1" style={{ width: `${heroMetrics ? (heroMetrics.deudaPorPoder.ejecutivo / heroMetrics.totalDebt) * 100 : 0}%` }} title="Ejecutivo">
                          {heroMetrics && heroMetrics.deudaPorPoder.ejecutivo > 0 ? formatMoneyArs(heroMetrics.deudaPorPoder.ejecutivo) : ''}
                        </div>
                        <div className="bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap px-1" style={{ width: `${heroMetrics ? (heroMetrics.deudaPorPoder.judicial / heroMetrics.totalDebt) * 100 : 0}%` }} title="Judicial">
                          {heroMetrics && heroMetrics.deudaPorPoder.judicial > 0 ? formatMoneyArs(heroMetrics.deudaPorPoder.judicial) : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold uppercase tracking-wider mt-2">
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Legislativo ({heroMetrics ? Math.round((heroMetrics.deudaPorPoder.legislativo / heroMetrics.totalDebt) * 100) : 0}%)</div>
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Ejecutivo ({heroMetrics ? Math.round((heroMetrics.deudaPorPoder.ejecutivo / heroMetrics.totalDebt) * 100) : 0}%)</div>
                        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Judicial ({heroMetrics ? Math.round((heroMetrics.deudaPorPoder.judicial / heroMetrics.totalDebt) * 100) : 0}%)</div>
                      </div>
                    </div>
                  </div>

                  {/* Titular vs Familiar & Promedio */}
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 col-span-2 md:col-span-2 flex flex-col gap-4" style={{ animationDelay: '500ms', animationFillMode: 'both' }}>
                    <div className="flex-1 rounded-2xl bg-indigo-50/60 backdrop-blur-xl border border-indigo-200/60 p-5 shadow-sm hover:shadow-md transition-all">
                       <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">Promedio por Funcionario</p>
                       <p className="text-2xl font-black text-gray-900">{heroMetrics ? formatMoneyArs(heroMetrics.averageDebt) : '…'}</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-white/60 backdrop-blur-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between">
                        <span>Titular</span> <span>Familiar</span>
                      </p>
                      <div className="flex items-end justify-between">
                        <p className="text-sm font-bold text-gray-800">{heroMetrics ? Math.round((heroMetrics.totalTitular / heroMetrics.totalDebt) * 100) : 0}%</p>
                        <p className="text-sm font-bold text-gray-500">{heroMetrics ? Math.round((heroMetrics.totalFamiliar / heroMetrics.totalDebt) * 100) : 0}%</p>
                      </div>
                      <div className="h-2 w-full rounded-full flex overflow-hidden bg-gray-200 mt-1">
                        <div className="bg-gray-800" style={{ width: `${heroMetrics ? (heroMetrics.totalTitular / heroMetrics.totalDebt) * 100 : 0}%` }}></div>
                        <div className="bg-gray-400" style={{ width: `${heroMetrics ? (heroMetrics.totalFamiliar / heroMetrics.totalDebt) * 100 : 0}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Provincias */}
                  {heroMetrics && heroMetrics.deudaPorProvincia.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 col-span-2 md:col-span-6 rounded-2xl bg-white/60 backdrop-blur-xl border border-gray-200/60 p-5 shadow-sm hover:shadow-md transition-all" style={{ animationDelay: '600ms', animationFillMode: 'both' }}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Deuda Distrital (Provincias con deuda registrada)</p>
                      <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
                        {heroMetrics.deudaPorProvincia.map((prov) => (
                          <div key={prov.nombre} onClick={() => setSelectedProvincia(prov.nombre)} className="flex-none w-48 bg-gray-50/80 border border-gray-100 rounded-xl p-3 snap-start hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer group">
                            <p className="text-sm font-bold text-gray-800 truncate group-hover:text-blue-800 transition-colors" title={prov.nombre}>{prov.nombre}</p>
                            <p className="mt-1 text-lg font-black text-blue-600">{formatMoneyArs(prov.monto)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-8 flex items-center gap-4">
                  <button
                    onClick={() => setActiveTab('explorador')}
                    className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-gray-900 px-8 py-4 font-bold text-white transition-all duration-300 hover:scale-105 hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Abrir el Explorador
                      <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </span>
                    <div className="absolute inset-0 z-0 bg-gradient-to-r from-blue-600 to-sky-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                  </button>
                  <a
                    href={withBasePath("/personas/")}
                    className="md:hidden text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
                  >
                    Ver Directorio &rarr;
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Explorador Tab */}
        {activeTab === 'explorador' && (
          <div className="absolute inset-0 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-gray-100">
            {dbData && politicosData && judicialData ? (
              <Dashboard dbData={dbData} politicosData={politicosData} judicialData={judicialData} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        )}

        {/* Acerca Tab */}
        {activeTab === 'acerca' && (
          <div className="absolute inset-0 overflow-y-auto bg-gray-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-3xl mx-auto px-6 py-12">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 md:p-12 space-y-8">
                <div>
                  <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Sobre el Proyecto</h2>
                  <p className="text-gray-600 leading-relaxed text-lg">
                    Proyecto cívico para facilitar la lectura pública de datos financieros de funcionarios y legisladores, con foco en transparencia y comparación histórica. Hecho para exploración pública y periodismo de datos.
                  </p>
                </div>
                
                <hr className="border-gray-100" />
                
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Equipo</h3>
                    <ul className="space-y-5">
                      <li>
                        <p className="font-bold text-gray-900 text-base">Sebastián Waisbrot</p>
                        <p className="text-sm text-gray-500">Autor Original</p>
                        <a href="https://github.com/seppo0010" target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">github.com/seppo0010</a>
                      </li>
                      <li>
                        <p className="font-bold text-gray-900 text-base">Andrés Snitcofsky</p>
                        <p className="text-sm text-gray-500">Diseño, Viz y UX</p>
                        <a href="https://visualizando.ar" target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">visualizando.ar</a>
                      </li>
                      <li>
                        <p className="font-bold text-gray-900 text-base">Hector Daniel Ayarachi Fuentes</p>
                        <p className="text-sm text-gray-500">Rediseño UI/UX (Layout Moderno)</p>
                      </li>
                    </ul>
                  </div>
                  
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Código Fuente</h3>
                    <a
                      href="https://github.com/seppo0010/gastos-congresistas"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-semibold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                      Ver en GitHub
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Modal Provincia */}
        {selectedProvincia && heroMetrics && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setSelectedProvincia(null)}>
            <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-black text-xl text-gray-900">{selectedProvincia}</h3>
                  <p className="text-xs font-semibold text-gray-500 uppercase mt-1">Funcionarios con Deuda</p>
                </div>
                <button onClick={() => setSelectedProvincia(null)} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-2 pr-2">
                {heroMetrics.fullRanking
                  .filter(item => item.person.distrito === selectedProvincia)
                  .map((item) => (
                    <div key={item.person.cuit} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors group" onClick={() => window.location.href = withBasePath(`/personas/${item.person.slug}`)}>
                      <div className="min-w-0 pr-3">
                        <p className="font-bold text-gray-900 text-sm truncate group-hover:text-blue-800 transition-colors">{item.person.nombre}</p>
                        <p className="text-[10px] text-gray-500 uppercase truncate" title={item.person.cargo}>{item.person.cargo}</p>
                      </div>
                      <p className="font-black text-blue-600 shrink-0">{formatMoneyArs(item.totalPersonDebt)}</p>
                    </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

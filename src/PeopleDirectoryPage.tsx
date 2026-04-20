import { useState, useMemo } from 'react';
import { ArrowLeft, Search } from "lucide-react";
import {
  type PersonDirectoryItem,
  getPersonContextLine,
  getPersonRoute,
  getPowerLabel,
} from "./people";
import { withBasePath } from "./site";

interface PeopleDirectoryPageProps {
  entries: PersonDirectoryItem[];
}

export default function PeopleDirectoryPage({
  entries,
}: PeopleDirectoryPageProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredEntries = useMemo(() => {
    const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return entries.filter(e => 
      e.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term) ||
      (e.cargo && e.cargo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term))
    );
  }, [entries, searchTerm]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-white to-gray-50 font-sans text-gray-800">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <a
              href={withBasePath("/")}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors shrink-0"
              title="Volver al inicio"
            >
              <ArrowLeft size={18} />
            </a>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                Directorio Público
              </p>
              <h1 className="text-xl font-black uppercase tracking-tight text-gray-900">
                Personas incluidas
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white/80 border border-gray-200/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all"
              />
            </div>
            <div className="shrink-0 text-center px-4 py-2 bg-white/60 backdrop-blur border border-gray-200/60 rounded-xl shadow-sm">
               <p className="text-sm font-black text-gray-900">{filteredEntries.length}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEntries.map((entry) => {
            const contextLine = getPersonContextLine(entry);

            return (
              <a
                key={entry.slug}
                href={getPersonRoute(entry.slug)}
                className="group block rounded-2xl border border-gray-200/60 bg-white/60 backdrop-blur-sm p-5 shadow-sm hover:shadow-md hover:bg-white transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                      {getPowerLabel(entry)}
                    </p>
                    <span className="text-gray-300 group-hover:text-blue-500 transition-colors">&rarr;</span>
                  </div>
                  <div>
                    <h2 className="text-base font-black uppercase leading-tight text-gray-900 group-hover:text-blue-700 transition-colors">
                      {entry.nombre}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500">
                      {contextLine || "Sin detalle institucional adicional."}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
          
          {filteredEntries.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500">
              No se encontraron resultados para "{searchTerm}".
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

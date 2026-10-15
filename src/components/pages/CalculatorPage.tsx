import React from 'react';
import { Calculator } from '../Calculator';
import { Calculator as CalculatorIcon, Keyboard, Lightbulb } from 'lucide-react';

export const CalculatorPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Banner / Title Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <CalculatorIcon className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                Calculatrice Intégrée
              </h1>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Application web de calculatrice standard et scientifique avec raccourcis clavier,
              gestion de mémoire et historique complet des calculs.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <Keyboard className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <span className="font-semibold text-slate-300">Raccourcis Clavier:</span>{' '}
              Saisissez directement les chiffres, <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">+ - * /</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">Enter</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">Backspace</code> ou <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300">Esc</code>.
            </div>
          </div>
        </div>
      </div>

      {/* Calculator Main View */}
      <div className="py-2">
        <Calculator />
      </div>

      {/* Feature Hints Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Précision Numérique</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Formatage automatique éliminant les erreurs d'arrondi à virgule flottante.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <CalculatorIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Opérations Mémoire</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Utilisez MC, MR, M+ et M- pour conserver et accumuler des valeurs intermédiaires.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Historique Interactif</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Cliquez sur n'importe quel résultat dans le panneau d'historique pour le réutiliser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

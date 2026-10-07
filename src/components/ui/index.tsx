import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  HelpCircle,
  Copy,
  Check,
  ShieldAlert,
  Sparkles,
  Info,
} from 'lucide-react';

export type AppStatus =
  | 'IDLE'
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING'
  | 'SUCCESS'
  | 'COMPLETED'
  | 'WARNING'
  | 'FAILED'
  | 'ERROR'
  | 'CANCELLED'
  | 'CANCELED'
  | 'ROLLED_BACK'
  | 'UNKNOWN';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'inset' | 'accent' | 'error' | 'success' | 'warning';
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-slate-900/90 border-slate-800 shadow-xl',
    inset: 'bg-slate-950/80 border-slate-800/80 shadow-inner',
    accent: 'bg-slate-900 border-blue-500/30 shadow-xl shadow-blue-500/5',
    error: 'bg-rose-950/20 border-rose-500/30 shadow-md',
    success: 'bg-emerald-950/20 border-emerald-500/30 shadow-md',
    warning: 'bg-amber-950/20 border-amber-500/30 shadow-md',
  }[variant];

  return (
    <div
      className={`border rounded-2xl p-5 sm:p-6 transition-all ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  action,
  icon,
  className = '',
  children,
  ...props
}) => {
  return (
    <section className={`space-y-4 ${className}`} {...props}>
      {(title || subtitle || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            {icon && <div className="text-blue-400 shrink-0">{icon}</div>}
            <div>
              {title && (
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {title}
                </h3>
              )}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="self-start sm:self-auto shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
};

/**
 * Standardized StatusBadge component
 * Supports all 9 canonical states:
 * Idle, Queued, Running, Waiting, Success, Warning, Failed, Cancelled, Unknown
 */
export interface StatusBadgeProps {
  status: AppStatus | string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  labelOverride?: string;
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  size = 'md',
  labelOverride,
  showIcon = true,
}) => {
  const upper = String(status || '').toUpperCase();
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }[size];

  if (upper === 'RUNNING' || upper === 'IN_PROGRESS' || upper === 'PROCESSING') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'En cours'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        )}
        <span>{labelOverride || 'EN COURS'}</span>
      </span>
    );
  }

  if (upper === 'QUEUED' || upper === 'EN_ATTENTE' || upper === 'SCHEDULED') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'En file d’attente'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />}
        <span>{labelOverride || 'EN ATTENTE'}</span>
      </span>
    );
  }

  if (upper === 'WAITING' || upper === 'WAITING_WORKFLOW' || upper === 'AWAITING_PLAN_APPROVAL') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'En attente d’action'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-purple-500/15 text-purple-300 font-semibold border border-purple-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-hidden="true" />}
        <span>{labelOverride || 'ATTENTE ACTION'}</span>
      </span>
    );
  }

  if (upper === 'SUCCESS' || upper === 'COMPLETED' || upper === 'TERMINAL_SUCCESS') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'Succès'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />}
        <span>{labelOverride || 'RÉUSSI'}</span>
      </span>
    );
  }

  if (upper === 'WARNING' || upper === 'HALTED_GATE' || upper === 'DEGRADED') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'Avertissement'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />}
        <span>{labelOverride || 'ATTENTION'}</span>
      </span>
    );
  }

  if (upper === 'FAILED' || upper === 'ERROR' || upper === 'TERMINAL_FAILURE') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'Échec'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 text-rose-300 font-bold border border-rose-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />}
        <span>{labelOverride || 'ÉCHEC'}</span>
      </span>
    );
  }

  if (upper === 'CANCELLED' || upper === 'CANCELED' || upper === 'ROLLED_BACK') {
    return (
      <span
        role="status"
        aria-label={labelOverride || 'Annulé'}
        className={`inline-flex items-center gap-1.5 rounded-md bg-slate-800 text-slate-300 font-semibold border border-slate-700 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        {showIcon && <RotateCcw className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />}
        <span>{labelOverride || (upper === 'ROLLED_BACK' ? 'RETOURNÉ' : 'ANNULÉ')}</span>
      </span>
    );
  }

  // IDLE / UNKNOWN
  return (
    <span
      role="status"
      aria-label={labelOverride || 'Inactif'}
      className={`inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-slate-400 font-medium border border-slate-800 font-mono tracking-wider ${sizeClasses} ${className}`}
    >
      {showIcon && <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" aria-hidden="true" />}
      <span>{labelOverride || (upper === 'IDLE' ? 'PRÊT' : 'INCONNU')}</span>
    </span>
  );
};

/**
 * StatusCard: High-level overview card with Title, Status, Description, Action
 */
export interface StatusCardProps {
  title: string;
  status: AppStatus | string;
  description: string;
  actionButton?: React.ReactNode;
  icon?: React.ReactNode;
  metadata?: { label: string; value: React.ReactNode }[];
  className?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  status,
  description,
  actionButton,
  icon,
  metadata = [],
  className = '',
}) => {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon && <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-blue-400">{icon}</div>}
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-100">{title}</h4>
            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {metadata.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80">
          {metadata.map((m, idx) => (
            <div key={idx} className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">{m.label}</span>
              <span className="text-xs font-semibold text-slate-200 mt-0.5 block">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {actionButton && <div className="pt-2">{actionButton}</div>}
    </div>
  );
};

/**
 * ProgressState: Visual Pipeline Steps (À faire → En cours → Réussi / Échec)
 */
export interface PipelineStep {
  id: string;
  label: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  detail?: string;
}

export interface ProgressStateProps {
  steps: PipelineStep[];
  className?: string;
}

export const ProgressState: React.FC<ProgressStateProps> = ({ steps, className = '' }) => {
  return (
    <div className={`w-full bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 overflow-x-auto">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-2.5 min-w-[120px] flex-1 py-1">
                <div className="shrink-0">
                  {step.status === 'RUNNING' && (
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500 flex items-center justify-center text-blue-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  )}
                  {step.status === 'COMPLETED' && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {step.status === 'FAILED' && (
                    <div className="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center text-rose-400">
                      <XCircle className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {step.status === 'PENDING' && (
                    <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-[11px] font-bold font-mono">
                      {idx + 1}
                    </div>
                  )}
                  {step.status === 'SKIPPED' && (
                    <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 text-[11px]">
                      -
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">{step.label}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {step.detail || (
                      step.status === 'RUNNING' ? 'En cours' :
                      step.status === 'COMPLETED' ? 'Validé' :
                      step.status === 'FAILED' ? 'Échoué' : 'À faire'
                    )}
                  </div>
                </div>
              </div>

              {!isLast && (
                <div className="hidden sm:block text-slate-700 mx-1 shrink-0">
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/**
 * ResultBanner: Clean feedback banner following ACTION → ÉTAT → RÉSULTAT → DÉTAILS
 */
export interface ResultBannerProps {
  actionLabel: string;
  status: AppStatus | string;
  resultSummary: string;
  nextStep?: {
    label: string;
    onClick: () => void;
  };
  details?: React.ReactNode;
  className?: string;
}

export const ResultBanner: React.FC<ResultBannerProps> = ({
  actionLabel,
  status,
  resultSummary,
  nextStep,
  details,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const upper = String(status || '').toUpperCase();
  const isSuccess = upper === 'SUCCESS' || upper === 'COMPLETED';
  const isFailed = upper === 'FAILED' || upper === 'ERROR';

  return (
    <div
      className={`border rounded-2xl p-5 transition-all ${
        isSuccess
          ? 'bg-emerald-950/20 border-emerald-500/30'
          : isFailed
          ? 'bg-rose-950/20 border-rose-500/30'
          : 'bg-slate-900 border-slate-800'
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Action : {actionLabel}</span>
            <span>·</span>
            <StatusBadge status={status} size="sm" />
          </div>
          <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
            {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {isFailed && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{resultSummary}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {nextStep && (
            <button
              type="button"
              onClick={nextStep.onClick}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <span>{nextStep.label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {details && (
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
            >
              <span>Détails</span>
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {showDetails && details && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 font-mono">
          {details}
        </div>
      )}
    </div>
  );
};

/**
 * EmptyState: Clear message explaining why it is empty + next step
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionButton?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionButton,
  className = '',
}) => {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-3 ${className}`}>
      {icon && <div className="mx-auto w-12 h-12 text-slate-500 flex items-center justify-center">{icon}</div>}
      <h3 className="text-sm sm:text-base font-bold text-slate-200">{title}</h3>
      <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">{description}</p>
      {actionButton && <div className="pt-3">{actionButton}</div>}
    </div>
  );
};

/**
 * ErrorState: Actionable structured error (Cause → Impact → Recommendation → Collapsible details)
 */
export interface ErrorStateProps {
  title?: string;
  cause: string;
  impact?: string;
  recommendation?: string;
  technicalDetails?: string;
  onRetry?: () => void;
  actionButton?: React.ReactNode;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Opération interrompue',
  cause,
  impact,
  recommendation,
  technicalDetails,
  onRetry,
  actionButton,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (technicalDetails) {
      navigator.clipboard.writeText(technicalDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`bg-rose-950/20 border border-rose-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-rose-200">{title}</h4>
            <p className="text-xs text-rose-300/80 mt-0.5 font-medium">{cause}</p>
          </div>
        </div>
        <StatusBadge status="FAILED" size="sm" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {impact && (
          <div className="bg-slate-950/70 p-3 rounded-xl border border-rose-500/20">
            <span className="text-[10px] font-mono uppercase text-rose-400 block font-bold">Impact</span>
            <span className="text-slate-300 mt-1 block">{impact}</span>
          </div>
        )}
        {recommendation && (
          <div className="bg-slate-950/70 p-3 rounded-xl border border-blue-500/20">
            <span className="text-[10px] font-mono uppercase text-blue-400 block font-bold">Action Recommandée</span>
            <span className="text-slate-300 mt-1 block">{recommendation}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-rose-500/20">
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réessayer</span>
            </button>
          )}
          {actionButton}
        </div>

        {technicalDetails && (
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono transition cursor-pointer"
          >
            <span>Détails techniques</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {showDetails && technicalDetails && (
        <div className="mt-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-2 relative">
          <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-900 pb-1">
            <span>DIAGNOSTIC TECHNIQUE (CONFIDENTIEL & SÉCURISÉ)</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 hover:text-slate-300 cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 text-rose-300/90 font-mono">
            {technicalDetails}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * DetailPanel: Collapsible technical details container
 */
export interface DetailPanelProps {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  title,
  badge,
  defaultOpen = false,
  children,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`border border-slate-800 rounded-2xl bg-slate-900 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full p-4 sm:p-5 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer bg-slate-900/90"
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" />
          <span>{title}</span>
        </span>
        <div className="flex items-center gap-2">
          {badge}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {isOpen && (
        <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-slate-950/80">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * NextAction: Prominent card guiding the user on the next optimal step
 */
export interface NextActionProps {
  title: string;
  description: string;
  buttonLabel: string;
  onAction: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const NextAction: React.FC<NextActionProps> = ({
  title,
  description,
  buttonLabel,
  onAction,
  icon,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-slate-900 border border-blue-500/30 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-3.5">
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
          {icon || <Sparkles className="w-5 h-5" />}
        </div>
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 block">
            Action Suivante Recommandée
          </span>
          <h4 className="text-sm sm:text-base font-bold text-slate-100 mt-0.5">{title}</h4>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <span>{buttonLabel}</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  isLoading,
  icon,
  className = '',
  children,
  disabled,
  ...props
}) => {
  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};

export interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  icon,
  className = '',
  children,
  ...props
}) => {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-600 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export interface MetricProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  highlightColor?: 'default' | 'emerald' | 'amber' | 'violet' | 'blue';
}

export const Metric: React.FC<MetricProps> = ({
  label,
  value,
  subtext,
  highlightColor = 'default',
}) => {
  const colorMap = {
    default: 'text-slate-100',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400',
    blue: 'text-blue-400',
  }[highlightColor];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
        {label}
      </span>
      <div className={`text-xl sm:text-2xl font-bold mt-1 font-mono ${colorMap}`}>
        {value}
      </div>
      {subtext && <span className="text-[11px] text-slate-400 block mt-0.5">{subtext}</span>}
    </div>
  );
};

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
} from 'lucide-react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'inset' | 'accent' | 'error' | 'success';
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-slate-900 border-slate-800 shadow-xl',
    inset: 'bg-slate-950/80 border-slate-800/80 shadow-inner',
    accent: 'bg-slate-900 border-violet-500/30 shadow-xl shadow-violet-500/5',
    error: 'bg-rose-950/20 border-rose-500/30 shadow-md',
    success: 'bg-emerald-950/20 border-emerald-500/30 shadow-md',
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
            {icon && <div className="text-violet-400 shrink-0">{icon}</div>}
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

export type AppStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'ROLLED_BACK'
  | 'PENDING';

export interface StatusBadgeProps {
  status: AppStatus | string;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  size = 'md',
}) => {
  const upper = String(status || '').toUpperCase();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  if (upper === 'RUNNING') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping shrink-0" aria-hidden="true" />
        ● RUNNING
      </span>
    );
  }

  if (upper === 'COMPLETED' || upper === 'SUCCESS') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
        ✓ COMPLETED
      </span>
    );
  }

  if (upper === 'FAILED' || upper === 'ERROR') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />
        ✕ FAILED
      </span>
    );
  }

  if (upper === 'CANCELLED' || upper === 'CANCELED') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        ↩ CANCELLED
      </span>
    );
  }

  if (upper === 'ROLLED_BACK') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 font-mono tracking-wider ${sizeClasses} ${className}`}
      >
        <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        ↩ ROLLED BACK
      </span>
    );
  }

  // IDLE or PENDING
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-slate-800 text-slate-300 font-semibold border border-slate-700 font-mono tracking-wider ${sizeClasses} ${className}`}
    >
      <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" aria-hidden="true" />
      {upper === 'IDLE' ? 'PRÊT (IDLE)' : '○ PENDING'}
    </span>
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

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
      {icon && <div className="mx-auto w-10 h-10 text-slate-500 flex items-center justify-center">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description && <p className="text-xs text-slate-500 max-w-sm mx-auto">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
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

export interface ExpandableDetailsProps {
  title: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const ExpandableDetails: React.FC<ExpandableDetailsProps> = ({
  title,
  badge,
  defaultOpen = false,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-800 rounded-2xl p-4 sm:p-5 bg-slate-900 space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
      >
        <span className="flex items-center gap-2">{title}</span>
        <div className="flex items-center gap-2">
          {badge}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {isOpen && <div className="pt-2 border-t border-slate-800/80">{children}</div>}
    </div>
  );
};

import React from 'react';

interface SummaryCardProps {
  title: string;
  value: string;
  /** Full value for hover tooltip when display is abbreviated. */
  detailValue?: string;
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  className?: string;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  detailValue,
  icon,
  className,
}) => {
  const isCurrency = value.trim().startsWith('Rp');
  const tooltip = detailValue ?? value;

  return (
    <div
      className={`bg-siloam-surface p-4 sm:p-5 rounded-xl shadow-soft animate-fade-in min-w-0 h-full ${className ?? ''}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="bg-siloam-blue/10 p-2.5 sm:p-3 rounded-full shrink-0">
          {React.cloneElement(icon, { className: 'h-5 w-5 sm:h-6 sm:w-6 text-siloam-blue' })}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-siloam-text-secondary leading-snug">{title}</p>
          <p
            className={`font-bold text-siloam-text-primary tabular-nums leading-snug mt-1 ${
              isCurrency
                ? 'text-base sm:text-lg xl:text-xl break-words'
                : 'text-2xl sm:text-3xl'
            }`}
            title={tooltip}
          >
            {value}
          </p>
        </div>
      </div>
    </div>
  );
};

SummaryCard.displayName = 'SummaryCard';

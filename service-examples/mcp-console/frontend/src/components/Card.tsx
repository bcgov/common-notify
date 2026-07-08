import type { FC, ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/** Copied from common-notify/frontend's Card component for visual consistency. */
const Card: FC<CardProps> = ({ title, subtitle, children, className = '' }) => (
  <div className={`bg-light rounded p-4 ${className}`}>
    {title && <h5 className={`fw-bold mb-${subtitle ? 2 : 3}`}>{title}</h5>}
    {subtitle && <h6 className="text-muted mb-3">{subtitle}</h6>}
    {children}
  </div>
);

export default Card;

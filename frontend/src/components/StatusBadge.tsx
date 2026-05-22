interface StatusBadgeProps {
  isActive: boolean
}

export const StatusBadge = ({ isActive }: StatusBadgeProps) => (
  <span className={`badge ${isActive ? 'bg-success' : 'bg-secondary'}`}>
    {isActive ? 'Active' : 'Disabled'}
  </span>
)

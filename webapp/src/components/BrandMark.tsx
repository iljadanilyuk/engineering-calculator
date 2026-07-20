export function BrandMark({ className = 'admin-brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <rect className="admin-brand-mark-bg" width="48" height="48" rx="14" />
      <path className="admin-brand-mark-p" d="M15 34V14h10.2c5.1 0 8.8 3.2 8.8 8s-3.7 8-8.8 8H20" />
      <path className="admin-brand-mark-flow" d="M15 34c7-1.2 10.8-4.2 12.7-8.2" />
      <circle className="admin-brand-mark-node" cx="13" cy="25" r="2.2" />
      <circle className="admin-brand-mark-node" cx="25.8" cy="19" r="2.2" />
    </svg>
  )
}

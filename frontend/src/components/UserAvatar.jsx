import clsx from 'clsx';

export default function UserAvatar({ name = '', avatarUrl = '', online = false, className = '' }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((chunk) => chunk[0])
    .join('')
    .toUpperCase() || 'NA';

  return (
    <div className={clsx('relative inline-flex items-center justify-center rounded-full bg-slate-700/80 text-sm font-semibold text-white', className)}>
      {avatarUrl ? <img src={avatarUrl} alt={name} className="h-full w-full rounded-full object-cover" /> : initials}
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#111b21] bg-emerald-400" />}
    </div>
  );
}

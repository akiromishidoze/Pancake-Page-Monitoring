type Tone = 'green' | 'yellow' | 'red' | 'gray';

const toneClasses: Record<Tone, string> = {
  green: 'border-green-700 bg-green-900/20 text-green-300',
  yellow: 'border-yellow-700 bg-yellow-900/20 text-yellow-300',
  red: 'border-red-700 bg-red-900/20 text-red-300',
  gray: 'border-slate-700 bg-slate-900 text-slate-300',
};

export function StatusCard({
  title,
  value,
  tone,
  subtitle,
}: {
  title: string;
  value: string;
  tone: Tone;
  subtitle?: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
      {subtitle && <div className="text-sm mt-2 opacity-80">{subtitle}</div>}
    </div>
  );
}

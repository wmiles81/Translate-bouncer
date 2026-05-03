interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

export default function ModelPicker({ label, value, options, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        {!options.includes(value) && value && <option value={value}>{value}</option>}
        {options.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </label>
  );
}

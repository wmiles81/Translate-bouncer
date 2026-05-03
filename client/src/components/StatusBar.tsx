interface StatusBarProps {
  status: string;
  busy: boolean;
  canFinalize: boolean;
  onContinue: () => void;
  onDone: () => void;
}

export default function StatusBar({ status, busy, canFinalize, onContinue, onDone }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2">
      <span className="text-sm text-gray-700">{status}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={!canFinalize || busy}
          className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Done
        </button>
      </div>
    </div>
  );
}

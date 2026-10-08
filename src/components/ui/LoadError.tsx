export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="fixed inset-0 grid place-items-center bg-space px-4">
      <div className="max-w-sm text-center">
        <p className="text-slate-200">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-neon/50 px-5 py-2 text-sm text-neon hover:bg-neon/10"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}

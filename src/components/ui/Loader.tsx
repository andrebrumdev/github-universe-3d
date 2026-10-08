import { OctocatArt } from './octocat/OctocatArt'

export function Loader() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-space">
      <div className="flex flex-col items-center gap-3">
        <div className="w-32 animate-pulse">
          <OctocatArt expression="thinking" />
        </div>
        <p className="text-sm text-slate-400">Carregando dados do GitHub…</p>
      </div>
    </div>
  )
}

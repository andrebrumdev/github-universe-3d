import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { orbitPath, type Ring } from '@/lib/universe/orbits'

export function OrbitLines({ rings }: { rings: Ring[] }) {
  const paths = useMemo(() => rings.map((ring) => orbitPath(ring)), [rings])
  return (
    <>
      {paths.map((points, i) => (
        <Line key={i} points={points} color="#22d3ee" transparent opacity={0.14} lineWidth={1} />
      ))}
    </>
  )
}

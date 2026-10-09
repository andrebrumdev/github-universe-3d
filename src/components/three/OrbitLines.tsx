import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { orbitPath, type Ring } from '@/lib/universe/orbits'
import { bloomLook, useBloom } from '@/store/bloom'

export function OrbitLines({ rings }: { rings: Ring[] }) {
  const paths = useMemo(() => rings.map((ring) => orbitPath(ring)), [rings])
  const opacity = bloomLook(useBloom((s) => s.active)).orbit
  return (
    <>
      {paths.map((points, i) => (
        <Line key={i} points={points} color="#22d3ee" transparent opacity={opacity} lineWidth={1} />
      ))}
    </>
  )
}

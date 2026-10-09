import { FACE_CALM_INNER, FACE_CALM_OUTER } from '@/lib/sun/surface'

const f = (n: number) => n.toFixed(5)

/**
 * GLSL compartilhado pela superfície, pela coroa e pela proeminência: ruído de valor 3D, fbm de 3 oitavas e o peso
 * "longe do rosto" (o mesmo `faceCalmWeight` de `src/lib/sun/surface.ts`, com o rosto em +z do objeto).
 */
export const SUN_NOISE_GLSL = /* glsl */ `
uniform float uSunTime;
float sunHash( vec3 p ) {
	p = fract( p * 0.3183099 + 0.1 );
	p *= 17.0;
	return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
// ruído de valor 3D em [-1, 1]
float sunNoise( vec3 x ) {
	vec3 i = floor( x );
	vec3 u = fract( x );
	u = u * u * ( 3.0 - 2.0 * u );
	float n = mix(
		mix( mix( sunHash( i ), sunHash( i + vec3( 1.0, 0.0, 0.0 ) ), u.x ),
			mix( sunHash( i + vec3( 0.0, 1.0, 0.0 ) ), sunHash( i + vec3( 1.0, 1.0, 0.0 ) ), u.x ), u.y ),
		mix( mix( sunHash( i + vec3( 0.0, 0.0, 1.0 ) ), sunHash( i + vec3( 1.0, 0.0, 1.0 ) ), u.x ),
			mix( sunHash( i + vec3( 0.0, 1.0, 1.0 ) ), sunHash( i + vec3( 1.0, 1.0, 1.0 ) ), u.x ), u.y ),
		u.z );
	return n * 2.0 - 1.0;
}
float sunFbm( vec3 p ) {
	float sum = 0.0;
	float amp = 0.5;
	for ( int i = 0; i < 3; i ++ ) {
		sum += amp * sunNoise( p );
		p = p * 2.03 + 17.1;
		amp *= 0.5;
	}
	return sum / 0.875;
}
// 0 no rosto (+z do objeto), 1 do limbo para trás
float sunCalm( vec3 n ) {
	return smoothstep( ${f(FACE_CALM_INNER)}, ${f(FACE_CALM_OUTER)}, acos( clamp( n.z, -1.0, 1.0 ) ) );
}
`

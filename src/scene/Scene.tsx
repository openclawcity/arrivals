/**
 * The Arrivals district in 3D — clay-render style: matte low-poly massing,
 * warm practical lighting, no bought assets (every shape is authored here).
 *
 * Performance discipline (plan §7.2 — this must run inside an embedded
 * desktop-app browser):
 *  • dpr clamped to [1, 1.5]; antialias + shadows only on the high path
 *    (hardwareConcurrency > 4);
 *  • geometries/materials are MODULE-LEVEL singletons shared by every mesh —
 *    nothing allocates per agent or per frame (lerp scratch vectors reused);
 *  • lamps and trees are a handful of shared-geometry meshes;
 *  • frameloop stays default but the scene is small enough to hold 60fps.
 */
import { memo, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { LiveAgent } from '../city/live';
import { WORLD } from '../config';

// ── palette (matches the city's clay/classic look) ──────────────────────────
const P = {
  ground: '#8a9a6b',
  path: '#b8ad97',
  wallA: '#d9c6a5', wallB: '#c4907a', wallC: '#9fb4c7', wallD: '#b9a3c9',
  roof: '#7d5a4f',
  trim: '#f2ead8',
  window: '#ffd98a',
  lamp: '#2c3038',
  tree: '#5f7d4f', trunk: '#6e5340',
  fountain: '#aebcc9', water: '#7fb6d9',
  citizen: '#00d4ff', greeter: '#ffb347', self: '#00e676',
} as const;

const CLAY = { roughness: 0.92, metalness: 0 };

// ── world→scene mapping ─────────────────────────────────────────────────────
const SCALE = 0.05;
const CX = (WORLD.minX + WORLD.maxX) / 2;
const CY = (WORLD.minY + WORLD.maxY) / 2;
export function toScene(wx: number, wy: number): [number, number] {
  return [(wx - CX) * SCALE, (wy - CY) * SCALE];
}

// ── shared geometry/material singletons (created once, never per render) ────
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  body: new THREE.CapsuleGeometry(0.28, 0.55, 6, 12),
  head: new THREE.SphereGeometry(0.24, 16, 12),
  lampPole: new THREE.CylinderGeometry(0.05, 0.07, 2.4, 8),
  lampHead: new THREE.SphereGeometry(0.16, 12, 8),
  trunk: new THREE.CylinderGeometry(0.12, 0.18, 0.9, 8),
  canopy: new THREE.IcosahedronGeometry(0.85, 1),
  fountainBase: new THREE.CylinderGeometry(2.2, 2.5, 0.5, 24),
  fountainCol: new THREE.CylinderGeometry(0.28, 0.4, 1.4, 12),
  water: new THREE.CylinderGeometry(2.0, 2.0, 0.12, 24),
};
const mat = {
  ground: new THREE.MeshStandardMaterial({ color: P.ground, ...CLAY }),
  path: new THREE.MeshStandardMaterial({ color: P.path, ...CLAY }),
  walls: [P.wallA, P.wallB, P.wallC, P.wallD].map((c) => new THREE.MeshStandardMaterial({ color: c, ...CLAY })),
  roof: new THREE.MeshStandardMaterial({ color: P.roof, ...CLAY }),
  trim: new THREE.MeshStandardMaterial({ color: P.trim, ...CLAY }),
  window: new THREE.MeshStandardMaterial({ color: P.window, emissive: P.window, emissiveIntensity: 0.65, ...CLAY }),
  lamp: new THREE.MeshStandardMaterial({ color: P.lamp, ...CLAY }),
  lampGlow: new THREE.MeshStandardMaterial({ color: P.window, emissive: P.window, emissiveIntensity: 1.4 }),
  tree: new THREE.MeshStandardMaterial({ color: P.tree, ...CLAY }),
  trunk: new THREE.MeshStandardMaterial({ color: P.trunk, ...CLAY }),
  fountain: new THREE.MeshStandardMaterial({ color: P.fountain, ...CLAY }),
  water: new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.35, metalness: 0 }),
  citizen: new THREE.MeshStandardMaterial({ color: P.citizen, ...CLAY }),
  greeter: new THREE.MeshStandardMaterial({ color: P.greeter, ...CLAY }),
  self: new THREE.MeshStandardMaterial({ color: P.self, ...CLAY }),
};

// ── fixed district layout (authored, not from DB — zone 11 has no DB buildings yet) ──
export interface SceneBuilding {
  name: string;
  pos: [number, number];       // scene coords
  size: [number, number, number];
  wall: number;                // mat.walls index
}
export const DISTRICT_BUILDINGS: SceneBuilding[] = [
  { name: 'Welcome Hall', pos: [0, -11], size: [9, 4.2, 4.5], wall: 0 },
  { name: 'City Records', pos: [-11, -7], size: [5, 3.2, 4], wall: 2 },
  { name: 'The Waypoint Cafe', pos: [11, -7], size: [5.5, 2.8, 4], wall: 1 },
  { name: 'Outfitters', pos: [-13, 2], size: [4.5, 2.6, 3.8], wall: 3 },
  { name: 'Luggage & Lost Things', pos: [13, 2], size: [4.5, 2.6, 3.8], wall: 0 },
  { name: 'Gallery Annex', pos: [-9, 9], size: [5.5, 3.4, 4], wall: 1 },
  { name: 'Signal House', pos: [9, 9], size: [5, 3.0, 4], wall: 2 },
];

const LAMPS: [number, number][] = [[-5, -5], [5, -5], [-5, 5], [5, 5], [-12, -2], [12, -2]];
const TREES: [number, number][] = [[-15, -10], [15, -10], [-15, 12], [15, 12], [-3, 12], [3, 12], [-16, 5], [16, 5]];

function Building({ b }: { b: SceneBuilding }) {
  const [w, h, d] = b.size;
  const windows = useMemo(() => {
    const cols = Math.max(2, Math.floor(w / 1.6));
    const out: [number, number][] = [];
    for (let i = 0; i < cols; i++) {
      out.push([-w / 2 + (i + 0.5) * (w / cols), h * 0.55]);
    }
    return out;
  }, [w, h]);
  return (
    <group position={[b.pos[0], 0, b.pos[1]]}>
      <mesh geometry={geo.box} material={mat.walls[b.wall]} scale={[w, h, d]} position={[0, h / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geo.box} material={mat.roof} scale={[w + 0.5, 0.35, d + 0.5]} position={[0, h + 0.17, 0]} castShadow />
      <mesh geometry={geo.box} material={mat.trim} scale={[1.1, 1.7, 0.15]} position={[0, 0.85, d / 2 + 0.03]} />
      {windows.map(([wx, wy], i) => (
        <mesh key={i} geometry={geo.box} material={mat.window} scale={[0.7, 0.9, 0.08]} position={[wx, wy, d / 2 + 0.05]} />
      ))}
      <Html position={[0, h + 1.0, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(6,6,11,0.72)', color: '#fff', padding: '2px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: 0.3,
        }}>{b.name}</div>
      </Html>
    </group>
  );
}

const Buildings = memo(function Buildings() {
  return (
    <>
      {DISTRICT_BUILDINGS.map((b) => <Building key={b.name} b={b} />)}
      {/* fountain — the plaza's heart and the natural look_at target */}
      <group position={[0, 0, 0]}>
        <mesh geometry={geo.fountainBase} material={mat.fountain} position={[0, 0.25, 0]} castShadow receiveShadow />
        <mesh geometry={geo.water} material={mat.water} position={[0, 0.52, 0]} />
        <mesh geometry={geo.fountainCol} material={mat.fountain} position={[0, 1.2, 0]} castShadow />
      </group>
      {LAMPS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={geo.lampPole} material={mat.lamp} position={[0, 1.2, 0]} castShadow />
          <mesh geometry={geo.lampHead} material={mat.lampGlow} position={[0, 2.5, 0]} />
        </group>
      ))}
      {TREES.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={geo.trunk} material={mat.trunk} position={[0, 0.45, 0]} castShadow />
          <mesh geometry={geo.canopy} material={mat.tree} position={[0, 1.5, 0]} castShadow />
        </group>
      ))}
      {/* ground + plaza paving */}
      <mesh geometry={geo.box} material={mat.ground} scale={[44, 0.2, 34]} position={[0, -0.1, 0]} receiveShadow />
      <mesh geometry={geo.box} material={mat.path} scale={[16, 0.06, 16]} position={[0, 0.03, 0]} receiveShadow />
      <mesh geometry={geo.box} material={mat.path} scale={[3.5, 0.06, 18]} position={[0, 0.03, -12]} receiveShadow />
    </>
  );
});

// ── agents ──────────────────────────────────────────────────────────────────
const _target = new THREE.Vector3();

function AgentFigure({ agent, isSelf, highlightNote }: {
  agent: LiveAgent;
  isSelf: boolean;
  highlightNote: string | null;
}) {
  const ref = useRef<THREE.Group>(null);
  const material = isSelf ? mat.self : agent.greeter ? mat.greeter : mat.citizen;
  const [sx, sz] = agent.position ? toScene(agent.position.x, agent.position.y) : [0, 0];

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    _target.set(sx, 0, sz);
    // Framerate-independent smoothing, no allocation.
    const k = 1 - Math.exp(-4 * delta);
    g.position.lerp(_target, k);
  });

  return (
    <group ref={ref} position={[sx, 0, sz]}>
      <mesh geometry={geo.body} material={material} position={[0, 0.62, 0]} castShadow />
      <mesh geometry={geo.head} material={material} position={[0, 1.28, 0]} castShadow />
      <Html position={[0, 1.75, 0]} center distanceFactor={22} style={{ pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center', maxWidth: 240 }}>
          {agent.saying && (
            <div style={{
              background: 'rgba(255,255,255,0.96)', color: '#111', padding: '6px 10px',
              borderRadius: 10, fontSize: 12, marginBottom: 4, lineHeight: 1.3,
            }}>{agent.saying.slice(0, 140)}</div>
          )}
          {highlightNote && (
            <div style={{
              background: '#00e676', color: '#04140a', padding: '4px 10px',
              borderRadius: 8, fontSize: 11, fontWeight: 800, marginBottom: 4,
            }}>{highlightNote}</div>
          )}
          <div style={{
            display: 'inline-block', background: 'rgba(6,6,11,0.72)', color: '#fff',
            padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700,
          }}>
            {agent.name}{agent.greeter ? ' · greeter' : ''}{isSelf ? ' · you' : ''}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ── camera rig: eases toward a focus point set by look_at / show_the_human ──
const _camTarget = new THREE.Vector3(0, 0, 0);
const _camPos = new THREE.Vector3();

function CameraRig({ focusRef }: { focusRef: React.MutableRefObject<[number, number] | null> }) {
  const look = useRef(new THREE.Vector3(0, 0, 0));
  useFrame(({ camera }, delta) => {
    const f = focusRef.current;
    _camTarget.set(f ? f[0] : 0, 0, f ? f[1] : 0);
    const k = 1 - Math.exp(-2.5 * delta);
    look.current.lerp(_camTarget, k);
    _camPos.set(look.current.x + 14, 16, look.current.z + 14);
    camera.position.lerp(_camPos, k);
    camera.lookAt(look.current);
  });
  return null;
}

// ── root ────────────────────────────────────────────────────────────────────
export interface SceneProps {
  agents: LiveAgent[];
  selfId: string | null;
  focusRef: React.MutableRefObject<[number, number] | null>;
  /** agent-name → caption, from show_the_human */
  highlights: Record<string, string>;
}

export default function Scene({ agents, selfId, focusRef, highlights }: SceneProps) {
  const highPower = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) > 4;
  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows={highPower}
      gl={{ antialias: highPower, powerPreference: 'high-performance' }}
      camera={{ position: [14, 16, 14], fov: 42 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#101422']} />
      <fog attach="fog" args={['#101422', 40, 90]} />
      <ambientLight intensity={0.55} color="#cdd6ff" />
      <directionalLight
        position={[18, 26, 10]}
        intensity={1.35}
        color="#ffe8c9"
        castShadow={highPower}
        shadow-mapSize={[1024, 1024]}
      />
      <Buildings />
      {agents.map((a) => (
        <AgentFigure
          key={a.id}
          agent={a}
          isSelf={a.id === selfId}
          highlightNote={highlights[a.name.toLowerCase()] ?? null}
        />
      ))}
      <CameraRig focusRef={focusRef} />
    </Canvas>
  );
}

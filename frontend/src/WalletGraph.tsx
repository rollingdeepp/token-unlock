import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
  type SimulationNodeDatum,
} from "d3-force";
import gsap from "gsap";
import * as THREE from "three";
import type { WalletView, MovementView, Verdict } from "./contractService";

// Palette
const C_BASE = "#8B7BFF";
const C_WATCH = "#F5C84B";
const C_FLAG = "#FF3FA4";
const C_EXT = "#5b4d8c";

interface GNode extends SimulationNodeDatum {
  id: string; label: string; role: string; verdict: Verdict;
  suspicion: number; cascade: boolean; external: boolean; flagged: boolean;
  z: number;
}
interface GLink { source: string; target: string; kind: string; flagged: boolean; }

function nodeColor(n: GNode): string {
  if (n.external) return C_EXT;
  if (n.verdict === "FLAGGED" || n.verdict === "REVOKED") return C_FLAG;
  if (n.verdict === "WATCH" || n.cascade) return C_WATCH;
  return C_BASE;
}

function buildGraph(wallets: WalletView[], movements: MovementView[], flaggedFloor: number) {
  const byAddr = new Map<string, WalletView>();
  wallets.forEach((w) => byAddr.set(w.address.toLowerCase(), w));

  const nodes = new Map<string, GNode>();
  const ensure = (addr: string) => {
    const key = addr.toLowerCase();
    if (nodes.has(key)) return nodes.get(key)!;
    const w = byAddr.get(key);
    const n: GNode = w
      ? {
          id: key, label: w.address, role: w.role, verdict: w.verdict,
          suspicion: w.suspicionBps, cascade: w.cascadeInherited,
          external: false, flagged: w.suspicionBps >= flaggedFloor,
          z: (w.suspicionBps / 1000) * 7 - 3.5,
        }
      : {
          id: key, label: addr, role: "EXTERNAL", verdict: "" as Verdict,
          suspicion: 0, cascade: false, external: true, flagged: false, z: 0,
        };
    nodes.set(key, n);
    return n;
  };
  wallets.forEach((w) => ensure(w.address));

  const links: GLink[] = [];
  movements.forEach((m) => {
    if (!m.fromAddress || !m.toAddress) return;
    const a = ensure(m.fromAddress);
    const b = ensure(m.toAddress);
    const flagged = m.status === 3 || m.suspicionPct >= 25;
    links.push({ source: a.id, target: b.id, kind: m.violationKind, flagged });
  });

  // If there are no movements, weave a faint ring so the graph isn't empty.
  const arr = Array.from(nodes.values());
  if (links.length === 0 && arr.length > 1) {
    for (let i = 0; i < arr.length; i++) {
      links.push({ source: arr[i].id, target: arr[(i + 1) % arr.length].id, kind: "NONE", flagged: false });
    }
  }
  return { nodes: arr, links };
}

function layout(nodes: GNode[], links: GLink[]) {
  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-140))
    .force("link", forceLink<GNode, any>(links).id((d: any) => d.id).distance(5).strength(0.6))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(1.4))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
}

function Node({ n, order, pulse }: { n: GNode; order: number; pulse: boolean }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const radius = n.external ? 0.42 : 0.55 + (n.suspicion / 1000) * 0.5;
  const col = nodeColor(n);

  useEffect(() => {
    if (!mat.current || !mesh.current) return;
    if (pulse) {
      // CASCADE_FLAGGED: light up sequentially via GSAP
      gsap.fromTo(
        mat.current,
        { emissiveIntensity: 0.2 },
        { emissiveIntensity: 1.9, duration: 0.5, delay: order * 0.28, yoyo: true, repeat: 1, ease: "power2.out" }
      );
      gsap.fromTo(
        mesh.current.scale,
        { x: 1, y: 1, z: 1 },
        { x: 1.5, y: 1.5, z: 1.5, duration: 0.5, delay: order * 0.28, yoyo: true, repeat: 1, ease: "power2.out" }
      );
    }
  }, [pulse, order]);

  useFrame((state) => {
    if (!mat.current) return;
    const base = n.flagged ? 0.9 : n.cascade ? 0.6 : 0.28;
    mat.current.emissiveIntensity = base + (n.flagged ? Math.sin(state.clock.elapsedTime * 3 + order) * 0.4 : 0);
  });

  const px = n.x ?? 0, py = n.y ?? 0;
  return (
    <group position={[px, py, n.z]}>
      <mesh ref={mesh}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial ref={mat} color={col} emissive={col} emissiveIntensity={0.3} roughness={0.35} metalness={0.4} />
      </mesh>
      <Text position={[0, radius + 0.55, 0]} fontSize={0.42} color="#F4F4F8" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#1A0B2E">
        {n.external ? "EXT" : n.role}
      </Text>
    </group>
  );
}

function Edge({ a, b, flagged }: { a: GNode; b: GNode; flagged: boolean }) {
  const pts = useMemo<[number, number, number][]>(
    () => [[a.x ?? 0, a.y ?? 0, a.z], [b.x ?? 0, b.y ?? 0, b.z]],
    [a.x, a.y, a.z, b.x, b.y, b.z]
  );
  return <Line points={pts} color={flagged ? C_FLAG : "#3a2a5e"} lineWidth={flagged ? 2.4 : 1} transparent opacity={flagged ? 0.9 : 0.5} />;
}

function Scene({ nodes, links, cascadeKey }: { nodes: GNode[]; links: GLink[]; cascadeKey: number }) {
  const order = useMemo(() => {
    const flagged = nodes.filter((n) => n.flagged || n.cascade).sort((x, y) => y.suspicion - x.suspicion);
    const m = new Map<string, number>();
    flagged.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [nodes, cascadeKey]);
  const byId = useMemo(() => { const m = new Map<string, GNode>(); nodes.forEach((n) => m.set(n.id, n)); return m; }, [nodes]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[10, 10, 10]} intensity={1.2} color="#F5C84B" />
      <pointLight position={[-10, -6, -8]} intensity={0.9} color="#FF3FA4" />
      {links.map((l, i) => {
        const a = byId.get(typeof l.source === "string" ? l.source : (l.source as any).id);
        const b = byId.get(typeof l.target === "string" ? l.target : (l.target as any).id);
        if (!a || !b) return null;
        return <Edge key={i} a={a} b={b} flagged={l.flagged} />;
      })}
      {nodes.map((n) => (
        <Node key={n.id + cascadeKey} n={n} order={order.get(n.id) ?? 0} pulse={(n.flagged || n.cascade) && cascadeKey > 0} />
      ))}
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.5} minDistance={8} maxDistance={40} />
    </>
  );
}

export function WalletGraph({
  wallets, movements, flaggedFloor, cascadeKey,
}: { wallets: WalletView[]; movements: MovementView[]; flaggedFloor: number; cascadeKey: number }) {
  const { nodes, links } = useMemo(() => {
    const g = buildGraph(wallets, movements, flaggedFloor);
    layout(g.nodes, g.links);
    return g;
  }, [wallets, movements, flaggedFloor]);

  if (nodes.length === 0) {
    return <div className="graph-empty">No tracked wallets yet — register a plan and add wallets to map the cascade.</div>;
  }

  return (
    <Canvas camera={{ position: [0, 0, 22], fov: 50 }} dpr={[1, 2]} style={{ width: "100%", height: "100%" }}>
      <color attach="background" args={["#140822"]} />
      <fog attach="fog" args={["#140822", 24, 48]} />
      <Scene nodes={nodes} links={links} cascadeKey={cascadeKey} />
    </Canvas>
  );
}

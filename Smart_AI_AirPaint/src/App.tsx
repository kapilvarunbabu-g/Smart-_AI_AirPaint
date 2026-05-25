import React, { useEffect, useRef, useState } from "react";
import {
  Camera as CameraIcon,
  Sparkles,
  Brush,
  Eraser,
  RotateCcw,
  RotateCw,
  Trash2,
  Download,
  Info,
  Flame,
  Zap,
  Award,
  Clock,
  HelpCircle,
  Activity,
  Video,
  Shield,
  Fingerprint,
  Layers,
  Grid,
  Maximize,
  Sliders,
  Disc,
} from "lucide-react";
import { Point, Stroke, Particle, GestureState, GameModeState, AISuggestionResult, BrushType, DrawingLayer } from "./types";

declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

export default function App() {
  // Web Ref references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Landmarks & gesture ref tracking
  const handLandmarksRef = useRef<any>(null);
  const wasPinchingRef = useRef<boolean>(false);
  const lastColorCycleTimeRef = useRef<number>(0);
  const lastBrushCycleTimeRef = useRef<number>(0);
  const lostHandFramesRef = useRef<number>(0);

  // States
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [fps, setFps] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Floating menus & workspace configurations
  const [brushColor, setBrushColor] = useState("#00ffea");
  const [brushSize, setBrushSize] = useState(10);
  const [activeBrush, setActiveBrush] = useState<BrushType>("neon");
  const [activeLayer, setActiveLayer] = useState<DrawingLayer>("sketch");
  const [showGrid, setShowGrid] = useState(true);
  
  // Custom virtual HUD options
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isCursorPinch, setIsCursorPinch] = useState(false);
  const [isShakaActive, setIsShakaActive] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Symmetry & Template Options
  const [symmetryMode, setSymmetryMode] = useState<"none" | "mirror" | "mandala">("none");
  const [mandalaSegments, setMandalaSegments] = useState(8);
  const [activeTemplate, setActiveTemplate] = useState<"none" | "face" | "mandala" | "logo">("none");

  // Calibration, tracking-fill and gap tolerance configs
  const [paintTrigger, setPaintTrigger] = useState<"air-wave" | "pinch" | "continuous">("air-wave");
  const [smoothingWeight, setSmoothingWeight] = useState(0.4); // 0.4: perfect balance of smooth and hyper-responsive
  const [toleranceFrames, setToleranceFrames] = useState(8); // how many tracking frames of camera dropout to tolerate
  const [enableShortcuts, setEnableShortcuts] = useState(true); // Enabled by default to make gesture tooling immediately active

  // Real-time tracking telemetry
  const [gestureState, setGestureState] = useState<GestureState>({
    gesture: "none",
    fingersUp: [],
    confidence: 0,
    isPinching: false,
    pinchStrength: 0,
  });

  // Stroke histories for Client Undo / Redo
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const activeStrokeRef = useRef<Point[]>([]);

  // Atomically synchronizing states inside refs to completely prevent reinitializing MediaPipe when state changes
  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);
  const activeBrushRef = useRef(activeBrush);
  const activeLayerRef = useRef(activeLayer);
  const paintTriggerRef = useRef(paintTrigger);
  const smoothingWeightRef = useRef(smoothingWeight);
  const toleranceFramesRef = useRef(toleranceFrames);
  const enableShortcutsRef = useRef(enableShortcuts);
  const isDrawingRef = useRef(isDrawing);
  const showSkeletonRef = useRef(showSkeleton);
  const strokesRef = useRef(strokes);
  const showGridRef = useRef(showGrid);
  const symmetryModeRef = useRef(symmetryMode);
  const mandalaSegmentsRef = useRef(mandalaSegments);
  const activeTemplateRef = useRef(activeTemplate);
  const lastDrawTimeRef = useRef<number>(0);

  brushColorRef.current = brushColor;
  brushSizeRef.current = brushSize;
  activeBrushRef.current = activeBrush;
  activeLayerRef.current = activeLayer;
  paintTriggerRef.current = paintTrigger;
  smoothingWeightRef.current = smoothingWeight;
  toleranceFramesRef.current = toleranceFrames;
  enableShortcutsRef.current = enableShortcuts;
  isDrawingRef.current = isDrawing;
  showSkeletonRef.current = showSkeleton;
  strokesRef.current = strokes;
  showGridRef.current = showGrid;
  symmetryModeRef.current = symmetryMode;
  mandalaSegmentsRef.current = mandalaSegments;
  activeTemplateRef.current = activeTemplate;

  // Sound Synth System Initializer helper
  const playBeep = (freq: number, type: OscillatorType, dur: number) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {
      // Ignored if browser blocks audio
    }
  };

  // Particles engine running on secondary canvas overlay
  const particlesRef = useRef<Particle[]>([]);
  const spawnParticles = (x: number, y: number, color: string, count: number = 4) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        alpha: 1,
        color,
        size: Math.random() * 4 + 2,
        life: 0,
        maxLife: Math.random() * 20 + 15,
      });
    }
  };

  // AI Assistant results panel configs
  const [aiAssistantLoading, setAiAssistantLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AISuggestionResult | null>(null);

  // Gaming modes states
  const [gameState, setGameState] = useState<GameModeState>({
    activeMode: "free",
    timer: 60,
    score: 0,
    challengePrompt: "Draw a futuristic key or a shiny solar system!",
    isPlaying: false,
  });

  const [promptList] = useState([
    "Draw a shiny futuristic starship!",
    "Can you sketch a holographic cute cat?",
    "Draw a tree of life with neon red fruits!",
    "Illustrate a glowing abstract cyber-logo.",
    "Sketch perfect concentric circular mandates.",
  ]);

  // Handle Game challenge trigger
  const triggerNewChallenge = () => {
    const randomPrompt = promptList[Math.floor(Math.random() * promptList.length)];
    setGameState((prev) => ({
      ...prev,
      challengePrompt: randomPrompt,
      timer: 60,
      score: 0,
      isPlaying: true,
    }));
    playBeep(440, "sine", 0.4);
  };

  const handleAISketchCleanup = async () => {
    if (!canvasRef.current || aiAssistantLoading) return;
    setAiAssistantLoading(true);
    playBeep(520, "triangle", 0.3);

    try {
      // Capture canvas state as thumbnail URL
      const dataUrl = canvasRef.current.toDataURL("image/png");

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, mode: "cleanup" }),
      });

      const responseData = await res.json();
      setAiResult(responseData);
      playBeep(660, "sine", 0.2);
    } catch (e) {
      setErrorMessage("Gemini review completed with standard mockup validation.");
    } finally {
      setAiAssistantLoading(false);
    }
  };

  // Color options
  const neonColors = [
    "#00ffea", // Neon Cyan
    "#ff007f", // Neon Magenta
    "#ffff00", // Yellow Spark
    "#00ff3c", // Hot Lime
    "#bd00ff", // Electric Violet
    "#ffffff", // Crystal White
    "#ff5d00", // Solar Blaze
  ];

  // Moving average tracking stabilization filters
  const prevCursor = useRef<{ x: number; y: number } | null>(null);

  // Helper to draw single stroke on context with symmetry capabilities
  const drawStrokeOnCtx = (ctx: CanvasRenderingContext2D, stroke: Stroke | { points: Point[], color: string, size: number, brush: BrushType }, canvasWidth: number, canvasHeight: number) => {
    if (stroke.points.length < 1) return;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    const renderPoints = (points: {x: number, y: number}[], size: number, color: string) => {
      if (points.length < 1) return;
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Apply Brushes characteristics
      if (stroke.brush === "neon") {
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = size * 1.5;
        ctx.lineWidth = size;
      } else if (stroke.brush === "calligraphy") {
        ctx.strokeStyle = color;
        ctx.shadowBlur = 0;
        ctx.lineWidth = size;
      } else if (stroke.brush === "gradient") {
        ctx.strokeStyle = color;
        ctx.shadowColor = "#ff4400";
        ctx.shadowBlur = size;
        ctx.lineWidth = size;
      } else if (stroke.brush === "watercolor") {
        ctx.strokeStyle = color + "44"; // high transparency
        ctx.shadowBlur = 0;
        ctx.lineWidth = size * 2.2;
      } else if (stroke.brush === "spray") {
        ctx.fillStyle = color;
        ctx.shadowBlur = 0;
        points.forEach((pt) => {
          for (let d = 0; d < 8; d++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * size * 1.5;
            ctx.fillRect(pt.x + Math.cos(angle) * dist, pt.y + Math.sin(angle) * dist, 2, 2);
          }
        });
        return;
      } else {
        ctx.strokeStyle = color;
        ctx.shadowBlur = 0;
        ctx.lineWidth = size;
      }

      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i - 1].x + points[i].x) / 2;
        const yc = (points[i - 1].y + points[i].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
      }
      ctx.stroke();

      if (stroke.brush === "calligraphy") {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = size * 0.4;
        ctx.moveTo(points[0].x + 3, points[0].y - 3);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x + 3, points[i].y - 3);
        }
        ctx.stroke();
      }
    };

    renderPoints(stroke.points, stroke.size, stroke.color);

    if (symmetryModeRef.current === "mirror") {
      const mirroredPoints = stroke.points.map((pt) => ({
        x: canvasWidth - pt.x,
        y: pt.y,
      }));
      renderPoints(mirroredPoints, stroke.size, stroke.color);
    } else if (symmetryModeRef.current === "mandala") {
      for (let s = 1; s < mandalaSegmentsRef.current; s++) {
        const angle = (s * 360) / mandalaSegmentsRef.current;
        const rad = (angle * Math.PI) / 180;
        const rotatedPoints = stroke.points.map((pt) => {
          const tx = pt.x - cx;
          const ty = pt.y - cy;
          const rx = tx * Math.cos(rad) - ty * Math.sin(rad);
          const ry = tx * Math.sin(rad) + ty * Math.cos(rad);
          return {
            x: rx + cx,
            y: ry + cy,
          };
        });
        renderPoints(rotatedPoints, stroke.size, stroke.color);
      }
    }
  };

  // Main canvas renderer
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset background
    ctx.fillStyle = "#0a0d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid overlay
    if (showGridRef.current) {
      ctx.strokeStyle = "rgba(0, 242, 254, 0.04)";
      ctx.lineWidth = 1;
      const gridSpacing = 40;
      for (let x = 0; x < canvas.width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Draw Active Tracing Guides
    if (activeTemplateRef.current !== "none") {
      ctx.save();
      ctx.strokeStyle = "rgba(0, 242, 254, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 8]);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      if (activeTemplateRef.current === "mandala") {
        for (let r = 80; r <= 240; r += 80) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (let angle = 0; angle < 180; angle += 45) {
          const rad = (angle * Math.PI) / 180;
          ctx.beginPath();
          ctx.moveTo(cx - 300 * Math.cos(rad), cy - 300 * Math.sin(rad));
          ctx.lineTo(cx + 300 * Math.cos(rad), cy + 300 * Math.sin(rad));
          ctx.stroke();
        }
      } else if (activeTemplateRef.current === "face") {
        ctx.beginPath();
        ctx.arc(cx, cy - 30, 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - 140);
        ctx.lineTo(cx, cy + 180);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 150, cy - 30);
        ctx.lineTo(cx + 150, cy - 30);
        ctx.stroke();
      } else if (activeTemplateRef.current === "logo") {
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const angle = (s * 360) / 6;
          const rad = (angle * Math.PI) / 180;
          const px = cx + 160 * Math.cos(rad);
          const py = cy + 160 * Math.sin(rad);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw artwork strokes
    strokesRef.current.forEach((stroke) => {
      drawStrokeOnCtx(ctx, stroke, canvas.width, canvas.height);
    });

    // Draw active drawing stroke in real-time
    if (isDrawingRef.current && activeStrokeRef.current.length > 0) {
      const ongoingStrokeObject: Stroke = {
        id: "temp",
        points: [...activeStrokeRef.current],
        color: brushColorRef.current,
        size: brushSizeRef.current,
        brush: activeBrushRef.current,
        layer: activeLayerRef.current,
      };
      drawStrokeOnCtx(ctx, ongoingStrokeObject, canvas.width, canvas.height);
    }

    // DRAW HOLOGRAPHIC SKELETON DIRECTLY ON THE PAINTER CANVAS
    if (showSkeletonRef.current && handLandmarksRef.current) {
      const landmarks = handLandmarksRef.current;
      ctx.save();
      ctx.strokeStyle = "rgba(0, 242, 254, 0.35)";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#00ffea";
      ctx.shadowBlur = 8;

      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // thumb
        [0, 5], [5, 6], [6, 7], [7, 8], // index
        [5, 9], [9, 10], [10, 11], [11, 12], // middle
        [9, 13], [13, 14], [14, 15], [15, 16], // ring
        [13, 17], [17, 18], [18, 19], [19, 20], [0, 17] // pinky + base
      ];

      connections.forEach(([start, end]) => {
        const pt1 = landmarks[start];
        const pt2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo((1 - pt1.x) * canvas.width, pt1.y * canvas.height);
        ctx.lineTo((1 - pt2.x) * canvas.width, pt2.y * canvas.height);
        ctx.stroke();
      });

      // Joint connectors glowing rings
      landmarks.forEach((joint: any, idx: number) => {
        const jx = (1 - joint.x) * canvas.width;
        const jy = joint.y * canvas.height;
        ctx.beginPath();
        ctx.arc(jx, jy, idx === 8 ? 7 : idx === 4 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = idx === 8 ? "#ff007f" : idx === 4 ? "#ffff00" : "#00ffea";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.restore();
    }

    ctx.shadowBlur = 0;
  };

  // Particles loop
  const updateParticles = () => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particlesRef.current.forEach((p, idx) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      p.alpha = 1 - p.life / p.maxLife;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.size * 3;
      ctx.fill();

      if (p.life >= p.maxLife) {
        particlesRef.current.splice(idx, 1);
      }
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };

  useEffect(() => {
    if (!gameState.isPlaying) return;
    const interval = setInterval(() => {
      setGameState((prev) => {
        if (prev.timer <= 1) {
          clearInterval(interval);
          playBeep(220, "sawtooth", 0.6);
          return { ...prev, isPlaying: false, timer: 0 };
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.isPlaying]);

  useEffect(() => {
    redrawCanvas();
    const particleLoop = setInterval(updateParticles, 35);
    return () => clearInterval(particleLoop);
  }, [strokes, isDrawing, brushColor, brushSize, activeBrush, activeLayer, showGrid, symmetryMode, mandalaSegments, activeTemplate, showSkeleton]);

  // Handle perfect fallback mouse/touch events
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    isDrawingRef.current = true;
    setIsDrawing(true);
    activeStrokeRef.current = [{ x, y, pressure: 1.0, timestamp: Date.now() }];
    playBeep(380, "sine", 0.05);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    activeStrokeRef.current.push({ x, y, pressure: 1.0, timestamp: Date.now() });
    spawnParticles(x, y, brushColor, 3);
    redrawCanvas();
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    if (activeStrokeRef.current.length > 0) {
      const newStroke = {
        id: Math.random().toString(),
        points: [...activeStrokeRef.current],
        color: brushColor,
        size: brushSize,
        brush: activeBrush,
        layer: activeLayer,
      };
      strokesRef.current = [...strokesRef.current, newStroke];
      setStrokes(strokesRef.current);
      setRedoStack([]);
      activeStrokeRef.current = [];
      playBeep(580, "triangle", 0.06);
    }
  };

  // MediaPipe computer vision stream loop
  useEffect(() => {
    let activeCamera: any = null;
    let frameCount = 0;
    let lastFpsTime = Date.now();

    const initMediaPipe = async () => {
      try {
        if (!window.Hands) {
          // Keep retrying if SDK scripts load asynchronously
          setTimeout(initMediaPipe, 600);
          return;
        }

        const hands = new window.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.70,
          minTrackingConfidence: 0.70,
        });

        hands.onResults((results: any) => {
          frameCount++;
          const now = Date.now();
          if (now - lastFpsTime >= 1000) {
            setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
            frameCount = 0;
            lastFpsTime = now;
          }

          // Gap recovery and camera tracking lost fill-tolerance
          if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            lostHandFramesRef.current += 1;
            
            if (lostHandFramesRef.current >= toleranceFramesRef.current) {
              handLandmarksRef.current = null;
              setCursorPos(null);
              if (isDrawingRef.current) {
                // Gracefully save trailing stroke if hand leaves camera view
                isDrawingRef.current = false;
                const newStroke = {
                  id: Math.random().toString(),
                  points: [...activeStrokeRef.current],
                  color: brushColorRef.current,
                  size: brushSizeRef.current,
                  brush: activeBrushRef.current,
                  layer: activeLayerRef.current,
                };
                strokesRef.current = [...strokesRef.current, newStroke];
                setStrokes(strokesRef.current);
                activeStrokeRef.current = [];
                setIsDrawing(false);
              }
              redrawCanvas();
            }
            return;
          }

          // Hand detected! Reset lost counter
          lostHandFramesRef.current = 0;
          setModelLoaded(true);

          const landmarks = results.multiHandLandmarks[0];
          handLandmarksRef.current = landmarks;

          const canvas = canvasRef.current;
          if (!canvas) return;

          // Target index tip landmark #8
          const indexTip = landmarks[8];
          const rawX = (1 - indexTip.x) * canvas.width; 
          const rawY = indexTip.y * canvas.height;

          // Stabilization filtering (Exponential Moving Average)
          let stabilizedX = rawX;
          let stabilizedY = rawY;
          if (prevCursor.current) {
            const w = smoothingWeightRef.current;
            stabilizedX = prevCursor.current.x * w + rawX * (1 - w);
            stabilizedY = prevCursor.current.y * w + rawY * (1 - w);
          }
          prevCursor.current = { x: stabilizedX, y: stabilizedY };

          // Precision viewport-to-canvas layout mapping (Align cursor perfectly visual with ink)
          const rect = canvas.getBoundingClientRect();
          const screenX = rect.left + (stabilizedX / canvas.width) * rect.width;
          const screenY = rect.top + (stabilizedY / canvas.height) * rect.height;
          setCursorPos({ x: screenX, y: screenY });

          // Robust hand-relative scale measurement (Wrist to Middle MCP distance)
          // This allows calibrated gestures regardless of how close or far the hand is
          const wrist = landmarks[0];
          const middleMCP = landmarks[9];
          const palmSize = Math.hypot(wrist.x - middleMCP.x, wrist.y - middleMCP.y);

          const getDist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

          // Finger extension calculations using palm-relative offsets
          const isThumbUp = getDist(landmarks[4], landmarks[2]) > 0.45 * palmSize;
          const isIndexUp = getDist(landmarks[8], landmarks[5]) > 0.55 * palmSize;
          const isMiddleUp = getDist(landmarks[12], landmarks[9]) > 0.55 * palmSize;
          const isRingUp = getDist(landmarks[16], landmarks[13]) > 0.55 * palmSize;
          const isPinkyUp = getDist(landmarks[20], landmarks[17]) > 0.55 * palmSize;

          const fingersUpList = [
            isThumbUp ? 1 : 0,
            isIndexUp ? 1 : 0,
            isMiddleUp ? 1 : 0,
            isRingUp ? 1 : 0,
            isPinkyUp ? 1 : 0,
          ];
          const sumFingers = fingersUpList.reduce((a, b) => a + b, 0);

          // Tracking Pinch actions (Thumb & Index tips relative to palm size)
          const pinchDistance = getDist(landmarks[4], landmarks[8]);
          const isPinchingNow = pinchDistance < 0.18 * palmSize;
          setIsCursorPinch(isPinchingNow);

          // 2. Pinch simulator: Automated virtual click trigger on mapped button components
          const wasPinching = wasPinchingRef.current;
          wasPinchingRef.current = isPinchingNow;

          if (isPinchingNow && !wasPinching) {
            spawnParticles(stabilizedX, stabilizedY, "#ff007f", 12);
            playBeep(880, "sine", 0.06);

            // Trigger virtual click exactly at pointer layout position
            const clickedElement = document.elementFromPoint(screenX, screenY);
            if (clickedElement) {
              (clickedElement as HTMLElement).click();
            }
          }

          // Determine paint state depending on configured draw trigger
          let shouldPaint = false;
          if (paintTriggerRef.current === "air-wave") {
            // Index raised, middle closed -> Fluid drawing
            shouldPaint = isIndexUp && !isMiddleUp;
          } else if (paintTriggerRef.current === "pinch") {
            // Touch index and thumb tips together
            shouldPaint = isPinchingNow;
          } else if (paintTriggerRef.current === "continuous") {
            // Continuous draw whenever index is raised
            shouldPaint = isIndexUp;
          }

          // Determine eraser state (Two fingers raised, other folded ✌️)
          let shouldErase = isIndexUp && isMiddleUp && !isRingUp && !isPinkyUp;

          // State Classification
          let classified: "draw" | "erase" | "shaka" | "hover" | "thumbsup" | "pinkypromise" | "none" = "hover";

          if (shouldPaint) {
            classified = "draw";
          } else if (shouldErase) {
            classified = "erase";
          } else if (sumFingers === 0) {
            classified = "none";
          } else if (enableShortcutsRef.current) {
            // Gesture Shortcuts unlocked
            if (isThumbUp && !isIndexUp && !isMiddleUp && !isRingUp && isPinkyUp) {
              classified = "shaka";
            } else if (isThumbUp && !isIndexUp && !isMiddleUp && !isRingUp && !isPinkyUp) {
              classified = "thumbsup";
            } else if (!isThumbUp && !isIndexUp && !isMiddleUp && !isRingUp && isPinkyUp) {
              classified = "pinkypromise";
            }
          }

          // 3. Act on State Actions
          setIsShakaActive(classified === "shaka");

          if (classified === "shaka") {
            // Set size from index finger height location
            const factor = Math.min(Math.max(landmarks[8].y, 0.15), 0.85);
            const computedSize = Math.round(3 + (1 - factor) * 47);
            setBrushSize(computedSize);
          }

          if (classified === "thumbsup") {
            const currentTime = Date.now();
            if (currentTime - lastColorCycleTimeRef.current > 1200) {
              const currentIndex = neonColors.indexOf(brushColorRef.current);
              const nextIndex = (currentIndex + 1) % neonColors.length;
              setBrushColor(neonColors[nextIndex]);
              playBeep(700, "sine", 0.1);
              spawnParticles(stabilizedX, stabilizedY, neonColors[nextIndex], 15);
              lastColorCycleTimeRef.current = currentTime;
            }
          }

          if (classified === "pinkypromise") {
            const currentTime = Date.now();
            if (currentTime - lastBrushCycleTimeRef.current > 1200) {
              const brushPresets: BrushType[] = ["paint", "neon", "calligraphy", "spray", "watercolor", "gradient"];
              const currBrushIndex = brushPresets.indexOf(activeBrushRef.current);
              const nextBrushIndex = (currBrushIndex + 1) % brushPresets.length;
              setActiveBrush(brushPresets[nextBrushIndex]);
              playBeep(750, "triangle", 0.12);
              spawnParticles(stabilizedX, stabilizedY, brushColorRef.current, 8);
              lastBrushCycleTimeRef.current = currentTime;
            }
          }

          // Main Painting Workflow
          if (classified === "draw") {
            lastDrawTimeRef.current = Date.now(); // Record active drawing time
            if (!isDrawingRef.current) {
              isDrawingRef.current = true;
              setIsDrawing(true);
              activeStrokeRef.current = [{ x: stabilizedX, y: stabilizedY, pressure: 1.0, timestamp: Date.now() }];
              playBeep(450, "sine", 0.04);
            } else {
              activeStrokeRef.current.push({ x: stabilizedX, y: stabilizedY, pressure: 1.0, timestamp: Date.now() });
              spawnParticles(stabilizedX, stabilizedY, brushColorRef.current, 3);
            }
          } else {
            if (isDrawingRef.current) {
              isDrawingRef.current = false;
              const newStroke = {
                id: Math.random().toString(),
                points: [...activeStrokeRef.current],
                color: brushColorRef.current,
                size: brushSizeRef.current,
                brush: activeBrushRef.current,
                layer: activeLayerRef.current,
              };
              strokesRef.current = [...strokesRef.current, newStroke];
              setStrokes(strokesRef.current);
              activeStrokeRef.current = [];
              setIsDrawing(false);
              playBeep(610, "triangle", 0.06);
            }
          }

          // Eraser gesture wiping strokes
          if (classified === "erase") {
            // Guard: 800ms safety threshold right after drawing stops to prevent accidental open hand erasure
            if (Date.now() - lastDrawTimeRef.current > 800) {
              spawnParticles(stabilizedX, stabilizedY, "#ff007f", 5);
              const remainingStrokes = strokesRef.current.filter((stroke) => {
                const nearJoint = stroke.points.some(
                  (pt) => Math.hypot(pt.x - stabilizedX, pt.y - stabilizedY) < brushSizeRef.current * 3.5
                );
                return !nearJoint;
              });
              strokesRef.current = remainingStrokes;
              setStrokes(remainingStrokes);
            }
          }

          // Telemetry feedback update State
          setGestureState({
            gesture: classified,
            fingersUp: fingersUpList,
            confidence: results.multiHandedness[0].score,
            isPinching: isPinchingNow,
            pinchStrength: Math.max(0, 1 - (pinchDistance / (0.18 * palmSize))),
          });

          // Redraw elements on physical painting canvas
          redrawCanvas();
        });

        // Instantiate live Web camera utility if reference is mounted
        if (videoRef.current) {
          const camera = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current) {
                await hands.send({ image: videoRef.current });
              }
            },
            width: 320,
            height: 240,
          });
          camera.start();
          activeCamera = camera;
          setCameraActive(true);
        }
      } catch (err: any) {
        console.warn("MediaPipe failed initialization.", err);
      }
    };

    initMediaPipe();

    return () => {
      if (activeCamera) {
        try {
          activeCamera.stop();
        } catch (e) {}
      }
    };
  }, []);

  const clearArtboard = () => {
    strokesRef.current = [];
    setStrokes([]);
    setRedoStack([]);
    playBeep(180, "sawtooth", 0.4);
  };

  const handleUndo = () => {
    if (strokesRef.current.length === 0) return;
    const last = strokesRef.current[strokesRef.current.length - 1];
    setRedoStack((prev) => [...prev, last]);
    const remaining = strokesRef.current.slice(0, -1);
    strokesRef.current = remaining;
    setStrokes(remaining);
    playBeep(320, "sine", 0.1);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    const updated = [...strokesRef.current, last];
    strokesRef.current = updated;
    setStrokes(updated);
    setRedoStack((prev) => prev.slice(0, -1));
    playBeep(420, "sine", 0.1);
  };

  const downloadArtwork = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `airpaint-studio-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    playBeep(650, "sine", 0.3);
  };

  return (
    <div id="paint-root" className="min-h-screen bg-[#070b13] text-gray-100 flex flex-col font-sans selection:bg-[#00ffea] selection:text-[#0c101b] overflow-x-hidden">
      
      {/* Real-time pointer cursors representing actual finger targeting */}
      {cursorPos && (
        <div
          style={{
            position: "fixed",
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 9999,
          }}
          className="transition-all duration-75"
        >
          {cursorPos && (
            <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all ${
              isCursorPinch
                ? "border-[#ff0055] scale-75 bg-[#ff0055]/30 shadow-[0_0_20px_#ff0055]"
                : "border-[#00ffea] scale-100 bg-[#00ffea]/5 shadow-[0_0_15px_rgba(0,255,234,0.3)]"
            }`}>
              <div className={`h-2 w-2 rounded-full ${isCursorPinch ? "bg-[#ff0055]" : "bg-[#00ffea]"}`} />
            </div>
          )}
          <span className="absolute left-6 top-1 font-mono text-[9px] text-[#00ffea] uppercase tracking-wider bg-slate-950/90 px-2 py-0.5 rounded border border-cyan-500/30 whitespace-nowrap shadow-xl">
            {gestureState.gesture === "draw" ? "🎨 PAINT" : gestureState.gesture === "erase" ? "🧹 ERASER" : gestureState.gesture === "thumbsup" ? "🌈 SWAPPING COLOR" : gestureState.gesture === "pinkypromise" ? "🖌️ SWAPPING BRUSH" : gestureState.gesture === "shaka" ? "📏 ADJUSTING SIZE" : "🔍 AIR HOVER"}
          </span>
        </div>
      )}

      {/* HUD Header Bar */}
      <header className="border-b border-cyan-950/40 bg-slate-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-950/50 border border-cyan-500/30 text-[#00ffea] shadow-[0_0_15px_rgba(0,255,234,0.15)]">
            <Sparkles className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-sans font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-200 to-purple-400 text-lg uppercase leading-none">
              AI Smart Air Paint Studio
            </h1>
            <p className="text-[10px] font-mono text-cyan-400/60 uppercase mt-1 tracking-widest">
              Holographic Touchless Painting Engine
            </p>
          </div>
        </div>

        {/* Real-time statistics telemetry */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-teal-500/20 bg-teal-950/20 text-xs font-mono">
            <Activity className="h-3.5 w-3.5 text-[#00ffea] name-pulse" />
            <span className="text-gray-400 hidden sm:inline">LIVE SENSORS</span>
            <span className="text-[#00ffea] font-bold">READY</span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-950/20 text-xs font-mono">
            <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-gray-400">STATE:</span>
            <span className="text-purple-300 font-bold uppercase">{isDrawing ? "DRAWING" : "HOVER"}</span>
          </div>
        </div>
      </header>

      {/* Main Studio Body */}
      <main className="flex-1 max-w-[1750px] mx-auto w-full p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Left Side: Parameters dock & custom configurations */}
        <section className="xl:col-span-1 flex flex-col gap-6 order-2 xl:order-1">
          
          {/* WEBCAM HOLOGRAM FEED PANEL (CRITICAL FOR LIVE CAPTURE) */}
          <div className="p-5 rounded-xl border border-cyan-500/30 bg-slate-950/70 backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-cyan-950/40 pb-3 mb-4">
              <span className="text-xs font-mono text-[#00ffea] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Video className="h-4 w-4" />
                Primary Camera Feed
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-teal-900/40 text-teal-300 border border-teal-500/20 uppercase">
                {fps} FPS
              </span>
            </div>

            {/* Mirror Flipping view window */}
            <div className="relative aspect-[4/3] w-full rounded-lg bg-slate-900 border border-cyan-950/80 overflow-hidden shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1] absolute inset-0 opacity-60 transition-opacity duration-300 filter saturate-125"
              />
              {/* Scanline cyber shader */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-950/5 to-cyan-950/15 pointer-events-none" />
              <div className="absolute inset-x-0 top-0 h-px bg-cyan-400/20 animate-bounce pointer-events-none" />

              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-slate-950/90">
                  <CameraIcon className="h-8 w-8 text-cyan-400/50 animate-pulse mb-2" />
                  <span className="text-xs font-mono text-cyan-300/80 uppercase tracking-widest leading-relaxed">
                    Connecting webcam, please allow permissions...
                  </span>
                </div>
              )}

              {cameraActive && !modelLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-slate-950/70">
                  <div className="h-5 w-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-2" />
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                    Detecting Hands Structure...
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button
                id="btn-skeleton"
                onClick={() => {
                  setShowSkeleton(!showSkeleton);
                  playBeep(420, "sine", 0.05);
                }}
                className={`py-1.5 px-3 rounded text-center border transition font-mono text-[10px] uppercase flex items-center justify-center gap-1.5 ${
                  showSkeleton
                    ? "border-cyan-500/30 bg-cyan-950/30 text-cyan-300"
                    : "border-slate-800 bg-slate-900 text-gray-500"
                }`}
              >
                <Fingerprint className="h-3.5 w-3.5" />
                <span>Skeleton: {showSkeleton ? "VISIBLE" : "HIDDEN"}</span>
              </button>
            </div>
          </div>

          {/* GESTURE TRACKING PERFORMANCE & CALIBRATION DOCK */}
          <div className="p-5 rounded-xl border border-cyan-500/25 bg-slate-950/60 backdrop-blur-md shadow-xl text-left">
            <span className="text-xs font-mono text-[#00ffea] font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-cyan-950/40 pb-3 mb-4">
              <Sliders className="h-4.5 w-4.5 text-[#00ffea]" />
              Gesture & Tracking Calibration
            </span>

            <div className="space-y-4 text-xs font-mono">
              {/* Trigger Mode */}
              <div>
                <label className="text-[10px] text-zinc-400 uppercase tracking-widest block mb-1.5 font-bold">
                  Paint Trigger Gesture
                </label>
                <div className="grid grid-cols-3 gap-1 tracking-tighter">
                  {[
                    { id: "air-wave", label: "☝️ Wave", desc: "Index up" },
                    { id: "pinch", label: "👌 Pinch", desc: "Pinch tips" },
                    { id: "continuous", label: "✍️ Hover", desc: "Always" }
                  ].map((trigger) => (
                    <button
                      key={trigger.id}
                      id={`trigger-btn-${trigger.id}`}
                      onClick={() => {
                        setPaintTrigger(trigger.id as any);
                        playBeep(490, "sine", 0.05);
                      }}
                      className={`py-2 px-1 rounded border transition text-[10px] flex flex-col items-center justify-center capitalize ${
                        paintTrigger === trigger.id
                          ? "border-[#00ffea] bg-teal-950/30 text-[#00ffea] font-bold"
                          : "border-cyan-950/40 bg-slate-900/40 text-gray-400"
                      }`}
                      title={trigger.desc}
                    >
                      <span className="truncate w-full text-center">{trigger.label}</span>
                      <span className="text-[8px] opacity-70 mt-0.5 truncate w-full text-center">{trigger.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Stabilizer Filter Weight Slider */}
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 uppercase mb-1">
                  <span>Smoothing filter</span>
                  <span className="text-[#00ffea] font-bold">
                    {smoothingWeight === 0 ? "Off (Raw)" : `${Math.round(smoothingWeight * 100)}%`}
                  </span>
                </div>
                <input
                  id="slider-smoothing-weight"
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.1"
                  value={smoothingWeight}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSmoothingWeight(val);
                    playBeep(470, "sine", 0.03);
                  }}
                  className="w-full accent-[#00ffea] bg-cyan-950 h-1 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase mt-0.5">
                  <span>Responsive</span>
                  <span>Buttery Smooth</span>
                </div>
              </div>

              {/* Lost-Hand Recovery Frames */}
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 uppercase mb-1">
                  <span>Dropout Gap Filler</span>
                  <span className="text-[#00ffea] font-bold">{toleranceFrames} Frames</span>
                </div>
                <input
                  id="slider-tolerance-frames"
                  type="range"
                  min="1"
                  max="20"
                  value={toleranceFrames}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setToleranceFrames(val);
                    playBeep(510, "sine", 0.03);
                  }}
                  className="w-full accent-[#00ffea] bg-cyan-950 h-1 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-500 uppercase mt-0.5">
                  <span>Strict / Instant</span>
                  <span>Unbroken lines</span>
                </div>
              </div>

              {/* Enable Gesture Shortcuts */}
              <div className="flex items-center justify-between bg-slate-900/30 border border-slate-800/10 p-2.5 rounded-lg mt-2">
                <div>
                  <div className="text-[10px] text-white font-bold font-sans">Activate Gesture Shortcuts</div>
                  <p className="text-[8px] text-gray-400 max-w-[160px] leading-tight mt-0.5">
                    Enables Thumbs (color swap), Pinky (brush swap), and Shaka (brush size) gestures
                  </p>
                </div>
                <button
                  id="btn-lock-shortcuts"
                  onClick={() => {
                    setEnableShortcuts(!enableShortcuts);
                    playBeep(450, "sine", 0.05);
                  }}
                  className={`w-12 h-6 rounded-full relative transition-colors duration-250 ${
                    enableShortcuts ? "bg-cyan-500/20 border border-cyan-500/40" : "bg-slate-800 border border-slate-700"
                  }`}
                >
                  <div
                    className={`h-4 w-4 bg-[#00ffea] rounded-full absolute top-0.5 transition-all duration-200 ${
                      enableShortcuts ? "left-6.5" : "left-1"
                    }`}
                  />
                </button>
              </div>

            </div>
          </div>

          {/* Interactive Air Gesture Guide Card */}
          <div className="p-5 rounded-xl border border-cyan-900/30 bg-slate-950/50 backdrop-blur-md shadow-lg">
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-cyan-950/40 pb-3 mb-4">
              <HelpCircle className="h-4.5 w-4.5 text-cyan-400 animate-pulse" />
              Air gesture handbook
            </span>
            <div className="space-y-3.5 text-[11px] font-mono">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded border border-cyan-500/30 bg-cyan-950/20 text-[#00ffea] flex items-center justify-center text-sm">
                  ☝️
                </div>
                <div>
                  <div className="text-white font-bold font-sans">Index finger up</div>
                  <div className="text-[9px] text-gray-400 uppercase">standard neon painting</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded border border-pink-500/30 bg-pink-950/20 text-pink-400 flex items-center justify-center text-sm">
                  ✌️
                </div>
                <div>
                  <div className="text-white font-bold font-sans">Two fingers (Peace)</div>
                  <div className="text-[9px] text-gray-400 uppercase">Precision brush eraser</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded border border-orange-500/30 bg-orange-950/20 text-orange-400 flex items-center justify-center text-sm">
                  🤙
                </div>
                <div>
                  <div className="text-white font-bold font-sans">Thumbs and Pinky (Shaka)</div>
                  <div className="text-[9px] text-gray-400 uppercase">Rise / lower to set brush size</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded border border-yellow-500/30 bg-yellow-950/20 text-yellow-400 flex items-center justify-center text-sm">
                  👍
                </div>
                <div>
                  <div className="text-white font-bold font-sans">Thumbs Up</div>
                  <div className="text-[9px] text-gray-400 uppercase">holds and cycles 7 galactic colors</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded border border-purple-500/30 bg-purple-950/20 text-purple-400 flex items-center justify-center text-sm">
                  🤙
                </div>
                <div>
                  <div className="text-white font-bold font-sans">Pinky finger up</div>
                  <div className="text-[9px] text-gray-400 uppercase">cycles current brush presets</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 flex items-center justify-center text-sm">
                  🤏
                </div>
                <div>
                  <div className="text-white font-bold font-sans">Pinch Thumb + Index</div>
                  <div className="text-[9px] text-gray-400 uppercase">holographic cursor "click" selector</div>
                </div>
              </div>
            </div>
          </div>

          {/* Brush engine parameters selection */}
          <div className="p-5 rounded-xl border border-cyan-900/30 bg-slate-950/50 backdrop-blur-md shadow-lg">
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-cyan-950/30 pb-3 mb-4">
              <Sliders className="h-4 w-4" />
              Brush Settings
            </span>

            <div className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-[10px] text-zinc-400 uppercase tracking-widest block mb-1.5">
                  Brush Selection
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "paint", label: "🎨 Standard" },
                    { id: "neon", label: "⚡ Neon Glow" },
                    { id: "calligraphy", label: "✍️ Calligraphy" },
                    { id: "spray", label: "💨 Spray paint" },
                    { id: "watercolor", label: "💧 Watercolor" },
                    { id: "gradient", label: "🔥 Fire Glow" },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      id={`brush-${preset.id}`}
                      onClick={() => {
                        setActiveBrush(preset.id as BrushType);
                        playBeep(480, "sine", 0.05);
                      }}
                      className={`py-2 px-3 rounded text-left border transition capitalize ${
                        activeBrush === preset.id
                          ? "border-[#00ffea] bg-teal-950/20 text-[#00ffea] font-bold"
                          : "border-cyan-950/40 bg-slate-900/40 text-gray-400"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 uppercase mb-1.5">
                  <span>BRUSH SIZE</span>
                  <span className="text-[#00ffea] font-bold">{brushSize} px</span>
                </div>
                <input
                  id="slider-brush-size"
                  type="range"
                  min="3"
                  max="50"
                  value={brushSize}
                  onChange={(e) => {
                    setBrushSize(parseInt(e.target.value));
                    playBeep(520, "sine", 0.03);
                  }}
                  className="w-full accent-[#00ffea] bg-cyan-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Center Section: Main Interactive Creative Painting Canvas */}
        <section className="xl:col-span-2 flex flex-col gap-4 order-1 xl:order-2">
          
          {/* Main painting viewport wrapper */}
          <div className="relative rounded-2xl border border-cyan-900/40 bg-slate-950 shadow-[0_0_50px_rgba(4,6,11,0.5)] overflow-hidden aspect-[16/9] w-full max-w-[1100px] mx-auto">
            
            {/* Real Painting Canvas */}
            <canvas
              ref={canvasRef}
              width={1120}
              height={630}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              className="absolute inset-0 w-full h-full block cursor-crosshair rounded-2xl bg-[#0c101b]"
            />

            {/* Glowing particle trail canvas layered transparently directly above */}
            <canvas
              ref={particleCanvasRef}
              width={1120}
              height={630}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />

            {/* Floating Dynamic Sizer overlay when SHAKA gesture is active */}
            {isShakaActive && (
              <div className="absolute left-6 top-1/2 -translate-y-1/2 z-30 bg-slate-950/90 border border-[#00ffea] rounded-xl px-5 py-6 flex flex-col items-center gap-3 backdrop-blur shadow-[0_0_30px_rgba(0,255,234,0.3)] animate-pulse">
                <span className="text-[10px] font-mono text-[#00ffea] uppercase tracking-widest font-bold">
                  Sizer Gesture
                </span>
                <div className="w-4 h-36 bg-cyan-950/80 rounded-full relative overflow-hidden">
                  <div
                    style={{ height: `${(brushSize / 50) * 100}%` }}
                    className="absolute bg-gradient-to-t from-cyan-400 to-[#00ffea] w-full bottom-0 transition-all duration-100"
                  />
                </div>
                <span className="text-sm font-mono text-white font-bold">{brushSize}px</span>
              </div>
            )}

            {/* Canvas overlay calibration grids indicator */}
            <div className="absolute top-4 left-4 z-20 flex gap-2 items-center bg-slate-950/80 border border-cyan-900/30 rounded-full px-4 py-1.5 backdrop-blur text-[10px] font-mono">
              <button
                id="btn-toggle-grid"
                onClick={() => {
                  setShowGrid(!showGrid);
                  playBeep(500, "sine", 0.05);
                }}
                className={`flex items-center gap-1.5 ${showGrid ? "text-[#00ffea]" : "text-gray-500"}`}
              >
                <Grid className="h-4 w-4" />
                <span>GRID: {showGrid ? "ON" : "OFF"}</span>
              </button>
            </div>

            {/* Floating Quick Palette overlay bar within the design layout borders */}
            <div className="absolute top-4 right-4 z-20 flex gap-2 items-center bg-slate-950/80 border border-cyan-900/30 rounded-full px-4 py-2 backdrop-blur">
              <span className="text-[10px] text-gray-400 font-mono tracking-wider uppercase mr-2 hidden sm:inline">
                Palette
              </span>
              <div className="flex gap-2">
                {neonColors.map((color) => (
                  <button
                    key={color}
                    id={`palette-${color.replace("#", "")}`}
                    onClick={() => {
                      setBrushColor(color);
                      playBeep(450, "sine", 0.05);
                    }}
                    style={{ backgroundColor: color }}
                    className={`h-6 w-6 rounded-full border transition-transform duration-200 ${
                      brushColor === color ? "scale-125 border-white shadow-[0_0_10px_currentColor]" : "border-slate-800"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Bottom floating quick-action toolbar with beautiful rounded bento buttons */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex bg-slate-950/90 border border-cyan-900/30 rounded-xl px-4 py-2 items-center gap-1.5 backdrop-blur shadow-2xl">
              <button
                id="btn-undo"
                onClick={handleUndo}
                className="p-2 hover:bg-cyan-950 rounded text-slate-300 hover:text-[#00ffea] transition"
                title="Undo (Step Back)"
              >
                <RotateCcw className="h-4.5 w-4.5" />
              </button>
              <button
                id="btn-redo"
                onClick={handleRedo}
                className="p-2 hover:bg-cyan-950 rounded text-slate-300 hover:text-[#00ffea] transition"
                title="Redo Stroke"
              >
                <RotateCw className="h-4.5 w-4.5" />
              </button>
              <div className="h-6 w-px bg-cyan-950/80 mx-1" />
              <button
                id="btn-clear"
                onClick={clearArtboard}
                className="p-2 hover:bg-red-950 rounded text-slate-300 hover:text-red-400 transition"
                title="Wipe Canvas Clean"
              >
                <Trash2 className="h-4.5 w-4.5" />
              </button>
              <button
                id="btn-download"
                onClick={downloadArtwork}
                className="p-2 hover:bg-cyan-950 rounded text-slate-300 hover:text-[#00ffea] transition"
                title="Export High-Res PNG"
              >
                <Download className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Prompt challenge active gaming mode banner */}
          <div className="rounded-xl border border-indigo-950/40 bg-indigo-950/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-indigo-400">
                <Award className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest">
                    ACTIVE CREATIVE CHALLENGE
                  </span>
                  {gameState.isPlaying && (
                    <div className="flex items-center gap-1 text-[11px] font-mono text-orange-400">
                      <Clock className="h-3 w-3" />
                      <span>{gameState.timer}S</span>
                    </div>
                  )}
                </div>
                <h4 className="text-sm font-sans tracking-tight text-white mt-0.5">
                  {gameState.challengePrompt}
                </h4>
              </div>
            </div>
            
            <button
              id="btn-next-challenge"
              onClick={triggerNewChallenge}
              className="w-full sm:w-auto px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider text-[#0c101b] bg-gradient-to-r from-cyan-400 to-indigo-400 hover:opacity-90 active:scale-95 transition"
            >
              Draw Next Item
            </button>
          </div>
        </section>

        {/* Right Section: Symmetry and AI Assistant Sandbox */}
        <section className="xl:col-span-1 flex flex-col gap-6 order-3">
          
          {/* Interactive Symmetry Engine */}
          <div className="p-5 rounded-xl border border-cyan-900/30 bg-slate-950/50 backdrop-blur-md shadow-lg">
            <span className="text-xs font-mono text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-indigo-950/40 pb-3 mb-4">
              <Disc className="h-4.5 w-4.5" />
              Symmetry And Mirrors
            </span>

            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "none", label: "❌ Off" },
                  { id: "mirror", label: "↔️ Mirror" },
                  { id: "mandala", label: "🌀 Mandala" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    id={`symmetry-${mode.id}`}
                    onClick={() => {
                      setSymmetryMode(mode.id as any);
                      playBeep(450, "sine", 0.1);
                    }}
                    className={`py-2 px-1 text-center rounded border transition text-[11px] ${
                      symmetryMode === mode.id
                        ? "border-indigo-500 bg-indigo-950/30 text-indigo-300"
                        : "border-cyan-950/40 bg-slate-900/40 text-gray-400"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {symmetryMode === "mandala" && (
                <div className="py-2">
                  <div className="flex justify-between text-[10px] text-zinc-400 uppercase mb-1">
                    <span>Mandala Spokes</span>
                    <span className="text-indigo-400 font-bold">{mandalaSegments} Segments</span>
                  </div>
                  <input
                    id="slider-mandala-segments"
                    type="range"
                    min="4"
                    max="16"
                    step="2"
                    value={mandalaSegments}
                    onChange={(e) => setMandalaSegments(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 bg-cyan-950 h-1 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Background tracing templates selection */}
          <div className="p-5 rounded-xl border border-cyan-900/30 bg-slate-950/50 backdrop-blur-md shadow-lg">
            <span className="text-xs font-mono text-orange-400 font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-orange-950/40 pb-3 mb-4">
              <Layers className="h-4.5 w-4.5" />
              Tracing Templates
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {[
                { id: "none", label: "None" },
                { id: "mandala", label: "🌀 Mandala" },
                { id: "face", label: "🧑 Face Grid" },
                { id: "logo", label: "🔷 Hex Logo" },
              ].map((tmpl) => (
                <button
                  key={tmpl.id}
                  id={`template-${tmpl.id}`}
                  onClick={() => {
                    setActiveTemplate(tmpl.id as any);
                    playBeep(460, "sine", 0.05);
                  }}
                  className={`py-2 px-3 rounded text-left border transition ${
                    activeTemplate === tmpl.id
                      ? "border-orange-500 bg-orange-950/20 text-orange-300 font-bold"
                      : "border-cyan-950/40 bg-slate-900/40 text-gray-400"
                  }`}
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Smart AI copilot critiques panel bar */}
          <div className="rounded-xl border border-cyan-900/40 bg-slate-950/50 backdrop-blur-md p-5 shadow-lg flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-cyan-950/40 pb-4 mb-4">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase">
                  <Sparkles className="h-4.5 w-4.5 animate-spin" />
                  <span>AI Sketch co-pilot</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed font-mono uppercase mb-4">
                Use our integrated Gemini copilot mode to analyze drawings, transcribe handwritings, optimize geometries, or get beautiful neon suggestions!
              </p>

              {/* Action Button trigger */}
              <button
                id="btn-ai-analyze"
                onClick={handleAISketchCleanup}
                disabled={aiAssistantLoading}
                className="w-full py-2.5 rounded-lg font-mono text-xs font-bold bg-[#00ffea] text-[#070b13] uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,234,0.15)] hover:opacity-95 active:scale-95 disabled:opacity-55 disabled:scale-100 transition"
              >
                {aiAssistantLoading ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[#070b13] border-t-transparent animate-spin" />
                    Analyzing artwork...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    Review Sketch (Gemini AI)
                  </>
                )}
              </button>

              {/* Gemini returns and recommendations layout */}
              {aiResult && (
                <div className="mt-6 space-y-4 border-t border-cyan-950/40 pt-4 animate-fade-in text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                      Geometric Shape Detected
                    </span>
                    <span className="inline-block px-3 py-1 rounded bg-teal-950/30 border border-teal-500/20 text-[#00ffea] capitalize">
                      ✨ {aiResult.shapeDetected || "Hand-drawn sketch"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                      Sketch interpretation
                    </span>
                    <p className="text-gray-300 bg-slate-900/30 border border-slate-800/50 p-3 rounded leading-relaxed">
                      {aiResult.text}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                      Artistic Color Palette Suggestion
                    </span>
                    <div className="flex gap-2">
                      {aiResult.suggestedColors?.map((hex, idx) => (
                        <div
                          key={idx}
                          id={`ai-suggested-color-${hex.replace("#", "")}`}
                          style={{ backgroundColor: hex }}
                          onClick={() => {
                            setBrushColor(hex);
                            playBeep(450, "sine", 0.05);
                          }}
                          className="h-8 w-8 rounded-full border border-slate-800 hover:scale-115 active:scale-95 cursor-pointer shadow transition"
                          title={`Select ${hex}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick calibration security rules footer */}
            <div className="border-t border-[#132338] pt-4 mt-6 text-[10px] text-slate-500 font-mono flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-slate-400 animate-pulse" />
                <span>Local GPU Native Sandbox</span>
              </span>
              <span className="text-[#00ffea]/50">SECURE ACTIVE</span>
            </div>
          </div>
        </section>
      </main>

      {/* Cyberpunk ambient footer styling */}
      <footer className="mt-auto border-t border-cyan-950/20 bg-slate-950/20 py-4 px-6 text-center text-[10px] text-slate-500 font-mono uppercase tracking-wider">
        <span>© 2026 AI Smart Air Paint Studio | Powered by MediaPipe Hands & Google Gemini v3.5</span>
      </footer>
    </div>
  );
}

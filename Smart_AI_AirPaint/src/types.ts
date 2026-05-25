export type BrushType = 'paint' | 'neon' | 'spray' | 'dots' | 'calligraphy' | 'watercolor' | 'gradient';

export type DrawingLayer = 'background' | 'sketch' | 'effects';

export interface Point {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  size: number;
  brush: BrushType;
  layer: DrawingLayer;
}

export interface Shape {
  id: string;
  type: 'line' | 'circle' | 'rectangle' | 'triangle' | 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  size: number;
  isPerfect: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export type HandLandmark = { x: number; y: number; z: number };

export interface GestureState {
  gesture: 'draw' | 'erase' | 'shaka' | 'hover' | 'thumbsup' | 'pinkypromise' | 'none' | 'shapes' | 'effects' | 'menu' | 'pause';
  fingersUp: number[];
  confidence: number;
  isPinching: boolean;
  pinchStrength: number;
  pinchPoint?: { x: number; y: number };
}

export interface GameModeState {
  activeMode: 'free' | 'challenge' | 'timed' | 'pattern' | 'memory';
  timer: number;
  score: number;
  challengePrompt: string;
  patternToCopy?: string; // Base64 of shape or canvas
  isPlaying: boolean;
}

export interface AISuggestionResult {
  success: boolean;
  text: string;
  originalDescription?: string;
  suggestedColors?: string[];
  shapeDetected?: string;
  enhancedImage?: string; // base64
}

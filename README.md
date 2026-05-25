# AI Smart Air Paint Studio 🎨🌌

A production-grade, fully touchless futuristic holographic air drawing and painting platform driven by high-performance computer vision, real-time hand-landmarks classification, and Generative AI.

---

## 🚀 Dual-Delivery Architecture

To ensure the best possible experience, this project delivers a **Dual-Track Environment**:
1. **Interactive Web App (React + Vite + Tailwind + MediaPipe Client WASM)**: Runs instantly in the browser iframe preview. No complex setups or local dependencies are required! It requests browser camera permissions and lets you paint right away with your hand.
2. **Local Production Desktop App (Python + OpenCV + MediaPipe + NumPy)**: A standalone desktop painting program structured cleanly into high-quality modular source files. It is perfectly optimized to run on Windows, macOS, or Linux, and includes custom Kalman-filtered gesture smoothing, a holographic HUD menu, and timelapse video writing.

---

## 🖐️ Gesture Mappings & Air Control Systems

Both the Web App and Python Desktop implementation respect identical gestural inputs:

- **1 Finger Up (Index)**: 🖌️ **Paint Mode** - Moves the pointer to draw brush paths on the canvas. High speed increases pressure/thinness dynamics automatically.
- **2 Fingers Up (Index + Middle)**: 🧼 **Eraser Mode** - Clears canvas segments directly beneath the finger trajectory.
- **3 Fingers Up (Index + Middle + Ring)**: ✍️ **Calligraphy Mode** - Paints decorative, angled cursive strokes following hand angle.
- **4 Fingers Up (Index to Pinky)**: 🌌 **Neon Glow Mode** - Paints glowing energetic brush strokes.
- **5 Fingers Up (Open Palm)**: 🟢 **Hover Menu Interactions** - Moves a cursor over floating bento cards without drawing.
- **Pinch (Thumb + Index)**: 🎯 **Selection Click** - Triggers hover elements, selects custom colors, adjustments, or saves the artwork.
- **Hand Swipe Left**: ⏪ **Undo Action** - Smoothly steps back one stroke in the drawing history.
- **Hand Swipe Right**: ⏩ **Redo Action** - Reapplies the last undone stroke.

---

## 💻 Local Desktop Setup & Run Guide (Python)

### 1. Prerequisites
Ensure you have Python 3.10 or higher installed.

### 2. Install Dependencies
Run pip inside your terminal:
```bash
pip install -r requirements.txt
```

### 3. Run the Studio
Execute the master orchestration file:
```bash
python main.py
```

---

## 🌐 Web-Based Setup & Verification Model

The web interface compiles on the fly and runs as a full-stack Node.js + Express + Vite project:
- **Dev mode**: `npm run dev`
- **Prod compilation**: `npm run build && npm run start`

---

## ⚡ Performance Optimization & Stabilization Techniques

- **Micro-Jitter Reduction**: Built-in 2rd-order Kalman Filters stabilize raw coordinates from hand landmark predictions, preventing noisy wobbles and creating buttery-smooth drawing.
- **Anti-Aliasing**: Applied subdivision coordinate interpolation between frames to ensure fast brush strokes result in continuous liquid curves rather than disconnected dotted segments.
- **Low-light Robustness**: Adaptive thresholding and confidence calibrations in tracking (0.75 min calibration) filter out hand detections under variable lighting.

"""
AI Smart Air Paint Studio - Master Orchestration File
Launches the real-time touchless gesture air drawing system and holographic HUD overlay.
"""

import cv2
import numpy as np
import time

# Import local robust computer vision modules
from hand_tracking.hand_tracker import HandTracker
from gestures.gesture_recognizer import GestureRecognizer
from drawing.canvas_manager import CanvasManager
from ai_features.shape_detector import AIShapeDetector
from export.file_exporter import FileExporter


class HolographicHUD:
    """Draws custom floating overlay widgets, bento menus, buttons, and system statuses."""
    def __init__(self, width=1280, height=720):
        self.width = width
        self.height = height
        
        # Define color palette buttons in HUD
        self.colors = [
            {"name": "Neon Cyan", "color": (230, 255, 0), "center": (60, 60), "radius": 22}, # RGB/BGR swap friendly
            {"name": "Glow Magenta", "color": (255, 0, 255), "center": (120, 60), "radius": 22},
            {"name": "Sun Orange", "color": (0, 165, 255), "center": (180, 60), "radius": 22},
            {"name": "Hot Green", "color": (0, 255, 128), "center": (240, 60), "radius": 22},
            {"name": "Ultra Violet", "color": (238, 130, 238), "center": (300, 60), "radius": 22},
            {"name": "Electric White", "color": (255, 255, 255), "center": (360, 60), "radius": 22}
        ]
        
        # Tools layout
        self.tools = [
            {"id": "paint", "label": "PAINT (1F)", "rect": (450, 30, 560, 85)},
            {"id": "neon", "label": "NEON (4F)", "rect": (580, 30, 690, 85)},
            {"id": "calligraphy", "label": "CALI (3F)", "rect": (710, 30, 820, 85)},
            {"id": "spray", "label": "SPRAY", "rect": (840, 30, 950, 85)},
            {"id": "eraser", "label": "ERASER (2F)", "rect": (970, 30, 1080, 85)}
        ]
        
        # System buttons
        self.actions = [
            {"id": "clear", "label": "CLEAR ALL", "rect": (1110, 30, 1220, 85), "color": (50, 50, 255)},
            {"id": "save", "label": "SAVE ART", "rect": (1110, 105, 1220, 160), "color": (50, 255, 50)},
            {"id": "lens", "label": "AI SHAPE FIT", "rect": (1110, 180, 1220, 235), "color": (255, 255, 0)}
        ]

    def render(self, frame, active_color, active_tool, gesture_name, is_recording):
        """Paints transparent overlays, neon lines, buttons, and HUD telemetry on frame."""
        hud_overlay = frame.copy()
        
        # 1. Top HUD bar backing glass
        cv2.rectangle(hud_overlay, (20, 20), (1260, 100), (30, 30, 30), -1)
        cv2.rectangle(hud_overlay, (20, 20), (1260, 100), (100, 100, 100), 2, lineType=cv2.LINE_AA)
        
        # 2. Render color pickers
        for cp in self.colors:
            # Draw outer select ring if matching active paint color
            if cp["color"] == active_color:
                cv2.circle(hud_overlay, cp["center"], cp["radius"] + 5, (255, 255, 255), 3, lineType=cv2.LINE_AA)
            cv2.circle(hud_overlay, cp["center"], cp["radius"], cp["color"], -1)
            
        # 3. Draw Tool Buttons
        for t in self.tools:
            is_active = (t["id"] == active_tool)
            bg_color = (0, 160, 200) if is_active else (50, 50, 50)
            text_color = (255, 255, 255) if is_active else (200, 200, 200)
            
            x1, y1, x2, y2 = t["rect"]
            cv2.rectangle(hud_overlay, (x1, y1), (x2, y2), bg_color, -1)
            cv2.rectangle(hud_overlay, (x1, y1), (x2, y2), (200, 200, 200) if is_active else (100, 100, 100), 1)
            
            # Button typography
            cv2.putText(hud_overlay, t["label"], (x1 + 10, y1 + 33), cv2.FONT_HERSHEY_SIMPLEX, 0.45, text_color, 1, cv2.LINE_AA)

        # 4. Draw System Action Buttons
        for act in self.actions:
            x1, y1, x2, y2 = act["rect"]
            cv2.rectangle(hud_overlay, (x1, y1), (x2, y2), act["color"], -1)
            cv2.rectangle(hud_overlay, (x1, y1), (x2, y2), (255, 255, 255), 1)
            cv2.putText(hud_overlay, act["label"], (x1 + 10, y1 + 33), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

        # 5. Composite back with opacity for futuristic HUD glass effect
        cv2.addWeighted(hud_overlay, 0.45, frame, 0.55, 0, frame)
        
        # 6. Add Dynamic Telemetry Text (Clean bottom overlay)
        cv2.rectangle(frame, (20, 650), (450, 700), (40, 40, 40), -1)
        cv2.rectangle(frame, (20, 650), (450, 700), (0, 255, 230), 1)
        
        status_text = f"GESTURE: {gesture_name.upper()} | TOOL: {active_tool.upper()}"
        cv2.putText(frame, status_text, (35, 680), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 230), 1, cv2.LINE_AA)
        
        # Video recording ticker
        if is_recording:
            cv2.circle(frame, (1230, 675), 10, (0, 0, 255), -1)
            cv2.putText(frame, "REC TIMELAPSE", (1100, 680), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1, cv2.LINE_AA)
            


def main():
    # Initialize components
    width, height = 1280, 720
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    
    if not cap.isOpened():
        print("[AI Smart Air Paint Studio] Error: Webcam camera index 0 failed to open.")
        return

    tracker = HandTracker()
    recognizer = GestureRecognizer()
    canvas_manager = CanvasManager(width, height)
    detector = AIShapeDetector()
    exporter = FileExporter()
    hud = HolographicHUD(width, height)
    
    # Track raw point trajectories for shape fittings
    stroke_points_accumulator = []
    active_gesture = "none"
    last_action_time = time.time()
    
    # State flags
    fps_fps = 0
    prev_time = time.time()

    print("[AI Smart Air Paint Studio] Touchless Interface Initialized.")
    print("Commands:")
    print(" - 1 active finger: Draw / Paint")
    print(" - 2 active fingers: Eraser Mode")
    print(" - 3 active fingers: Calligraphy")
    print(" - 4 active fingers: Neon glow brush")
    print(" - 5 active fingers: Hover / Menu mode (Pinch top buttons to trigger controls)")
    print(" - Swipe Hand Left: Undo changes")
    print(" - Swipe Hand Right: Redo changes")
    print(" - Press 'q' key to safely quit app.")

    while cap.isOpened():
        success, raw_frame = cap.read()
        if not success:
            break
            
        # Calculate current FPS
        curr_time = time.time()
        fps_fps = int(1.0 / (curr_time - prev_time)) if (curr_time - prev_time) > 0 else 30
        prev_time = curr_time
        
        # Analyze hand kinematics
        raw_frame = tracker.find_hands(raw_frame)
        hand_info = tracker.get_hand_info(raw_frame)
        
        # Default gestures and cursor positioning
        gesture = "hover"
        cursor_pos = None
        
        if hand_info:
            gesture = recognizer.classify(hand_info)
            cursor_pos = hand_info["cursor"]
            
            # Detect horizontal swiping motions (undo/redo)
            swipe = recognizer.detect_swipe(hand_info["index_tip"])
            cooldown = time.time() - last_action_time
            if swipe == "swipe_left" and cooldown > 1.2:
                if canvas_manager.undo():
                    print("[SYSTEM] Touchless Undo Triggered!")
                last_action_time = time.time()
            elif swipe == "swipe_right" and cooldown > 1.2:
                if canvas_manager.redo():
                    print("[SYSTEM] Touchless Redo Triggered!")
                last_action_time = time.time()

        # Update HUD configuration and tool assignments dynamically depending on hand gesture values
        if gesture == "draw":
            if cursor_pos:
                canvas_manager.add_point(cursor_pos, pressure=hand_info["speed"]/10.0 + 0.5)
                stroke_points_accumulator.append(cursor_pos)
        elif gesture == "erase":
            if cursor_pos:
                canvas_manager.apply_eraser_segment(cursor_pos, cursor_pos)
        else:
            # End of stroke triggering
            if stroke_points_accumulator:
                canvas_manager.end_stroke()
                stroke_points_accumulator.clear()
                
        # Handle menu click simulation during hover mode pinch action
        if gesture == "pinch_select" and hand_info and (time.time() - last_action_time > 0.8):
            px, py = hand_info["index_tip"]
            
            # Check color pickers intersection
            for cp in hud.colors:
                cx, cy = cp["center"]
                if np.hypot(px - cx, py - cy) < cp["radius"] + 10:
                    canvas_manager.brush_color = cp["color"]
                    print(f"[SYSTEM] Color Changed to: {cp['name']}")
                    last_action_time = time.time()
                    
            # Check Tool buttons
            for t in hud.tools:
                x1, y1, x2, y2 = t["rect"]
                if x1 <= px <= x2 and y1 <= py <= y2:
                    if t["id"] == "eraser":
                        canvas_manager.brush_type = "paint"
                        gesture = "erase"
                    else:
                        canvas_manager.brush_type = t["id"]
                    print(f"[SYSTEM] Tool Updated to: {t['id']}")
                    last_action_time = time.time()
                    
            # Check Action buttons
            for act in hud.actions:
                x1, y1, x2, y2 = act["rect"]
                if x1 <= px <= x2 and y1 <= py <= y2:
                    if act["id"] == "clear":
                        canvas_manager.clear_canvas()
                        print("[SYSTEM] Canvas Cleared!")
                    elif act["id"] == "save":
                        composed = canvas_manager.compose_layers(raw_frame)
                        path = exporter.save_image(composed, "png")
                        print(f"[SYSTEM] Image Export Saved to: {path}")
                    elif act["id"] == "lens" and len(stroke_points_accumulator) > 8:
                        shape_type, poly = detector.fit_and_correct(stroke_points_accumulator)
                        if shape_type:
                            print(f"[SYSTEM] Auto-Shape Detected: {shape_type}")
                            # Draw perfect shape directly to layer
                            canvas_manager.save_state_for_undo()
                            for idx in range(len(poly) - 1):
                                cv2.line(canvas_manager.drawing_layer, poly[idx], poly[idx+1], canvas_manager.brush_color, canvas_manager.brush_size, cv2.LINE_AA)
                            if shape_type in ["circle", "rectangle", "triangle"]:
                                # Close geometry contour loops
                                cv2.line(canvas_manager.drawing_layer, poly[-1], poly[0], canvas_manager.brush_color, canvas_manager.brush_size, cv2.LINE_AA)
                            stroke_points_accumulator.clear()
                    last_action_time = time.time()

        # Compose composite painting visual stream output
        composite_frame = canvas_manager.compose_layers(raw_frame)
        
        # Render Holographic HUD overlay widgets
        hud.render(composite_frame, canvas_manager.brush_color, canvas_manager.brush_type, gesture, exporter.is_recording)
        
        # Highlight cursor position
        if cursor_pos:
            cv2.circle(composite_frame, cursor_pos, 10, canvas_manager.brush_color, -1, lineType=cv2.LINE_AA)
            cv2.circle(composite_frame, cursor_pos, 12, (255, 255, 255), 2, lineType=cv2.LINE_AA)
            cv2.putText(composite_frame, "AIR PINTR cursor", (cursor_pos[0] + 15, cursor_pos[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 230), 1, cv2.LINE_AA)
            
        # Draw dynamic frame statistics (FPS overlay)
        cv2.putText(composite_frame, f"ENGINE FPS: {fps_fps}", (30, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1, cv2.LINE_AA)

        # Show drawing canvas
        cv2.imshow("AI Smart Air Paint Studio - Holographic View", composite_frame)
        
        # Write timelapse frame if active
        if exporter.is_recording:
            exporter.write_timelapse_frame(composite_frame)

        # Handle keyboard safety breaks
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("r"): # Record gesture toggle
            if exporter.is_recording:
                exporter.stop_timelapse()
                print("[SYSTEM] Timelapse Recording Saved Successfully!")
            else:
                exporter.start_timelapse(width, height)
                print("[SYSTEM] Timelapse Video Recording Started...")

    # Teardown and cleanup
    if exporter.is_recording:
        exporter.stop_timelapse()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

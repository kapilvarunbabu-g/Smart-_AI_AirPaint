"""
AI Smart Air Paint Studio - Gesture Classification Engine
Translates human hand poses, finger states, and movements into smooth touchless commands.
"""

import numpy as np


class GestureRecognizer:
    """Classifies geometric distributions of hand landmarks into actionable system states."""
    def __init__(self):
        self.swipe_threshold = 45.0
        self.fist_threshold = 15.0
        self.prev_centers = []

    def classify(self, hand_info):
        """Analyzes active fingers and spatial relationships to return current Gesture."""
        if not hand_info:
            return "none"
            
        fingers = hand_info["fingers_up"]
        pinch_dist = hand_info["pinch_distance"]
        
        # 1. Closed Fist: Clean canvas / Force Eraser
        if sum(fingers) == 0:
            return "fist_erase"
            
        # 2. Pinch with Thumb + Index
        # Calculate normalization based on wrist to MCP distance to handle camera depth variance
        lms = hand_info["landmarks"]
        wrist = lms[0]
        middle_mcp = lms[9]
        hand_scale = np.hypot(wrist["x"] - middle_mcp["x"], wrist["y"] - middle_mcp["y"])
        
        normalized_pinch = pinch_dist / max(1.0, hand_scale)
        if normalized_pinch < 0.16:
            return "pinch_select"

        # 3. Categorized Finger Counts
        # Index finger up only -> Paint Mode
        if fingers == [0, 1, 0, 0, 0] or fingers == [1, 1, 0, 0, 0]:
            return "draw"
            
        # Index + Middle fingers up -> Eraser Mode
        if fingers == [0, 1, 1, 0, 0] or fingers == [1, 1, 1, 0, 0]:
            return "erase"
            
        # Index + Middle + Ring up -> Shapes Mode
        if fingers == [0, 1, 1, 1, 0]:
            return "shapes"
            
        # Index + Middle + Ring + Pinky up -> Effects/Brushes Selection
        if fingers == [0, 1, 1, 1, 1]:
            return "effects"
            
        # Five fingers / open palm up -> Command Menu
        if sum(fingers) >= 4:
            return "open_menu"

        return "hover"

    def detect_swipe(self, current_center):
        """Monitors hand center coordinate progression to recognize swift swipe gestures."""
        self.prev_centers.append(current_center)
        if len(self.prev_centers) > 10:
            self.prev_centers.pop(0)
            
        if len(self.prev_centers) < 6:
            return "none"
            
        dx = self.prev_centers[-1][0] - self.prev_centers[0][0]
        dy = self.prev_centers[-1][1] - self.prev_centers[0][1]
        
        # Must be mostly horizontal to qualify as left/right undo/redo swipe
        if abs(dx) > self.swipe_threshold and abs(dx) > 2 * abs(dy):
            self.prev_centers.clear() # Reset tracking after trigger
            if dx > 0:
                return "swipe_right"  # Redo
            else:
                return "swipe_left"   # Undo
                
        return "none"

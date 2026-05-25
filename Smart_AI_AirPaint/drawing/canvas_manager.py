"""
AI Smart Air Paint Studio - High-performance Layer-based Canvas Engine
Implements anti-aliased drawing, custom brushes, undo/redo, and brush dynamics.
"""

import cv2
import numpy as np


class CanvasManager:
    """Manages separate overlay layers and high-fidelity custom brush applications."""
    def __init__(self, width=1280, height=720):
        self.width = width
        self.height = height
        
        # Separate canvas layers (BGR with Alpha where applicable)
        self.background_layer = np.zeros((height, width, 3), dtype=np.uint8) + 18 # Dark grey slate theme
        self.drawing_layer = np.zeros((height, width, 3), dtype=np.uint8) # Drawn artwork
        
        # Stroke histories (Undo/Redo buffers)
        self.undo_stack = []
        self.redo_stack = []
        self.current_stroke = []
        
        # Active color and brush options
        self.brush_color = (0, 255, 230) # Default Neon teal
        self.brush_size = 8
        self.brush_type = "paint" # paint, neon, spray, calligraphy

    def clear_canvas(self):
        """Resets all art layers and resets stacks."""
        self.save_state_for_undo()
        self.drawing_layer.fill(0)
        self.redo_stack.clear()

    def save_state_for_undo(self):
        """Pushes current drawing layer to the undo list, cap memory at 20 steps."""
        self.undo_stack.append(self.drawing_layer.copy())
        if len(self.undo_stack) > 20:
            self.undo_stack.pop(0)

    def undo(self):
        """Restores the last drawing state from the stack."""
        if self.undo_stack:
            self.redo_stack.append(self.drawing_layer.copy())
            self.drawing_layer = self.undo_stack.pop()
            return True
        return False

    def redo(self):
        """Re-applies the undone drawing state."""
        if self.redo_stack:
            self.undo_stack.append(self.drawing_layer.copy())
            self.drawing_layer = self.redo_stack.pop()
            return True
        return False

    def add_point(self, pt, pressure=1.0):
        """Accumulates points in current stroke and renders connected segment."""
        self.current_stroke.append((pt, pressure))
        if len(self.current_stroke) > 1:
            p1, r1 = self.current_stroke[-2]
            p2, r2 = self.current_stroke[-1]
            self.draw_segment(p1, p2, r1, r2)

    def end_stroke(self):
        """Finalizes active line and saves layer state for undo navigation."""
        if self.current_stroke:
            self.save_state_for_undo()
            self.current_stroke.clear()
            self.redo_stack.clear()

    def draw_segment(self, pt1, pt2, r1, r2):
        """Renders single stroke segment utilizing specialized brush models."""
        base_size = self.brush_size
        
        # 1. Standard Brush / Paint
        if self.brush_type == "paint":
            sz = int(base_size * ((r1 + r2) / 2.0))
            cv2.line(self.drawing_layer, pt1, pt2, self.brush_color, thickness=max(1, sz), lineType=cv2.LINE_AA)

        # 2. Neon Glow Brush: Outer blurred glowing core + white sleek inner line
        elif self.brush_type == "neon":
            sz = int(base_size * 2)
            # Create neon glowing halo segment
            glow_mask = np.zeros_like(self.drawing_layer)
            cv2.line(glow_mask, pt1, pt2, self.brush_color, thickness=sz * 3, lineType=cv2.LINE_AA)
            glow_mask = cv2.GaussianBlur(glow_mask, (15, 15), 0)
            self.drawing_layer = cv2.addWeighted(self.drawing_layer, 1.0, glow_mask, 0.4, 0)
            
            # Draw brighter core line
            cv2.line(self.drawing_layer, pt1, pt2, (255, 255, 255), thickness=max(1, int(sz / 2)), lineType=cv2.LINE_AA)

        # 3. Calligraphy Brush: Vertical angled line brush modeling cursive pressure
        elif self.brush_type == "calligraphy":
            cv2.line(self.drawing_layer, pt1, pt2, self.brush_color, thickness=max(1, int(base_size * r2)), lineType=cv2.LINE_AA)
            # Add calligraphic slant overlay
            slant_dx, slant_dy = 3, -6
            pt1_slant = (pt1[0] + slant_dx, pt1[1] + slant_dy)
            pt2_slant = (pt2[0] + slant_dx, pt2[1] + slant_dy)
            cv2.line(self.drawing_layer, pt1_slant, pt2_slant, self.brush_color, thickness=max(1, int(base_size * 0.4)), lineType=cv2.LINE_AA)

        # 4. Spray Brush: Dotted paint splatter
        elif self.brush_type == "spray":
            dist = int(np.hypot(pt2[0] - pt1[0], pt2[1] - pt1[1]))
            steps = max(1, dist // 3)
            for i in range(steps):
                t = i / steps
                cx = int(pt1[0] + t * (pt2[0] - pt1[0]))
                cy = int(pt1[1] + t * (pt2[1] - pt1[1]))
                # Splatter small dots randomly around brush radius
                for _ in range(12):
                    offset_x = int(np.random.normal(0, base_size * 1.5))
                    offset_y = int(np.random.normal(0, base_size * 1.5))
                    rx = cx + offset_x
                    ry = cy + offset_y
                    if 0 <= rx < self.width and 0 <= ry < self.height:
                        self.drawing_layer[ry, rx] = self.brush_color

    def apply_eraser_segment(self, pt1, pt2):
        """Wipes out paint along the trajectory segment."""
        self.save_state_for_undo()
        cv2.line(self.drawing_layer, pt1, pt2, (0, 0, 0), thickness=self.brush_size * 4, lineType=cv2.LINE_AA)

    def compose_layers(self, camera_frame=None):
        """Fuses backdrop, sketch, and overlay layers into single high-FPS composition."""
        if camera_frame is not None:
            # Mirror frame for intuitive painting orientation
            canvas = cv2.flip(camera_frame, 1)
        else:
            canvas = self.background_layer.copy()

        # Combine artwork layer using additive overlay (excluding black background pixels)
        mask = cv2.cvtColor(self.drawing_layer, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
        
        # Merge art layer into canvas
        fg = cv2.bitwise_and(self.drawing_layer, self.drawing_layer, mask=thresh)
        bg = cv2.bitwise_and(canvas, canvas, mask=cv2.bitwise_not(thresh))
        full_composed = cv2.add(fg, bg)
        
        return full_composed

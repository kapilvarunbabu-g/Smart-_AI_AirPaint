"""
AI Smart Air Paint Studio - Shape Recognition & Optimization Engine
Performs geometric contour approximations to correct squiggly doodles into perfect shapes.
"""

import cv2
import numpy as np


class AIShapeDetector:
    """Detects standard geometric shapes from coordinate arrays and suggests clean alternatives."""
    def __init__(self):
        pass

    def fit_and_correct(self, stroke_pts):
        """Fits points to find best-matching rectangle, circle, line or triangle."""
        if len(stroke_pts) < 8:
            return None, stroke_pts
            
        # Convert points to NumPy array
        np_pts = np.array(stroke_pts, dtype=np.int32)
        
        # Calculate bounding box & contour properties
        hull = cv2.convexHull(np_pts)
        epsilon = 0.04 * cv2.arcLength(hull, True)
        approx = cv2.approxPolyDP(hull, epsilon, True)
        
        # Bounding info
        x, y, w, h = cv2.boundingRect(np_pts)
        center_x, center_y = int(x + w / 2), int(y + h / 2)
        
        # 1. Straight Line fitting - check aspect ratio or variance
        _, _, _, _, _, _, line_vx, line_vy, _, _ = cv2.fitLine(np_pts, cv2.DIST_L2, 0, 0.01, 0.01)
        
        # Determine shapes from polygon approximations
        num_vertices = len(approx)
        
        # Circle correlation check using area vs perimeter ratio
        area = cv2.contourArea(hull)
        perimeter = cv2.arcLength(hull, True)
        circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0
        
        # Rectangles
        if num_vertices == 4:
            # Clean square/rectangle coordinate representation
            rect_pts = [
                (x, y),
                (x + w, y),
                (x + w, y + h),
                (x, y + h)
            ]
            return "rectangle", rect_pts

        # Triangles
        elif num_vertices == 3:
            tri_pts = [tuple(approx[0][0]), tuple(approx[1][0]), tuple(approx[2][0])]
            return "triangle", tri_pts

        # Circle Detection (High circularity score > 0.8)
        elif circularity > 0.82:
            # Return center point and radius
            radius = int((w + h) / 4)
            # Sample points along circumference
            circle_pts = []
            for angle in range(0, 360, 15):
                rad = np.deg2rad(angle)
                cx = int(center_x + radius * np.cos(rad))
                cy = int(center_y + radius * np.sin(rad))
                circle_pts.append((cx, cy))
            return "circle", circle_pts
            
        # Default fallback: straight line from first point to last point
        p_first = tuple(stroke_pts[0])
        p_last = tuple(stroke_pts[-1])
        return "line", [p_first, p_last]

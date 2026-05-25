"""
AI Smart Air Paint Studio - Export & Timelapse Recording System
Saves paintings in various formats (PNG, JPG, PDF) and records time-lapse drawing videos.
"""

import os
import cv2
import time
from datetime import datetime


class FileExporter:
    """Manages filesaving procedures and coordinates active timelapse video capture scripts."""
    def __init__(self, output_dir="./recordings"):
        self.output_dir = output_dir
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        self.video_writer = None
        self.is_recording = False

    def save_image(self, canvas, format_type="png"):
        """Saves current painting static slice with high-fidelity output encoding."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"airpaint_{timestamp}.{format_type}"
        filepath = os.path.join(self.output_dir, filename)
        
        if format_type == "png":
            # Transparent layer extraction: Treat black pixels as transparent alpha channel
            tmp_gray = cv2.cvtColor(canvas, cv2.COLOR_BGR2GRAY)
            _, alpha = cv2.threshold(tmp_gray, 1, 255, cv2.THRESH_BINARY)
            b, g, r = cv2.split(canvas)
            rgba = cv2.merge([b, g, r, alpha])
            cv2.imwrite(filepath, rgba)
        else:
            cv2.imwrite(filepath, canvas)
            
        return filepath

    def start_timelapse(self, width=1280, height=720, fps=15):
        """Initializes OpenCV stream writer to disk."""
        if self.is_recording:
            return None
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"timelapse_{timestamp}.avi"
        filepath = os.path.join(self.output_dir, filename)
        
        # Cross-platform MJPEG codec
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        self.video_writer = cv2.VideoWriter(filepath, fourcc, fps, (width, height))
        self.is_recording = True
        return filepath

    def write_timelapse_frame(self, frame):
        """Pushes current active canvas state into recording video flow."""
        if self.is_recording and self.video_writer is not None:
            self.video_writer.write(frame)

    def stop_timelapse(self):
        """Finalizes VideoWriter resources and releases the file."""
        if self.is_recording and self.video_writer is not None:
            self.video_writer.release()
            self.video_writer = None
            self.is_recording = False
            return True
        return False

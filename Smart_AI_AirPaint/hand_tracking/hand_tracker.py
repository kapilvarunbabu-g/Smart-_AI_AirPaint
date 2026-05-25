"""
AI Smart Air Paint Studio - Real-time Hand Tracking Engine
Utilizes MediaPipe Hands and Kalman Filters for ultra-smooth pointer tracking.
"""

import cv2
import mediapipe as mp
import numpy as np
from collections import deque


class KalmanFilter2D:
    """Kalman Filter for ultra-smooth 2D screen coordinate tracking."""
    def __init__(self, process_noise=0.03, measurement_noise=0.8):
        # State: [x, y, dx, dy]
        self.state = np.zeros((4, 1), dtype=np.float32)
        
        # Action transition matrix
        self.A = np.array([
            [1, 0, 1, 0],
            [0, 1, 0, 1],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ], dtype=np.float32)
        
        # Measurement matrix (only measuring position x and y)
        self.H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0]
        ], dtype=np.float32)
        
        # Covariance matrices
        self.Q = np.eye(4, dtype=np.float32) * process_noise
        self.R = np.eye(2, dtype=np.float32) * measurement_noise
        self.P = np.eye(4, dtype=np.float32)
        
        self.initialized = False

    def predict(self):
        self.state = np.dot(self.A, self.state)
        self.P = np.dot(np.dot(self.A, self.P), self.A.T) + self.Q
        return self.state[0, 0], self.state[1, 0]

    def update(self, x, y):
        measurement = np.array([[x], [y]], dtype=np.float32)
        if not self.initialized:
            self.state[0, 0] = x
            self.state[1, 0] = y
            self.initialized = True
            return x, y

        # Kalman gain calculation
        S = np.dot(np.dot(self.H, self.P), self.H.T) + self.R
        K = np.dot(np.dot(self.P, self.H.T), np.linalg.inv(S))
        
        # Correct state and covariance
        y_residual = measurement - np.dot(self.H, self.state)
        self.state = self.state + np.dot(K, y_residual)
        self.P = self.P - np.dot(np.dot(K, self.H), self.P)
        
        return self.state[0, 0], self.state[1, 0]


class HandTracker:
    """Core MediaPipe hand tracking interface with stabilizing techniques."""
    def __init__(self, max_hands=1, detection_con=0.75, track_con=0.75):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=max_hands,
            model_complexity=1,
            min_detection_confidence=detection_con,
            min_tracking_confidence=track_con
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.mp_styles = mp.solutions.drawing_styles
        
        # Stabilization filters
        self.kalman = KalmanFilter2D()
        self.trajectory_history = deque(maxlen=30)
        self.prev_fingertip = None

    def find_hands(self, img, draw=True):
        """Processes RGB video frame and returns found hand landmarks."""
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        self.results = self.hands.process(img_rgb)
        
        if self.results.multi_hand_landmarks and draw:
            for hand_lms in self.results.multi_hand_landmarks:
                self.mp_draw.draw_landmarks(
                    img, 
                    hand_lms, 
                    self.mp_hands.HAND_CONNECTIONS,
                    self.mp_styles.get_default_hand_landmarks_style(),
                    self.mp_styles.get_default_hand_connections_style()
                )
        return img

    def get_hand_info(self, img, hand_idx=0):
        """Returns coordinate dictionary, finger states, and pinch measurements."""
        landmarks_list = []
        is_left_hand = False
        
        if not self.results.multi_hand_landmarks or hand_idx >= len(self.results.multi_hand_landmarks):
            return None
            
        hand_landmarks = self.results.multi_hand_landmarks[hand_idx]
        handedness = self.results.multi_handedness[hand_idx].classification[0].label
        is_left_hand = (handedness == "Left") # OpenCV mirror flip relative

        h, w, c = img.shape
        for idx, lm in enumerate(hand_landmarks.landmark):
            cx, cy = int(lm.x * w), int(lm.y * h)
            landmarks_list.append({
                "id": idx,
                "x": cx,
                "y": cy,
                "z": lm.z,
                "norm_x": lm.x,
                "norm_y": lm.y
            })
            
        # Analyze individual finger states (Up / Down)
        # Tip ids: Thumb(4), Index(8), Middle(12), Ring(16), Pinky(20)
        tip_ids = [4, 8, 12, 16, 20]
        fingers_up = []
        
        if len(landmarks_list) == 21:
            # Thumb state dependent on orientation (using relative x coordinate)
            if is_left_hand:
                thumb_up = 1 if landmarks_list[tip_ids[0]]["x"] > landmarks_list[tip_ids[0] - 1]["x"] else 0
            else:
                thumb_up = 1 if landmarks_list[tip_ids[0]]["x"] < landmarks_list[tip_ids[0] - 1]["x"] else 0
            fingers_up.append(thumb_up)
            
            # Index, Middle, Ring, Pinky states (using relative height position Y)
            for tip in tip_ids[1:]:
                # If tip is above PIP/DIP joint, it is up (note origin is top-left)
                is_up = 1 if landmarks_list[tip]["y"] < landmarks_list[tip - 2]["y"] else 0
                fingers_up.append(is_up)
                
        # Calculate pinch dynamics (Thumb tip to Index tip distance)
        thumb_tip = landmarks_list[4]
        index_tip = landmarks_list[8]
        dist = np.hypot(thumb_tip["x"] - index_tip["x"], thumb_tip["y"] - index_tip["y"])
        
        # Get stabilized cursor coordinates targeting index finger
        self.kalman.predict()
        smooth_x, smooth_y = self.kalman.update(index_tip["x"], index_tip["y"])
        
        # Speed calculations for dynamic pressure painting
        current_tip = (index_tip["x"], index_tip["y"])
        speed = 0.0
        if self.prev_fingertip:
            speed = np.hypot(current_tip[0] - self.prev_fingertip[0], current_tip[1] - self.prev_fingertip[1])
        self.prev_fingertip = current_tip

        return {
            "landmarks": landmarks_list,
            "fingers_up": fingers_up,
            "is_left": is_left_hand,
            "pinch_distance": dist,
            "cursor": (int(smooth_x), int(smooth_y)),
            "speed": speed,
            "index_tip": current_tip
        }

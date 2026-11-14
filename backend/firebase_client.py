"""
Firebase Integration Client for Flame in Freefall
Connects to Google Cloud Firestore / Firebase Realtime Database.
Target Firebase Project: microgravitational-flame
Features graceful offline/mock fallback for local R&D when cloud keys are omitted.
"""

import os
import json
from typing import Dict, Any, List, Optional

FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "microgravitational-flame")
SERVICE_ACCOUNT_KEY_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "serviceAccountKey.json")

_firebase_app = None
_firestore_db = None
_is_connected = False

def initialize_firebase():
    """Initializes Firebase Admin SDK if credentials exist, otherwise flags fallback mode."""
    global _firebase_app, _firestore_db, _is_connected
    
    if _firebase_app is not None:
        return _firestore_db
        
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        
        if os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
            cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
            _firebase_app = firebase_admin.initialize_app(cred, {
                'projectId': FIREBASE_PROJECT_ID,
            })
            _firestore_db = firestore.client()
            _is_connected = True
            print(f"[FIREBASE] Successfully authenticated via serviceAccountKey for {FIREBASE_PROJECT_ID}")
        else:
            # Try default application credentials
            try:
                _firebase_app = firebase_admin.initialize_app()
                _firestore_db = firestore.client()
                _is_connected = True
                print(f"[FIREBASE] Initialized with Default Application Credentials for {FIREBASE_PROJECT_ID}")
            except Exception:
                print(f"[FIREBASE] No active GCP credentials found. Running in resilient Local/Sandbox mode for project: {FIREBASE_PROJECT_ID}")
                _is_connected = False
    except ImportError:
        print("[FIREBASE] firebase-admin package not installed. Running in mock offline mode.")
        _is_connected = False

    return _firestore_db


def record_telemetry_event(event_data: Dict[str, Any]) -> Dict[str, Any]:
    """Records an anomaly or simulation record to Firestore or memory store."""
    initialize_firebase()
    
    if _is_connected and _firestore_db:
        try:
            doc_ref = _firestore_db.collection("telemetry_logs").document()
            doc_ref.set(event_data)
            return {"status": "persisted", "doc_id": doc_ref.id, "mode": "cloud_firestore"}
        except Exception as e:
            return {"status": "error", "message": str(e), "mode": "fallback_local"}
            
    return {"status": "simulated_persistence", "mode": "local_mock", "project": FIREBASE_PROJECT_ID}


def get_connection_status() -> Dict[str, Any]:
    """Returns the current connection state of the Firebase client."""
    return {
        "project_id": FIREBASE_PROJECT_ID,
        "is_connected": _is_connected,
        "credentials_found": os.path.exists(SERVICE_ACCOUNT_KEY_PATH),
    }

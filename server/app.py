# server/app.py
import os, base64, requests
from flask import Flask, request, jsonify, send_from_directory

# --- Paths -------------------------------------------------------------
BASE_DIR   = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_DIR = BASE_DIR                    # because challenges.html is in EcoGame/
IMAGES_DIR = os.path.join(BASE_DIR, "images1")

# Serve files from EcoGame/ at the site root ( / )
app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="/")

# --- Routes to serve your frontend ------------------------------------
@app.get("/")
def home():
    # Serve EcoGame/challenges.html
    return send_from_directory(STATIC_DIR, "challenges.html")

# (Optional) explicit route for videos/images if you want it
@app.get("/images1/<path:filename>")
def images(filename):
    return send_from_directory(IMAGES_DIR, filename)

# --- Plant.id setup ----------------------------------------------------
PLANT_ID_API_KEY = os.getenv("PLANT_ID_API_KEY", "")
PLANT_ID_ENDPOINT = "https://plant.id/api/v3/identification"

# Identify a plant from an uploaded image
@app.post("/api/identify")
def identify():
    if "image" not in request.files:
        return jsonify({"error":"no image"}), 400
    if not PLANT_ID_API_KEY:
        return jsonify({"error":"set PLANT_ID_API_KEY in env"}), 500

    img_b64 = base64.b64encode(request.files["image"].read()).decode("utf-8")
    payload = {
        "images": [img_b64],
        "similar_images": True,
        "modifiers": ["crops_fast", "similar_images"],
        "plant_details": ["common_names","url","wiki_description","taxonomy"]
    }
    headers = {"Api-Key": PLANT_ID_API_KEY, "Content-Type": "application/json"}
    r = requests.post(PLANT_ID_ENDPOINT, json=payload, headers=headers, timeout=25)
    r.raise_for_status()
    j = r.json()

    s = (j.get("result",{}).get("classification",{}).get("suggestions") or [None])[0] or {}
    d = s.get("details") or {}

    return jsonify({
        "name": (d.get("common_names") or [None])[0],
        "scientific_name": s.get("name"),
        "family": (d.get("taxonomy") or {}).get("family"),
        "probability": s.get("probability"),
        "common_names": d.get("common_names") or [],
        "wikipedia_url": d.get("url"),
        "sources": ["Plant.id"]
    })

# Simple proof verification (accept-all for now)
@app.post("/api/verify")
def verify():
    cid = request.form.get("challengeId")
    return jsonify({"ok": True, "challenge": cid})

if __name__ == "__main__":
    app.run(port=5050, debug=True)
# To run: FLASK_APP=server/app.py FLASK_ENV=development flask run --port=5050
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
CORS(app)
BASE = os.path.dirname(os.path.abspath(__file__))


@app.get("/")
def index():
    return send_from_directory(BASE, "index.html")


@app.get("/health")
def health():
    return jsonify(status="ok", project="Team G: Bot Detection Gateway", stack="flask")

@app.route("/api/score", methods=["POST"])
def ep_0(**kwargs):
    # TODO: Body: request features -> {score, decision}
    return jsonify(error="Not implemented", todo="Body: request features -> {score, decision}"), 501

@app.route("/api/stats", methods=["GET"])
def ep_1(**kwargs):
    # TODO: Allowed vs blocked counts
    return jsonify(error="Not implemented", todo="Allowed vs blocked counts"), 501

@app.route("/protected", methods=["GET"])
def ep_2(**kwargs):
    # TODO: Demo route guarded by your middleware
    return jsonify(error="Not implemented", todo="Demo route guarded by your middleware"), 501


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)

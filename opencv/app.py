from flask import Flask, request, jsonify
from module.image import proc
from module.princess.guild import report
from module.princess.arena import upload
import os

app = Flask(__name__)


@app.route('/')
def hello_world():
    return 'Hello, World!'


@app.route('/api/v1/Guild/Battle/Info', methods=["POST"])
def GBIanalyze():
    body = request.get_json()
    result = report.process(proc.base64_to_image(body["image"]))
    if result == None:
        return "{}", 404
    return jsonify(result)


@app.route('/api/v1/Arena/Battle/Result', methods=["POST"])
def ABRanalyze():
    body = request.get_json()
    result = upload.process(proc.base64_to_image(body["image"]))
    if result == 1:
        return jsonify({"message": "1"})
    elif result == 2:
        return jsonify({"message": "2"})

    return jsonify(result)

debug = True if os.getenv("PYTHON_MODE") == "DEBUG" else False
app.run(host="0.0.0.0", port=3000, debug=debug)

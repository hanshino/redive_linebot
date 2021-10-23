from flask import Flask, request, jsonify
from module.image import proc
from module.princess.guild import report
from module.princess.arena import upload, search
from module.world import damage_chart

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
    if result == None:
        return "{}", 404
    return jsonify(result)


@app.route('/api/v1/Arena/Battle/Search', methods=["POST"])
def ABRsearch():
    body = request.get_json()
    result = search.process(proc.base64_to_image(body["image"]))
    if result == None:
        return jsonify({"message": "empty"}), 404
    return jsonify(result)


@app.route('/api/v1/World/Boss/DamageChart', methods=["POST"])
def WBChart():
    body = request.get_json()
    result = damage_chart.process(body["top_data"])
    return jsonify(result)


app.run(host="0.0.0.0", port=3000)

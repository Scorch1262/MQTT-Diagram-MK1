"""Flask-/SocketIO-App für das MQTT-Mindmap-Dashboard."""
from flask import Flask, render_template
from flask_socketio import SocketIO

from mqtt_manager import MQTTManager

# threading-Modus statt eventlet/gevent: deutlich unkomplizierter beim
# Einfrieren mit PyInstaller (keine Monkeypatch-/Import-Fallstricke).
socketio = SocketIO(async_mode="threading", cors_allowed_origins="*")
manager: "MQTTManager | None" = None


def create_app(template_folder: str, static_folder: str) -> Flask:
    global manager

    app = Flask(
        __name__,
        template_folder=template_folder,
        static_folder=static_folder,
    )
    app.config["SECRET_KEY"] = "mqtt-mindmap-dashboard"

    socketio.init_app(app)
    manager = MQTTManager(socketio)

    @app.route("/")
    def index():
        return render_template("index.html")

    _register_socket_events()
    return app


def _register_socket_events():
    @socketio.on("connect")
    def _on_client_connect():
        socketio.emit("status", manager.get_status())
        socketio.emit("tree_snapshot", manager.get_tree_snapshot())

    @socketio.on("connect_broker")
    def _on_connect_broker(data):
        data = data or {}
        status = manager.connect_to_broker(
            host=(data.get("host") or "").strip(),
            port=int(data.get("port") or 1883),
            username=(data.get("username") or "").strip() or None,
            password=(data.get("password") or "").strip() or None,
            use_tls=bool(data.get("use_tls")),
            topic_filter=(data.get("topic_filter") or "#").strip() or "#",
            client_id=(data.get("client_id") or "").strip() or None,
        )
        socketio.emit("status", status)

    @socketio.on("disconnect_broker")
    def _on_disconnect_broker():
        socketio.emit("status", manager.disconnect())

    @socketio.on("reset_tree")
    def _on_reset_tree():
        manager.reset_tree()
        socketio.emit("tree_snapshot", manager.get_tree_snapshot())

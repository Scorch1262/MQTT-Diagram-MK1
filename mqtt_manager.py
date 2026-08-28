"""
MQTTManager
-----------
Verbindet sich mit einem MQTT-Broker, abonniert einen Topic-Filter (z.B. "#")
und baut daraus einen Baum auf: jeder "/"-getrennte Topic-Abschnitt wird zu
einem Knoten. Neue Knoten werden per SocketIO an alle verbundenen Browser
gemeldet ("node_added"), jede eingehende Nachricht wird als Event
("message") mit dem vollständigen Pfad vom Broker (Wurzel) bis zum Topic
(Blatt) verschickt, damit das Frontend einen Marker entlang dieses Pfades
animieren kann.
"""
import base64
import json
import ssl
import threading
import time
import uuid

import paho.mqtt.client as mqtt

ROOT_ID = "__root__"
MAX_PAYLOAD_PREVIEW = 4000


def _decode_payload(payload: bytes):
    """Payload möglichst als Text/JSON aufbereiten, sonst Base64-Fallback."""
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return {
            "text": base64.b64encode(payload).decode("ascii"),
            "encoding": "base64",
            "is_json": False,
        }

    is_json = False
    pretty = text
    try:
        parsed = json.loads(text)
        pretty = json.dumps(parsed, indent=2, ensure_ascii=False)
        is_json = True
    except (json.JSONDecodeError, ValueError):
        pass

    if len(pretty) > MAX_PAYLOAD_PREVIEW:
        pretty = pretty[:MAX_PAYLOAD_PREVIEW] + "\n… (gekürzt)"

    return {"text": pretty, "encoding": "utf-8", "is_json": is_json}


def _new_node(node_id, name, parent_id, is_root=False):
    return {
        "id": node_id,
        "name": name,
        "parent_id": parent_id,
        "is_root": is_root,
        "msg_count": 0,
        "last_topic": None,
        "last_payload": None,
        "last_qos": None,
        "last_retain": None,
        "last_ts": None,
    }


class MQTTManager:
    def __init__(self, socketio):
        self.socketio = socketio
        self.client: "mqtt.Client | None" = None
        self.lock = threading.Lock()
        self.connected = False
        self.connecting = False
        self.last_error = None
        self.broker_info = {}
        self.topic_filter = "#"
        self.nodes = {}
        self._reset_tree_locked()

    # ------------------------------------------------------------ tree --
    def _reset_tree_locked(self):
        self.nodes = {ROOT_ID: _new_node(ROOT_ID, "Broker", None, is_root=True)}

    def reset_tree(self):
        with self.lock:
            self._reset_tree_locked()

    def get_tree_snapshot(self):
        with self.lock:
            return {"nodes": list(self.nodes.values())}

    def get_status(self):
        with self.lock:
            return {
                "connected": self.connected,
                "connecting": self.connecting,
                "error": self.last_error,
                "broker": dict(self.broker_info),
            }

    # -------------------------------------------------------- connect ---
    def connect_to_broker(self, host, port, username, password, use_tls,
                           topic_filter, client_id):
        if not host:
            with self.lock:
                self.last_error = "Bitte eine Broker-Adresse angeben."
            return self.get_status()

        self.disconnect()

        client_id = client_id or f"mindmap-dashboard-{uuid.uuid4().hex[:8]}"
        client = mqtt.Client(client_id=client_id, clean_session=True)

        if username:
            client.username_pw_set(username, password or None)
        if use_tls:
            client.tls_set(cert_reqs=ssl.CERT_NONE)
            client.tls_insecure_set(True)

        topic_filter = topic_filter or "#"

        with self.lock:
            self.topic_filter = topic_filter
            self.connecting = True
            self.connected = False
            self.last_error = None
            self.broker_info = {"host": host, "port": port, "topic_filter": topic_filter}

        def on_connect(c, userdata, flags, rc):
            with self.lock:
                self.connected = rc == 0
                self.connecting = False
                self.last_error = None if rc == 0 else f"Verbindung fehlgeschlagen (rc={rc})"
            if rc == 0:
                c.subscribe(topic_filter, qos=0)
            self.socketio.emit("status", self.get_status())

        def on_disconnect(c, userdata, rc):
            with self.lock:
                self.connected = False
                self.connecting = False
            self.socketio.emit("status", self.get_status())

        def on_message(c, userdata, msg):
            self._handle_message(msg.topic, msg.payload, msg.qos, msg.retain)

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message

        try:
            client.connect_async(host, int(port), keepalive=30)
            client.loop_start()
        except Exception as exc:  # noqa: BLE001
            with self.lock:
                self.connecting = False
                self.last_error = str(exc)
            return self.get_status()

        self.client = client
        self.reset_tree()
        self.socketio.emit("tree_snapshot", self.get_tree_snapshot())
        return self.get_status()

    def disconnect(self):
        if self.client is not None:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception:  # noqa: BLE001
                pass
            self.client = None
        with self.lock:
            self.connected = False
            self.connecting = False
        return self.get_status()

    # -------------------------------------------------------- message ---
    def _handle_message(self, topic, payload, qos, retain):
        parts = [p for p in topic.split("/") if p != ""]
        if not parts:
            return

        new_nodes = []
        path_ids = [ROOT_ID]

        with self.lock:
            parent_id = ROOT_ID
            current_path = ""
            for part in parts:
                current_path = f"{current_path}/{part}" if current_path else part
                node_id = current_path
                path_ids.append(node_id)
                if node_id not in self.nodes:
                    node = _new_node(node_id, part, parent_id)
                    self.nodes[node_id] = node
                    new_nodes.append(node)
                parent_id = node_id

            leaf = self.nodes[path_ids[-1]]
            decoded = _decode_payload(payload)
            ts = time.time()
            leaf["msg_count"] += 1
            leaf["last_topic"] = topic
            leaf["last_payload"] = decoded
            leaf["last_qos"] = qos
            leaf["last_retain"] = bool(retain)
            leaf["last_ts"] = ts

            self.nodes[ROOT_ID]["msg_count"] += 1
            msg_count = leaf["msg_count"]

        for node in new_nodes:
            self.socketio.emit("node_added", node)

        self.socketio.emit("message", {
            "path": path_ids,
            "topic": topic,
            "payload": decoded,
            "qos": qos,
            "retain": bool(retain),
            "ts": ts,
            "msg_count": msg_count,
        })

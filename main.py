"""
MQTT Mindmap Dashboard
=======================
Startet einen lokalen Webserver und öffnet ihn im Standardbrowser.
Auf der Webseite kann die Adresse eines MQTT-Brokers eingegeben werden;
alle empfangenen Topics/Nachrichten werden anschließend als sich selbst
erweiternde Mindmap dargestellt. Neu eingehende Nachrichten wandern als
Marker den jeweiligen Ast entlang zum Broker-Knoten.

Dieses Skript ist der Einstiegspunkt für PyInstaller (main.py -> .exe / .app)
UND kann unverändert auch "headless" betrieben werden (z.B. auf einem
OpenWrt-Router), gesteuert über Umgebungsvariablen:

  DASHBOARD_HOST          IP, an die gebunden wird (Standard: 127.0.0.1).
                           Für Netzwerkzugriff z.B. "0.0.0.0" setzen.
  DASHBOARD_PORT           Fester Port (Standard: automatische Suche ab 5000).
  DASHBOARD_OPEN_BROWSER   "0"/"false" verhindert das automatische Öffnen
                            eines Browsers (sinnvoll auf Geräten ohne GUI).
"""
import os
import socket
import sys
import threading
import time
import webbrowser

from server import create_app, socketio


def resource_path(relative_path: str) -> str:
    """Pfad zu einer mitgelieferten Ressource – funktioniert sowohl im
    normalen Python-Lauf als auch in einer von PyInstaller gebauten
    .exe/.app (dort liegen Daten in sys._MEIPASS)."""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


def find_free_port(preferred: int = 5000, bind_host: str = "127.0.0.1") -> int:
    for port in range(preferred, preferred + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((bind_host, port))
                return port
            except OSError:
                continue
    return preferred


def _env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() not in ("0", "false", "no", "off", "")


def main():
    host = os.environ.get("DASHBOARD_HOST", "127.0.0.1").strip() or "127.0.0.1"

    port_env = os.environ.get("DASHBOARD_PORT", "").strip()
    if port_env:
        # Fester Port, z.B. für Firewall-Regeln / Autostart-Skripte auf Routern.
        port = int(port_env)
    else:
        port = find_free_port(5000, bind_host="127.0.0.1" if host == "0.0.0.0" else host)

    open_browser_enabled = _env_bool("DASHBOARD_OPEN_BROWSER", default=True)
    display_host = "127.0.0.1" if host == "0.0.0.0" else host
    url = f"http://{display_host}:{port}"

    app = create_app(resource_path("templates"), resource_path("static"))

    if open_browser_enabled:
        def open_browser():
            time.sleep(1.0)
            try:
                webbrowser.open(url)
            except Exception:
                pass

        threading.Thread(target=open_browser, daemon=True).start()

    print("=" * 60)
    print(" MQTT Mindmap Dashboard")
    print(f" Läuft auf: http://{host}:{port}")
    if host == "0.0.0.0":
        print(" Erreichbar von jedem Gerät im lokalen Netzwerk unter")
        print(" http://<IP-des-Geraets>:%d" % port)
    print(" Fenster/Konsole schließen oder STRG+C zum Beenden.")
    print("=" * 60)

    try:
        socketio.run(app, host=host, port=port, allow_unsafe_werkzeug=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

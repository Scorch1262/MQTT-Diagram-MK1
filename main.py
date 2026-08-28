"""
MQTT Mindmap Dashboard
=======================
Startet einen lokalen Webserver und öffnet ihn im Standardbrowser.
Auf der Webseite kann die Adresse eines MQTT-Brokers eingegeben werden;
alle empfangenen Topics/Nachrichten werden anschließend als sich selbst
erweiternde Mindmap dargestellt. Neu eingehende Nachrichten wandern als
Marker den jeweiligen Ast entlang zum Broker-Knoten.

Dieses Skript ist der Einstiegspunkt für PyInstaller (main.py -> .exe / .app).
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


def find_free_port(preferred: int = 5000) -> int:
    for port in range(preferred, preferred + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return preferred


def main():
    host = "127.0.0.1"
    port = find_free_port(5000)
    url = f"http://{host}:{port}"

    app = create_app(resource_path("templates"), resource_path("static"))

    def open_browser():
        time.sleep(1.0)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()

    print("=" * 60)
    print(" MQTT Mindmap Dashboard")
    print(f" Läuft auf: {url}")
    print(" Fenster/Konsole schließen oder STRG+C zum Beenden.")
    print("=" * 60)

    try:
        socketio.run(app, host=host, port=port, allow_unsafe_werkzeug=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

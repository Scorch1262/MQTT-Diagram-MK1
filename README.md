# MQTT Mindmap Dashboard

Ein kleines Python-Programm, das einen lokalen Webserver startet und im
Browser eine **live wachsende Mindmap/Baumansicht** aller Topics und
Nachrichten eines MQTT-Brokers anzeigt.

- Adresse (Host/Port), Topic-Filter, optionale Zugangsdaten und TLS werden
  direkt auf der Webseite eingegeben.
- Jeder `/`-getrennte Topic-Abschnitt wird zu einem Ast im Baum; der Baum
  ergänzt sich automatisch um neue Knoten, sobald neue Topics auftauchen.
- Jede eingehende Nachricht wird als kleiner **Marker** dargestellt, der
  vom betroffenen Topic-Knoten den Ast entlang zum zentralen
  **Broker-Knoten** wandert.
- Klick auf einen Knoten zeigt Details (Topic, Payload, QoS, Retain,
  Anzahl, Zeitstempel) an; zusätzlich gibt es einen Nachrichtenverlauf und
  eine Suchfunktion zum Hervorheben passender Topics.

## Lokal starten (Entwicklung)

```bash
pip install -r requirements.txt
python main.py
```

Der Browser öffnet sich automatisch auf `http://127.0.0.1:5000`
(oder einen freien Port in der Nähe, falls 5000 belegt ist).

## Struktur

```
main.py            Einstiegspunkt (Server starten, Browser öffnen)
server.py           Flask + SocketIO App, Routen & Events
mqtt_manager.py      MQTT-Verbindung, Themenbaum, Nachrichtenverarbeitung
templates/index.html Weboberfläche
static/css/style.css Design
static/js/app.js     D3-Mindmap, Live-Updates, Marker-Animation
static/js/d3.v7.min.js, static/js/socket.io.min.js
                      Lokal mitgelieferte Bibliotheken (funktioniert offline)
mqtt_dashboard.spec  PyInstaller-Spezifikation (Windows + macOS)
packaging/macos/launch_in_terminal.sh
                      Wrapper, der beim macOS-Start ein sichtbares
                      Terminal-Fenster öffnet (zum leichten Beenden)
.github/workflows/build.yml
                      GitHub-Actions-Workflow: baut .exe (Windows) und
                      .app (macOS) und lädt sie als Artefakte/Release hoch
```

## Als .exe / .app bauen

### Automatisch über GitHub Actions

1. Repository auf GitHub pushen (inkl. `.github/workflows/build.yml`).
2. Unter dem Reiter **Actions** läuft der Workflow automatisch bei jedem
   Push, oder manuell über **Run workflow** starten.
3. Die fertigen Artefakte (`MQTT-Mindmap-Dashboard-windows`,
   `MQTT-Mindmap-Dashboard-macos`) stehen danach im Workflow-Lauf zum
   Download bereit. Bei einem Tag wie `v1.0.0` werden sie zusätzlich als
   GitHub-Release veröffentlicht.

### Manuell / lokal

```bash
pip install -r requirements.txt pyinstaller
pyinstaller mqtt_dashboard.spec --clean --noconfirm
```

- Windows: `dist/MQTT-Mindmap-Dashboard.exe`
- macOS: `dist/MQTT-Mindmap-Dashboard.app`

## Anwendung beenden

- **Windows:** Beim Start öffnet sich automatisch ein Konsolenfenster.
  Einfach schließen oder STRG+C drücken.
- **macOS:** Beim Start öffnet sich automatisch ein **Terminal-Fenster**,
  in dem das Programm läuft (technisch: ein kleiner Wrapper startet die
  eigentliche Anwendung sichtbar in Terminal.app – macOS-Apps zeigen
  Konsolenausgaben sonst nur versteckt im `Console.app`-Log an). Zum
  Beenden im Terminal-Fenster STRG+C drücken oder das Fenster schließen.

## Hinweise

- Es wird `paho-mqtt` 1.6.1 verwendet (stabile Callback-Signatur ohne
  zusätzliche `reason_code`/`properties`-Parameter wie in 2.x).
- Der SocketIO-Server läuft im `threading`-Modus (kein `eventlet`/`gevent`),
  das macht das Einfrieren mit PyInstaller deutlich robuster.
- D3.js und der Socket.IO-Client liegen lokal unter `static/js/`, die
  Anwendung benötigt daher **keine Internetverbindung**, um die
  Oberfläche zu laden – nur die Verbindung zum MQTT-Broker selbst braucht
  Netzwerkzugriff.
- macOS-Builds sind nicht signiert/notarisiert; beim ersten Start ggf.
  über Rechtsklick → „Öffnen“ bestätigen (Gatekeeper-Warnung).

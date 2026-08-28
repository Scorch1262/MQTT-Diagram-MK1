# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/),
die Versionierung an [Semantic Versioning](https://semver.org/lang/de/).

## [1.3.0] – 2026-08-28

### Hinzugefügt
- `main.py` unterstützt jetzt Umgebungsvariablen für den headless-Betrieb
  (z.B. auf OpenWrt-Routern): `DASHBOARD_HOST` (Bindung, z.B. `0.0.0.0`
  für Netzwerkzugriff), `DASHBOARD_PORT` (fester Port statt automatischer
  Suche) und `DASHBOARD_OPEN_BROWSER=0` (kein automatisches Browser-Öffnen
  auf Geräten ohne grafische Oberfläche).
- Neue Anleitung `docs/INSTALL_GL-MT2500A.md`: detaillierte
  Installationsschritte für den Betrieb auf einem GL.iNet Brume 2
  (GL-MT2500A) inkl. Autostart über ein OpenWrt-Init-Skript (procd).

## [1.2.0] – 2026-08-28

### Hinzugefügt
- macOS: Beim Start der `.app` öffnet sich jetzt automatisch ein
  sichtbares **Terminal-Fenster**, in dem das Programm läuft. Grund:
  macOS zeigt Konsolenausgaben von App-Bundles sonst nicht sichtbar an,
  wodurch die Anwendung nur über die Aktivitätsanzeige zu beenden war.
  Jetzt reicht STRG+C oder das Schließen des Terminal-Fensters.
- Neue Datei `packaging/macos/launch_in_terminal.sh`: kleines
  Wrapper-Skript, das im GitHub-Actions-Workflow anstelle der eigentlichen
  Binärdatei in `Contents/MacOS/` eingesetzt wird und per AppleScript ein
  Terminal-Fenster mit der eigentlichen Anwendung öffnet.

## [1.1.0] – 2026-08-28

### Geändert
- Layout von horizontalem Baum auf **radiales Layout** umgestellt: alle
  Zweige breiten sich sternförmig in alle Richtungen vom Broker-Knoten
  (Wurzel, jetzt in der Bildschirmmitte) aus.
- Jeder Hauptzweig (1. Ebene unter dem Broker) erhält automatisch eine
  eigene, konsistente Farbe (`d3.interpolateRainbow`); alle Unterknoten
  eines Zweigs übernehmen dessen Farbe mit leichter Aufhellung nach Tiefe.
  Äste (Linien) sind entsprechend in der Farbe ihres Zielknotens gefärbt.

### Behoben
- CSS-Regeln für ausgewählte/gesuchte Knoten (`selected`, `highlight`)
  nutzen jetzt `!important`, damit sie die pro Zweig dynamisch gesetzte
  Füllfarbe (Inline-Style) korrekt überschreiben.

## [1.0.0] – 2026-08-28

### Hinzugefügt
- Erste Version: lokaler Webserver (Flask + SocketIO) mit MQTT-Anbindung
  (paho-mqtt), der eingehende Topics/Nachrichten als wachsende
  D3-Mindmap (horizontaler Baum) darstellt.
- Marker-Animation: neue Nachrichten wandern vom betroffenen Topic-Knoten
  den Ast entlang zum Broker-Knoten.
- Detailanzeige (Topic, Payload, QoS, Retain, Zähler, Zeitstempel),
  Nachrichtenverlauf, Such-/Hervorhebungsfunktion, Zoom/Pan.
- PyInstaller-Spezifikation sowie GitHub-Actions-Workflow zum Bauen von
  Windows-`.exe` und macOS-`.app`.

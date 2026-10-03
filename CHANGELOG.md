# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/),
die Versionierung an [Semantic Versioning](https://semver.org/lang/de/).

## [1.5.0] – 2026-10-03

### Hinzugefügt
- Neue **Ring-Ansicht** als Alternative zur bisherigen radialen Mindmap,
  umschaltbar über zwei Buttons ("Mindmap" / "Ring") oben links im
  Diagramm-Werkzeugkasten. Vorbild ist die Canvas-Ring-Darstellung aus
  MQTT-Monitor-Dashboard-MK1: der Broker sitzt als Kreis in der Mitte,
  alle aktuell bekannten Topics (Blätter des Themenbaums) werden als
  Knoten auf einem Ring darum herum angeordnet und per Linie mit dem
  Broker verbunden. Bei jeder neuen Nachricht pulsiert die betroffene
  Verbindungslinie sowie der Topic- und der Broker-Knoten kurz amberfarben
  auf.
- Die Ring-Ansicht teilt sich Daten, Farblogik (`colorFor`/
  `updateBranchColorScale`) und die Suchfunktion mit der Mindmap-Ansicht:
  Klick auf einen Topic-Knoten öffnet dieselbe Detailanzeige, die
  Topic-Suche blendet nicht passende Knoten ab.
- **Hinweis zum Funktionsumfang:** Anders als im Vorbild gibt es in der
  Ring-Ansicht keinen separaten Client-Ring. Dieses Programm verbindet
  sich als reiner Abonnent mit einem beliebigen externen MQTT-Broker und
  kennt daher – im Gegensatz zum eingebetteten Broker im Vorbild-Projekt –
  grundsätzlich keine einzelnen Client-IDs der Publisher. Die Ring-Ansicht
  zeigt deshalb Broker und Topics, aber keine Clients.

### Behoben
- Beim Umschalten zwischen den beiden Ansichten blieb die SVG-Mindmap
  bisher sichtbar, obwohl sie per `.hidden`-Property ausgeblendet werden
  sollte: Bei `<svg>`-Elementen wird diese Property von Chromium nicht
  zuverlässig auf das HTML-Attribut zurückgespiegelt. Die Sichtbarkeit
  wird jetzt stattdessen über eine CSS-Klasse (`view-hidden`) gesteuert.

## [1.4.0] – 2026-08-28

### Hinzugefügt
- Ast-Dicke im Mindmap-Diagramm ist jetzt abhängig von der Anzahl der
  Sub-Topics, die von einem Knoten abzweigen: Äste zu Knoten mit vielen
  (verschachtelten) Unterknoten werden dicker gezeichnet als Äste zu
  einzelnen Blatt-Topics. Skalierung erfolgt mit einer Quadratwurzel-Skala
  (`d3.scaleSqrt`, Bereich 1,6–10 px), damit auch sehr große Zweige die
  kleinen nicht optisch verschwinden lassen.

## [1.3.1] – 2026-08-28

### Behoben
- `main.py` importierte `webbrowser` bisher fest auf Modulebene. Auf
  schlanken OpenWrt-/Router-Python-Installationen (z.B. GL.iNet Brume 2),
  wo `opkg` die Standardbibliothek in viele Einzelpakete aufteilt und
  `webbrowser` fehlt, führte das selbst bei `DASHBOARD_OPEN_BROWSER=0`
  zu einem `ModuleNotFoundError` beim Start. Der Import erfolgt jetzt
  lokal innerhalb der Browser-Öffnen-Funktion und ist zusätzlich per
  `try/except` abgesichert – ein fehlendes Modul verhindert den Start
  nicht mehr.

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

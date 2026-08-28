# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/),
die Versionierung an [Semantic Versioning](https://semver.org/lang/de/).

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

#!/bin/bash
# Wird als Contents/MacOS/MQTT-Mindmap-Dashboard in das .app-Bundle eingesetzt
# (ersetzt die eigentliche, von PyInstaller gebaute Binärdatei an dieser Stelle).
# Zweck: Beim Doppelklick auf die .app öffnet sich normalerweise KEIN
# sichtbares Terminal-Fenster (macOS zeigt Konsolenausgaben sonst nur im
# Log/Console.app an). Dieses kleine Skript öffnet stattdessen aktiv ein
# Terminal-Fenster und startet darin das eigentliche Programm, sodass es
# sich bequem per STRG+C oder durch Schließen des Fensters beenden lässt.
#
# Das echte, kompilierte Programm liegt daneben als
# "MQTT-Mindmap-Dashboard-bin".

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$DIR/MQTT-Mindmap-Dashboard-bin"

osascript -e "tell application \"Terminal\"" \
          -e "activate" \
          -e "do script (quoted form of \"$BIN\")" \
          -e "end tell"

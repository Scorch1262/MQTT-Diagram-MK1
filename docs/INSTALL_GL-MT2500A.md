# MQTT Mindmap Dashboard auf dem GL.iNet Brume 2 (GL-MT2500A) installieren

Diese Anleitung installiert das Dashboard **nativ** (ohne Docker) direkt im
OpenWrt-Betriebssystem des Brume 2 und richtet einen Autostart per
Init-Skript (`procd`) ein, sodass das Dashboard nach jedem Neustart des
Routers automatisch läuft.

## Warum kein Docker?

Der Brume 2 hat nur **1 GB RAM**. Docker lässt sich zwar manuell per `opkg`
nachrüsten, frisst aber selbst schon 50–100 MB RAM und zusätzlich Flash für
Images. Da alle Python-Abhängigkeiten dieses Projekts (Flask, Flask-SocketIO,
paho-mqtt, …) **reiner Python-Code ohne Compiler-Anforderungen** sind, lässt
sich das Dashboard direkt und deutlich sparsamer mit `opkg`/`pip3` installieren.

## Voraussetzungen

- Brume 2 mit aktueller GL.iNet-Firmware (OpenWrt 21.02-Basis), per LAN-Kabel
  mit deinem PC verbunden.
- Der Brume 2 hat **Internetzugang** (WAN-Port angeschlossen), da für die
  Installation Pakete aus dem Internet geladen werden.
- SSH-Zugriff aktiviert (Standard bei GL.iNet-Firmware): Admin-Oberfläche
  unter `http://192.168.8.1` → **Mehr Einstellungen → SSH** ist i.d.R.
  bereits aktiv; Login-Daten sind dieselben wie für die Weboberfläche.

## 1. Per SSH auf den Router verbinden

```bash
ssh root@192.168.8.1
```

Passwort eingeben (das Admin-Passwort der GL.iNet-Weboberfläche).

## 2. System prüfen und Paketlisten aktualisieren

```sh
cat /etc/openwrt_release       # Firmware-Version zur Kontrolle
df -h /overlay                 # freien Speicherplatz prüfen (mehrere GB frei)
opkg update
```

## 3. Python 3 und pip installieren

```sh
opkg install python3 python3-pip python3-light ca-bundle ca-certificates
```

Falls `python3-pip` in den GL.iNet-Feeds nicht gefunden wird (kommt bei
älteren Firmware-Ständen vor), pip alternativ per Bootstrap-Skript
nachrüsten:

```sh
opkg install python3
cd /tmp
wget https://bootstrap.pypa.io/pip/3.9/get-pip.py   # Python-Version anpassen, siehe unten
python3 get-pip.py
```

Python-Version herausfinden mit `python3 --version`, dann bei Bedarf im
`get-pip.py`-Link die passende Version (z.B. `3.10`) verwenden.

## 4. Projektdateien auf den Router kopieren

Am einfachsten von deinem PC/Mac aus per `scp` (im Ordner, der den
`mqtt-dashboard`-Projektordner enthält, ausführen):

```bash
scp -r mqtt-dashboard root@192.168.8.1:/root/
```

Alternativ, falls der Router direkten Internetzugriff auf dein Git-Repository
hat, per `git clone` oder `wget` auf dem Router selbst.

## 5. Python-Abhängigkeiten installieren

Auf dem Router (per SSH):

```sh
cd /root/mqtt-dashboard
pip3 install -r requirements.txt
```

Das dauert je nach Internetverbindung 1–3 Minuten. Da alle Pakete reine
Python-Wheels sind, ist kein Compiler nötig.

**Kurzer Funktionstest** (Strg+C zum Beenden):

```sh
DASHBOARD_HOST=0.0.0.0 DASHBOARD_PORT=5000 DASHBOARD_OPEN_BROWSER=0 python3 main.py
```

Jetzt von einem beliebigen Gerät im LAN des Brume 2 im Browser
`http://192.168.8.1:5000` aufrufen (IP ggf. anpassen, falls du die
Router-IP geändert hast) – das Dashboard sollte erscheinen. Mit `Strg+C`
den Test wieder beenden.

> **Wichtig:** `DASHBOARD_HOST=0.0.0.0` sorgt dafür, dass das Dashboard von
> jedem Gerät im LAN erreichbar ist (nicht nur vom Router selbst).
> `DASHBOARD_OPEN_BROWSER=0` verhindert den (auf einem Router ohnehin
> zwecklosen) Versuch, einen Browser zu öffnen.

## 6. Autostart per Init-Skript (procd) einrichten

Datei `/etc/init.d/mqttdashboard` mit folgendem Inhalt anlegen:

```sh
cat > /etc/init.d/mqttdashboard << 'EOF'
#!/bin/sh /etc/rc.common

START=99
STOP=10
USE_PROCD=1

PROG=/usr/bin/python3
APP_DIR=/root/mqtt-dashboard

start_service() {
    procd_open_instance
    procd_set_param command "$PROG" "$APP_DIR/main.py"
    procd_set_param env DASHBOARD_HOST=0.0.0.0 DASHBOARD_PORT=5000 DASHBOARD_OPEN_BROWSER=0
    procd_set_param respawn 3600 5 5
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_set_param pidfile /var/run/mqttdashboard.pid
    procd_close_instance
}

stop_service() {
    :
}
EOF
chmod +x /etc/init.d/mqttdashboard
```

Dienst aktivieren (Autostart beim Booten) und sofort starten:

```sh
/etc/init.d/mqttdashboard enable
/etc/init.d/mqttdashboard start
```

`respawn 3600 5 5` sorgt dafür, dass `procd` das Dashboard automatisch neu
startet, falls es einmal abstürzen sollte.

## 7. Prüfen, ob alles läuft

```sh
ps | grep main.py                 # Prozess sollte laufen
netstat -tlnp | grep 5000         # Port 5000 sollte lauschen (ggf. "ss -tlnp" statt netstat)
logread | grep mqttdashboard      # Log-Ausgaben ansehen
```

Im Browser (von einem Gerät im LAN des Routers):
`http://192.168.8.1:5000`

## 8. Autostart testen

```sh
reboot
```

Nach dem Neustart (ca. 1 Minute warten) erneut `http://192.168.8.1:5000`
aufrufen – das Dashboard sollte ohne weiteres Zutun automatisch laufen.

## Dienst verwalten

```sh
/etc/init.d/mqttdashboard stop      # anhalten
/etc/init.d/mqttdashboard restart   # neu starten (z.B. nach Code-Update)
/etc/init.d/mqttdashboard disable   # Autostart deaktivieren
```

## Aktualisieren (nach Code-Änderungen)

```bash
# vom PC aus, überschreibt die Projektdateien auf dem Router
scp -r mqtt-dashboard root@192.168.8.1:/root/
```

```sh
# auf dem Router
cd /root/mqtt-dashboard
pip3 install -r requirements.txt   # falls sich requirements.txt geändert hat
/etc/init.d/mqttdashboard restart
```

## Hinweise zur Netzwerktopologie

Der Brume 2 hat **kein WLAN** – Geräte müssen entweder direkt per Kabel am
LAN-Port hängen oder über einen nachgeschalteten Switch/Access Point mit dem
LAN des Brume 2 verbunden sein. Das Dashboard ist standardmäßig nur im LAN
erreichbar (nicht über WAN) – für die Sicherheit von Vorteil, da so niemand
von außen auf das Dashboard oder den MQTT-Broker zugreifen kann.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| `pip3: not found` | Schritt 3 wiederholen bzw. `get-pip.py`-Fallback nutzen |
| `ModuleNotFoundError` beim Start | `pip3 install -r requirements.txt` erneut ausführen, Internetverbindung des Routers prüfen |
| `ModuleNotFoundError: No module named 'xyz'` bei einem **Standardbibliotheks**-Modul (nicht aus `requirements.txt`) | OpenWrt teilt Python 3 in viele Einzelpakete auf. Mit `opkg list \| grep python3-` nach einem passenden Paket suchen (z.B. `opkg install python3-xyz`) und installieren. Ab Version 1.3.1 ist `webbrowser` bereits kein Problem mehr. |
| Dashboard nach Reboot nicht erreichbar | `/etc/init.d/mqttdashboard enable` erneut ausführen, `logread \| grep mqttdashboard` auf Fehler prüfen |
| Kein Speicherplatz mehr | `df -h /overlay`; ggf. `opkg clean`/nicht benötigte Pakete entfernen |
| Verbindung zum MQTT-Broker schlägt fehl | Erreichbarkeit des Brokers vom Router aus mit `ping <broker-ip>` testen; Firewall-Regeln des Brokers prüfen |

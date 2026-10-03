# MQTT Mindmap Dashboard auf dem GL.iNet Brume 2 (GL-MT2500A)

Vollständige Anleitung: Installation, Autostart per OpenWrt-Init-Skript und
Fehlerbehebung. Diese Version fasst alle Schritte inkl. der in der Praxis
aufgetretenen Stolpersteine (SFTP, PQ-Warnung, fehlendes `webbrowser`-Modul)
an einem Ort zusammen.

## Geräte-Eckdaten

MediaTek MT7981B (Filogic 820), Dual-Core ARM Cortex-A53 @ 1,3 GHz,
**1 GB RAM**, 8 GB eMMC, OpenWrt 21.02-Basis, **kein WLAN** (nur 1× LAN,
1× WAN, USB 3.0).

## Warum keine Docker-Installation?

Der Brume 2 hat nur 1 GB RAM. Docker lässt sich zwar manuell per `opkg`
nachrüsten, frisst aber selbst schon 50–100 MB RAM zusätzlich zu Flash für
Images. Da alle Python-Abhängigkeiten dieses Projekts (Flask, Flask-SocketIO,
paho-mqtt, …) **reiner Python-Code ohne Compiler-Anforderungen** sind, lässt
sich das Dashboard direkt und deutlich sparsamer mit `opkg`/`pip3`
installieren.

## Voraussetzungen

- Brume 2 mit aktueller GL.iNet-Firmware, per LAN-Kabel mit deinem PC/Mac
  verbunden.
- Der Brume 2 hat **Internetzugang** (WAN-Port angeschlossen) – für die
  Installation werden Pakete aus dem Internet geladen.
- SSH-Zugriff aktiviert (bei GL.iNet-Firmware i.d.R. bereits Standard):
  Admin-Oberfläche unter `http://192.168.8.1` (bzw. deiner konfigurierten
  LAN-IP) → **Mehr Einstellungen → SSH**. Login-Daten sind dieselben wie für
  die Weboberfläche.

---

## 1. Per SSH auf den Router verbinden

```bash
ssh root@192.168.8.1
```

Passwort eingeben (Admin-Passwort der GL.iNet-Weboberfläche).

> **Hinweis „WARNING: connection is not using a post-quantum key exchange…“**
> Das ist keine Fehlermeldung, sondern nur eine informative Warnung
> moderner SSH-Clients (macOS/OpenSSH 9.x+), weil der ältere SSH-Server des
> Routers noch keine quantensicheren Schlüsselaustausch-Verfahren
> unterstützt. Für eine Verbindung zum eigenen Heim-Router im lokalen Netz
> ist das unbedenklich – einfach ignorieren, die Verbindung funktioniert
> normal.

## 2. System prüfen und Paketlisten aktualisieren

```sh
cat /etc/openwrt_release       # Firmware-Version zur Kontrolle
df -h /overlay                 # freien Speicherplatz prüfen
opkg update
```

## 3. Python 3 und pip installieren

```sh
opkg install python3 python3-pip python3-light ca-bundle ca-certificates
```

Falls `python3-pip` in den GL.iNet-Feeds nicht gefunden wird:

```sh
opkg install python3
cd /tmp
wget https://bootstrap.pypa.io/pip/3.9/get-pip.py   # Python-Version anpassen
python3 get-pip.py
```

Python-Version mit `python3 --version` prüfen und ggf. im `get-pip.py`-Link
die passende Version (z.B. `3.10`) verwenden.

## 4. Projektdateien auf den Router kopieren

Von deinem PC/Mac aus, im Ordner, der den `mqtt-dashboard`-Projektordner
enthält:

```bash
scp -O -r mqtt-dashboard root@192.168.8.1:/root/
```

> **Warum `-O`?** Moderne `scp`-Versionen (macOS/OpenSSH 9.x) nutzen
> standardmäßig das SFTP-Protokoll. Auf dem Router fehlt dafür aber meist
> das `sftp-server`-Binary, was zu folgendem Fehler führt:
> ```
> ash: /usr/libexec/sftp-server: not found
> scp: Connection closed
> ```
> Der Schalter `-O` (großes O) erzwingt das klassische SCP-Protokoll, das
> kein `sftp-server` auf dem Router benötigt.
>
> **Alternative** (funktioniert immer, auch ohne `-O`):
> ```bash
> tar czf - -C /Pfad/zum/Elternordner mqtt-dashboard | ssh root@192.168.8.1 "cd /root && tar xzf -"
> ```
> **Permanente Lösung:** `opkg install openssh-sftp-server` auf dem Router,
> dann funktioniert normales `scp` ohne `-O`.

## 5. Python-Abhängigkeiten installieren

Auf dem Router (per SSH):

```sh
cd /root/mqtt-dashboard
pip3 install -r requirements.txt
```

Dauert je nach Internetverbindung 1–3 Minuten. Da alle Pakete reine
Python-Wheels sind, ist kein Compiler nötig.

## 6. Funktionstest

```sh
DASHBOARD_HOST=0.0.0.0 DASHBOARD_PORT=5000 DASHBOARD_OPEN_BROWSER=0 python3 main.py
```

- `DASHBOARD_HOST=0.0.0.0` macht das Dashboard für jedes Gerät im LAN
  erreichbar (nicht nur den Router selbst).
- `DASHBOARD_PORT=5000` legt einen festen Port fest.
- `DASHBOARD_OPEN_BROWSER=0` verhindert den (auf einem Router ohnehin
  zwecklosen) Versuch, einen Browser zu öffnen.

Anschließend von einem beliebigen Gerät im LAN des Brume 2 im Browser
`http://192.168.8.1:5000` aufrufen (IP ggf. anpassen) – das Dashboard
sollte erscheinen. Mit `Strg+C` den Test beenden.

> Ab Programmversion **1.3.1** ist der Import des (auf schlanken
> OpenWrt-Python-Installationen oft fehlenden) `webbrowser`-Moduls
> abgesichert; bei älteren Ständen kann hier ein
> `ModuleNotFoundError: No module named 'webbrowser'` auftreten –
> siehe Fehlerbehebung unten.

## 7. Autostart per Init-Skript (procd) einrichten

Datei `/etc/init.d/mqttdashboard` anlegen:

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

Autostart aktivieren und Dienst sofort starten:

```sh
/etc/init.d/mqttdashboard enable
/etc/init.d/mqttdashboard start
```

`respawn 3600 5 5` sorgt dafür, dass `procd` das Dashboard automatisch neu
startet, falls es einmal abstürzen sollte.

## 8. Prüfen, ob alles läuft

```sh
ps | grep main.py                 # Prozess sollte laufen
netstat -tlnp | grep 5000         # Port 5000 sollte lauschen (ggf. "ss -tlnp")
logread | grep mqttdashboard      # Log-Ausgaben ansehen
service mqttdashboard status      # procd-Status
```

Im Browser (von einem Gerät im LAN des Routers): `http://192.168.8.1:5000`

**Falls kein Prozess läuft / kein Port offen ist:** zuerst den manuellen
Test aus Schritt 6 wiederholen, um den tatsächlichen Fehler zu sehen –
`procd` verschluckt Startfehler oft stillschweigend.

## 9. Autostart testen

```sh
reboot
```

Nach dem Neustart (ca. 1 Minute warten) erneut `http://192.168.8.1:5000`
aufrufen – das Dashboard sollte ohne weiteres Zutun automatisch laufen.

---

## Dienst verwalten

```sh
/etc/init.d/mqttdashboard stop      # anhalten
/etc/init.d/mqttdashboard restart   # neu starten (z.B. nach Code-Update)
/etc/init.d/mqttdashboard disable   # Autostart deaktivieren
```

## Aktualisieren (nach Code-Änderungen)

```bash
# vom PC aus, überschreibt die Projektdateien auf dem Router
scp -O -r mqtt-dashboard root@192.168.8.1:/root/
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
erreichbar (nicht über WAN) – von Vorteil für die Sicherheit, da niemand von
außen auf das Dashboard oder den MQTT-Broker zugreifen kann.

---

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| `WARNING: connection is not using a post-quantum key exchange…` beim SSH-Login | Reine Info-Warnung, unbedenklich im Heimnetz – ignorieren. |
| `ash: /usr/libexec/sftp-server: not found` / `scp: Connection closed` beim Kopieren | `scp -O -r …` verwenden (erzwingt klassisches SCP-Protokoll) oder `tar`-über-SSH-Alternative nutzen. Dauerhaft: `opkg install openssh-sftp-server`. |
| `pip3: not found` | Schritt 3 wiederholen bzw. `get-pip.py`-Fallback nutzen. |
| `ModuleNotFoundError: No module named 'webbrowser'` beim Start | Betrifft Programmversionen vor 1.3.1. Update auf 1.3.1+ einspielen (`main.py` ersetzen), dort ist der Import abgesichert. |
| `ModuleNotFoundError` für ein anderes **Standardbibliotheks**-Modul (nicht aus `requirements.txt`) | OpenWrt teilt Python 3 in viele Einzelpakete auf. Mit `opkg list \| grep python3-` nach einem passenden Paket suchen und installieren (z.B. `opkg install python3-xyz`). |
| `ModuleNotFoundError` für ein Paket **aus** `requirements.txt` (Flask, paho-mqtt, …) | `pip3 install -r requirements.txt` erneut ausführen, Internetverbindung des Routers prüfen. |
| Dienst startet nicht, `ps`/`netstat` zeigen nichts | Manuellen Test (Schritt 6) ausführen, um den echten Fehler zu sehen – `procd` protokolliert Startfehler oft nur unzureichend. Danach `logread \| grep mqttdashboard` prüfen. |
| Falscher Python-Pfad im Init-Skript | `which python3` prüfen; Ergebnis ggf. als `PROG=` im Init-Skript eintragen. |
| Dashboard nach Reboot nicht erreichbar | `/etc/init.d/mqttdashboard enable` erneut ausführen, `logread \| grep mqttdashboard` auf Fehler prüfen. |
| Kein Speicherplatz mehr | `df -h /overlay`; ggf. `opkg clean` / nicht benötigte Pakete entfernen. |
| Verbindung zum MQTT-Broker schlägt fehl | Erreichbarkeit des Brokers vom Router aus mit `ping <broker-ip>` testen; Firewall-Regeln des Brokers prüfen. |

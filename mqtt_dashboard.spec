# -*- mode: python ; coding: utf-8 -*-
# PyInstaller-Spezifikation für das MQTT Mindmap Dashboard.
# Wird sowohl unter Windows (-> .exe) als auch unter macOS (-> .app) verwendet;
# der Datenpfad-Trenner (":" bzw. ";") ist hier bereits als Tupel angegeben,
# PyInstaller kümmert sich intern selbst um die Plattformunterschiede.

import sys

block_cipher = None

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("templates", "templates"),
        ("static", "static"),
    ],
    hiddenimports=[
        "engineio.async_drivers.threading",
        "paho.mqtt.client",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="MQTT-Mindmap-Dashboard",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

# Unter macOS zusätzlich ein .app-Bundle erzeugen
if sys.platform == "darwin":
    app = BUNDLE(
        exe,
        name="MQTT-Mindmap-Dashboard.app",
        icon=None,
        bundle_identifier="de.mindmap.mqttdashboard",
        info_plist={
            "NSHighResolutionCapable": "True",
            "CFBundleShortVersionString": "1.0.0",
        },
    )

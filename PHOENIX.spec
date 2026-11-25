# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules, copy_metadata

block_cipher = None

datas_list = [
    ('apps/dashboard/dist', 'apps/dashboard/dist'),
    ('apps/dashboard/src/constants/overlayTokens.json', 'constants'),
    ('phoenix_icon.ico', '.'),
    ('phoenix_icon.png', '.'),
    ('apps/local-node/app', 'apps/local-node/app'),
    ('apps/api/app', 'app')
]
binaries_list = []
extra_hidden = []

for pkg in ("keyring", "psutil", "jaraco.classes", "win32ctypes"):
    try:
        d, b, h = collect_all(pkg)
        datas_list += d
        binaries_list += b
        extra_hidden += h
    except Exception:
        pass

try:
    datas_list += copy_metadata("keyring")
except Exception:
    pass

try:
    extra_hidden += collect_submodules("keyring.backends")
except Exception:
    pass

extra_hidden += ["win32ctypes.core", "win32ctypes.pywin32.win32cred", "win32ctypes.pywin32.pywintypes"]

# Explicitly bundle all prompt assets and markdown files from agents package
site_packages = os.path.abspath('apps/api/.venv/Lib/site-packages')
agents_pkg_dir = os.path.join(site_packages, 'agents')
if os.path.exists(agents_pkg_dir):
    datas_list.append((agents_pkg_dir, 'agents'))

for pkg in ['agents', 'mcp', 'edge_tts']:
    try:
        datas_list += collect_data_files(pkg)
    except Exception:
        pass

for pkg in ['mcp', 'openai-agents', 'edge-tts', 'pydantic', 'fastapi']:
    try:
        datas_list += copy_metadata(pkg)
    except Exception:
        pass

a = Analysis(
    ['desktop_launcher.py'],
    pathex=[
        os.path.abspath('.'),
        os.path.abspath('apps/api')
    ],
    binaries=binaries_list,
    datas=datas_list,
    hiddenimports=[
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespans',
        'uvicorn.lifespans.on',
        'fastapi',
        'fastapi.staticfiles',
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'webview',
        'webview.platforms.winforms',
        'webview.platforms.edgechromium',
        'clr',
        'pythonnet',
        'edge_tts',
        'httpx',
        'app.tts',
        'app.tts.adapter',
        'app.agents.jarvis',
        'app.agents.planner',
        'agents',
        'mcp'
    ] + extra_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'unittest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='PHOENIX',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='phoenix_icon.ico'
)

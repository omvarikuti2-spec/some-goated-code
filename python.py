#!/usr/bin/env python3
"""One-command launcher for Crypto Paper Trading app.

Usage:
  python python.py

This starts:
  1) FastAPI backend at http://127.0.0.1:8001
  2) Vite frontend at http://127.0.0.1:5173

Make sure dependencies are installed first.
"""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE / "backend"
FRONTEND_DIR = HERE / "frontend"

backend_proc = None
frontend_proc = None


def check_command(cmd):
    from shutil import which
    if which(cmd) is None:
        print(f"ERROR: '{cmd}' is not installed or not on PATH.")
        sys.exit(1)


def spawn(command, cwd):
    return subprocess.Popen(
        command,
        cwd=str(cwd),
        shell=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def stream_output(proc, name):
    if proc is None or proc.stdout is None:
        return
    for line in proc.stdout:
        if line is None:
            break
        print(f"[{name}] {line.rstrip()}")


def cleanup(*procs):
    for p in procs:
        if p and p.poll() is None:
            try:
                p.send_signal(signal.SIGINT)
            except Exception:
                pass
            try:
                p.kill()
            except Exception:
                pass


def venv_python():
    venv_dir = HERE / ".venv"
    bin_dir = venv_dir / "bin"
    py_exe = bin_dir / "python"

    if not py_exe.exists():
        print("Creating virtual environment in .venv...")
        subprocess.check_call([sys.executable, "-m", "venv", str(venv_dir)])

    return py_exe


def ensure_backend_deps(python_exe):
    print("Ensuring backend dependencies are installed in virtualenv...")
    subprocess.check_call([str(python_exe), "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])
    subprocess.check_call([str(python_exe), "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")])
    subprocess.check_call([str(python_exe), "-m", "pip", "install", "uvicorn"])


def ensure_frontend_deps():
    print("Ensuring frontend dependencies are installed (npm install)...")
    try:
        subprocess.check_call(["npm", "install"], cwd=str(FRONTEND_DIR), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Frontend dependencies ready.")
    except subprocess.CalledProcessError:
        print("WARNING: npm install had issues, but continuing...")



def is_running(url, timeout=3):
    try:
        import urllib.request

        with urllib.request.urlopen(url, timeout=timeout):
            return True
    except Exception:
        return False


def main():
    global backend_proc, frontend_proc

    check_command("python3")
    check_command("npm")

    python_exe = venv_python()
    ensure_backend_deps(python_exe)
    ensure_frontend_deps()

    backend_port = "8978"
    print(f"Starting backend (uvicorn in venv) on port {backend_port}...")
    backend_proc = spawn(
        [
            str(python_exe),
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            backend_port,
            "--log-level",
            "info",
        ],
        HERE,
    )

    print("Starting frontend (npm run dev)...")
    frontend_proc = spawn(["npm", "run", "dev"], FRONTEND_DIR)

    def handle_exit(signum, frame):
        print("\nShutting down processes...")
        cleanup(backend_proc, frontend_proc)
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    # Give backend + frontend a second to start and show logs.
    time.sleep(1)

    import socket

    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    local_ip = get_local_ip()
    backend_port = "8978"

    print("\nCrypto Paper Trading app is starting:")
    print(f"- Backend (localhost): http://127.0.0.1:{backend_port}")
    print(f"- Backend (LAN): http://{local_ip}:{backend_port}")
    print("- Frontend (localhost): http://127.0.0.1:5173")
    print(f"- Frontend (LAN): http://{local_ip}:5173")

    if is_running(f"http://127.0.0.1:{backend_port}/api/portfolio/1"):
        print(f"Backend is up: http://127.0.0.1:{backend_port}/api/portfolio/1")
    else:
        print("Backend not reachable yet. Wait a moment and retry.")

    if is_running("http://127.0.0.1:5173"):
        print("Frontend is up: http://127.0.0.1:5173")
        try:
            import webbrowser

            webbrowser.open("http://127.0.0.1:5173")
            print("Opened frontend in your browser.")
        except Exception:
            print("Frontend ready; open it in your browser.")
    else:
        print("Frontend not reachable yet. Check npm dev output or visit http://127.0.0.1:5173.")

    print("Press Ctrl+C to stop.")

    try:
        while True:
            if backend_proc.poll() is not None:
                print("Backend process exited.")
                break
            if frontend_proc.poll() is not None:
                print("Frontend process exited.")
                break

            # print output lines from each proc non-blocking
            stream_output(backend_proc, "backend")
            stream_output(frontend_proc, "frontend")

            time.sleep(0.1)

    except KeyboardInterrupt:
        handle_exit(None, None)

    finally:
        cleanup(backend_proc, frontend_proc)


if __name__ == "__main__":
    main()

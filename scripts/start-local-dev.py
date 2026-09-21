# -*- coding: utf-8 -*-
"""启动 NCN 本地调试环境（后端 7000 + 前端 7001）

用法：
    python scripts/start-local-dev.py            # 启动两个服务
    python scripts/start-local-dev.py backend    # 只启后端
    python scripts/start-local-dev.py frontend   # 只启前端
    python scripts/start-local-dev.py --status   # 查看端口状态
    python scripts/start-local-dev.py --stop     # 停止两个服务

说明：
- 用 detached 进程启动，不依赖调用方的 shell，会话结束也不会被连带杀死。
- 后端强制 PORT=7000（前端 .env 里 VITE_API_BASE_URL 直连 7000）。
- 日志：.workbuddy/logs/ncn-web-dev.log / ncn-frontend-dev.log
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS = os.path.join(ROOT, '.workbuddy', 'logs')
FALLBACK_LOGS = os.path.join(tempfile.gettempdir(), 'ncn-dev-logs')
os.makedirs(LOGS, exist_ok=True)


def open_log(filename: str):
    """打开日志文件；若被占用（残留句柄）则降级到临时目录。返回 (句柄, 实际路径)"""
    for directory in (LOGS, FALLBACK_LOGS):
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, filename)
        try:
            return open(path, 'w', encoding='utf-8', errors='replace'), path
        except PermissionError:
            continue
    raise RuntimeError(f'无法写入日志文件 {filename}')

SERVICES = {
    'backend': {
        'cwd': os.path.join(ROOT, 'ncn-web'),
        'env': {'PORT': '7000'},
        'port': 7000,
        'log': os.path.join(LOGS, 'ncn-web-dev.log'),
        'marker': 'ncn-web-dev.log',
    },
    'frontend': {
        'cwd': os.path.join(ROOT, 'ncn-frontend'),
        'env': {},
        'port': 7001,
        'log': os.path.join(LOGS, 'ncn-frontend-dev.log'),
        'marker': 'ncn-frontend-dev.log',
    },
}

DETACHED = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP


def port_open(port: int) -> bool:
    try:
        s = socket.create_connection(('127.0.0.1', port), timeout=2)
        s.close()
        return True
    except Exception:
        return False


def pids_on_port(port: int) -> list:
    out = subprocess.run(['netstat', '-ano', '-p', 'TCP'], capture_output=True, text=True).stdout
    pids = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[1].endswith(f':{port}') and parts[3].upper() == 'LISTENING':
            pids.add(parts[4])
    return sorted(pids)


def stop(port: int) -> None:
    for pid in pids_on_port(port):
        # 只杀监听进程本身，不加 /T，避免连带杀掉宿主 shell
        r = subprocess.run(['taskkill', '/PID', pid, '/F'], capture_output=True, text=True)
        print(f'  stop pid={pid}: {(r.stdout or r.stderr).strip()[:100]}')


def start(name: str) -> None:
    svc = SERVICES[name]
    if port_open(svc['port']):
        print(f'[{name}] 端口 {svc["port"]} 已在监听，跳过启动')
        return

    npm = shutil.which('npm') or shutil.which('npm.cmd')
    if not npm:
        print(f'[{name}] 找不到 npm，请确认 Node.js 已安装')
        return

    env = os.environ.copy()
    env.update(svc['env'])
    env['BROWSER'] = 'none'

    log_fh, log_path = open_log(os.path.basename(svc['log']))
    proc = subprocess.Popen(
        [npm, 'run', 'dev'],
        cwd=svc['cwd'],
        env=env,
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        creationflags=DETACHED,
        close_fds=True,
    )
    print(f'[{name}] 已启动 pid={proc.pid}，日志 {log_path}')


def wait_ready(name: str, timeout: int = 90) -> bool:
    svc = SERVICES[name]
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(svc['port']):
            return True
        time.sleep(2)
    return False


def main() -> None:
    args = [a for a in sys.argv[1:]]

    if '--status' in args:
        for name, svc in SERVICES.items():
            print(f'{name}: {svc["port"]} -> {"LISTENING" if port_open(svc["port"]) else "DOWN"}')
        return

    if '--stop' in args:
        for name, svc in SERVICES.items():
            print(f'停止 {name} ({svc["port"]}):')
            stop(svc['port'])
        return

    targets = [a for a in args if a in SERVICES] or list(SERVICES.keys())
    for name in targets:
        start(name)
    for name in targets:
        ok = wait_ready(name)
        print(f'[{name}] {"就绪" if ok else "启动超时，请查看日志"} (port {SERVICES[name]["port"]})')

    print('\n前端入口: http://localhost:7001')


if __name__ == '__main__':
    main()

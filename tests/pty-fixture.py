import os, sys, pty, select, json, struct, fcntl, termios, signal

root = sys.argv[1]
pid, fd = pty.fork()
if pid == 0:
    os.chdir(root)
    os.environ.update(HOME=root, HISTFILE='/dev/null', TERM='xterm-256color', COLORTERM='truecolor', PS1='quay-test$ ', PROMPT_COMMAND='', LC_ALL='C.UTF-8', SCREENDIR=os.path.join(root, 'screen'))
    os.execvpe('/bin/bash', ['bash', '--noprofile', '--norc'], os.environ)

def stop(*_):
    try: os.kill(pid, signal.SIGHUP)
    except ProcessLookupError: pass
    sys.exit(0)

signal.signal(signal.SIGTERM, stop)
controls = b''
try:
    while True:
        readable, _, _ = select.select([fd, 0, 3], [], [])
        if fd in readable:
            try: data = os.read(fd, 65536)
            except OSError: break
            if not data: break
            os.write(1, data)
        if 0 in readable:
            data = os.read(0, 65536)
            if not data: break
            os.write(fd, data)
        if 3 in readable:
            data = os.read(3, 4096)
            if not data: break
            controls += data
            while b'\n' in controls:
                line, controls = controls.split(b'\n', 1)
                size = json.loads(line)
                fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', size['rows'], size['cols'], 0, 0))
finally:
    stop()

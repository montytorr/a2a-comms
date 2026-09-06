#!/usr/bin/env python3
"""Resolve an opt-in local Supabase keyset into the private deployment env file."""
import os
from pathlib import Path
import tempfile

def read_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines()
                if '=' in line and not line.lstrip().startswith('#'))

def sync(target):
    values = read_env(target)
    source = values.get('SUPABASE_STACK_ENV')
    if not source:
        return False
    stack = read_env(Path(source))
    keys = {'NEXT_PUBLIC_SUPABASE_URL': stack.get('SUPABASE_PUBLIC_URL'),
            'NEXT_PUBLIC_SUPABASE_ANON_KEY': stack.get('ANON_KEY'),
            'SUPABASE_SERVICE_ROLE_KEY': stack.get('SERVICE_ROLE_KEY')}
    if not all(keys.values()):
        raise ValueError('Local stack URL or keys are missing')
    lines = target.read_text().splitlines()
    lines = [line for line in lines if line.split('=', 1)[0] not in keys]
    lines += [key + '=' + value for key, value in keys.items()]
    stat = target.stat()
    fd, temporary = tempfile.mkstemp(prefix='.supabase-env-', dir=target.parent)
    try:
        os.fchmod(fd, stat.st_mode & 0o777)
        os.fchown(fd, stat.st_uid, stat.st_gid)
        with os.fdopen(fd, 'w') as stream:
            stream.write('\n'.join(lines) + '\n')
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
    return True

if __name__ == '__main__':
    if sync(Path('.env')): print('Local Supabase deployment environment synchronized')

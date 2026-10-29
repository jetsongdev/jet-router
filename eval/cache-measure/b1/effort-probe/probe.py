import os
import sys

if sys.argv[1] == 'arm':
    print(os.environ['EFFORT_PROBE_ARM'])
else:
    with open(os.environ['EFFORT_PROBE_LOG'], 'a') as output:
        output.write(sys.stdin.read() + '\n')

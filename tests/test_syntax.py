import py_compile
import sys

for f in ['scripts/generate_badge.py']:
    py_compile.compile(f, doraise=True)
print('Python syntax OK')

js_files = ['service-worker.js', 'functions/index.js', 'scripts/daily_check.js', 'js/modules/push-notifications.js']
for path in js_files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    stack = []
    pairs = {')':'(', '}':'{', ']':'['}
    in_str = None
    escaped = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    while i < len(content):
        c = content[i]
        nxt = content[i+1] if i+1 < len(content) else ''
        if in_line_comment:
            if c == '\n': in_line_comment = False
        elif in_block_comment:
            if c == '*' and nxt == '/':
                in_block_comment = False
                i += 1
        elif in_str:
            if escaped:
                escaped = False
            elif c == '\\':
                escaped = True
            elif c == in_str:
                in_str = None
        else:
            if c == '/' and nxt == '/':
                in_line_comment = True
                i += 1
            elif c == '/' and nxt == '*':
                in_block_comment = True
                i += 1
            elif c in ('"', "'", '`'):
                in_str = c
            elif c in '({[':
                stack.append(c)
            elif c in ')}]':
                if not stack or stack[-1] != pairs[c]:
                    print(f'Error in {path}: mismatched {c} at char {i}')
                    sys.exit(1)
                stack.pop()
        i += 1
    if stack:
        print(f'Error in {path}: unclosed brackets: {stack}')
        sys.exit(1)
    print(f'{path} syntax brackets OK')
print('All syntax checks passed successfully!')

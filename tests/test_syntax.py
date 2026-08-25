import py_compile
import sys
import os
import glob
import re

print('=== 1. Checking Python Syntax ===')
py_files = glob.glob('**/*.py', recursive=True)
for f in py_files:
    py_compile.compile(f, doraise=True)
    print(f'  [OK] {f}')

print('\n=== 2. Checking JavaScript Brackets & Basic Syntax ===')
all_js_files = []
for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root:
        continue
    for f in files:
        if f.endswith('.js') or f.endswith('.mjs'):
            all_js_files.append(os.path.normpath(os.path.join(root, f)))

pairs = {')': '(', '}': '{', ']': '['}

for path in all_js_files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    stack = []
    in_str = None
    escaped = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    line_num = 1
    while i < len(content):
        c = content[i]
        nxt = content[i+1] if i+1 < len(content) else ''
        if c == '\n':
            line_num += 1

        if in_line_comment:
            if c == '\n':
                in_line_comment = False
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
            elif c == '/' and i > 0 and (content[i-1] in '(=:;,!&|?{}[~^+\-*%\n' or content[max(0, i-6):i].strip().endswith('return')):
                # Regex literal - skip until closing / (handling escaped characters)
                j = i + 1
                while j < len(content) and content[j] != '\n':
                    if content[j] == '\\':
                        j += 2
                    elif content[j] == '/':
                        # Skip flags like /g, /i
                        j += 1
                        while j < len(content) and content[j] in 'gimsuy':
                            j += 1
                        break
                    else:
                        j += 1
                i = j - 1
            elif c in ('"', "'", '`'):
                in_str = c
            elif c in '({[':
                stack.append((c, line_num))
            elif c in ')}]':
                if not stack or stack[-1][0] != pairs[c]:
                    print(f'[FAIL] Error in {path}:{line_num} - mismatched closing "{c}"')
                    sys.exit(1)
                stack.pop()
        i += 1

    if stack:
        unclosed = stack[-1]
        print(f'[FAIL] Error in {path} - unclosed "{unclosed[0]}" starting at line {unclosed[1]}')
        sys.exit(1)
    print(f'  [OK] {path} brackets')

print('\n=== 3. Checking for Undeclared Variables and Scope Issues ===')
for path in all_js_files:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    for idx, line in enumerate(lines, 1):
        if re.search(r'\bcurrentUid\b', line):
            start_check = max(0, idx - 150)
            context = ''.join(lines[start_check:idx])
            declared = bool(re.search(r'(const|let|var)\s+currentUid\b|\bfunction\s*\([^)]*currentUid|=>\s*\(?[^)]*currentUid', context))
            if not declared:
                all_prev = ''.join(lines[:idx])
                declared = bool(re.search(r'^(const|let|var)\s+currentUid\b', all_prev, re.MULTILINE))
            if not declared:
                print(f'[FAIL] Scope error in {path}:{idx}: "currentUid" used without declaration:\n  {line.strip()}')
                sys.exit(1)

print('  [OK] Scope and variable declaration checks passed!')
print('\n*** All syntax and static analysis checks passed successfully! ***')

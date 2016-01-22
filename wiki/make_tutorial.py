from collections import defaultdict
import re

tutorial = open('tutorial.md.source').read().split('\n')
code = open('../src/example/tutorial.js').read().split('\n')

remember = set()
snipets = defaultdict(list)

for line in code:
    words = line.split()
    openings = 0
    #print(line)
    if 'begin-fragment' in line:
        name = words[words.index('begin-fragment') + 1]
        remember.add(name)
        #print(name)
    elif 'end-fragment' in line:
        name = words[words.index('end-fragment') + 1]
        remember.remove(name)
    else:
        for name in remember:
            snipets[name].append(line)

lines = []
for line in tutorial:
    if "__fragment__" in line:
        sline = re.split("\W", line)
        name = sline[sline.index('__fragment__') + 1]
        lines.append('```javascript')
        lines.extend(snipets[name])
        lines.append('```')
    else:
        lines.append(line)

out = open('tutorial.md', 'w')
out.write('\n'.join(lines))
out.close()



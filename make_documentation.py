import re

files = ['./src/client.js', './src/transactor.js']

res = []

def nbsp(s):
    i = 0
    while s.startswith(' '*i):
        i += 1
    i -= 1
    return '&nbsp;'*i + s[i:]


take = False
for name in files:
    lines = open(name).readlines()
    for line in lines:
        if '***/' in line:
            take = False
        if take:
            processed = re.sub('^ \* ', '', line)
            processed = re.sub('\n', '', processed)
            processed = re.sub('^  ', '', processed)
            processed = re.sub('^ \*', '', processed)
            if processed.startswith(' '*2):
                processed = processed + '<br />'
            processed = re.sub('args:', '**args:**', processed)
            processed = re.sub('returns:', '**returns:**', processed)
            processed = re.sub('^(\s*)(\w*):', '\\1*\\2:*', processed)
            processed = nbsp(processed)
            res.append(processed)
        if '/***' in line:
            take = True

res.insert(0, '#Documentation')
out = open('documentation.md', 'w')
out.write('\n'.join(res))
out.close()


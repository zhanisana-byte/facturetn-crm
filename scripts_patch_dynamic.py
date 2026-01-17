import os, re
root = '/mnt/data/facturetn_v12/app'
TARGET_EXT = ('.ts', '.tsx')
added=[]
for dirpath, _, filenames in os.walk(root):
    for fn in filenames:
        if fn != 'page.tsx':
            continue
        path=os.path.join(dirpath,fn)
        with open(path,'r',encoding='utf-8') as f:
            txt=f.read()
        if 'await createClient()' not in txt and 'await createClient(' not in txt:
            continue
        # Only server components: if file contains "use client" skip
        if re.search(r"^\s*['\"]use client['\"]\s*;", txt, re.M):
            continue
        if re.search(r"export\s+const\s+dynamic\s*=", txt):
            # ensure revalidate exists
            if not re.search(r"export\s+const\s+revalidate\s*=", txt):
                # insert after dynamic line
                txt = re.sub(r"(export\s+const\s+dynamic\s*=\s*[^;]+;)\s*", r"\1\nexport const revalidate = 0;\n", txt, count=1)
                with open(path,'w',encoding='utf-8') as f:
                    f.write(txt)
                added.append((path,'revalidate'))
            continue
        # Insert exports after last import block
        lines=txt.splitlines()
        insert_at=0
        for i,l in enumerate(lines):
            if l.startswith('import ') or l.startswith('import{') or l.startswith('import{') or l.startswith('import{'):
                insert_at=i+1
            elif l.strip()=='' and insert_at==i: 
                insert_at=i+1
            else:
                # keep scanning imports; break when first non-import non-empty and insert_at already set
                if insert_at>0 and not l.startswith('import '):
                    pass
        # Better: find last consecutive import line near top
        insert_at=0
        for i,l in enumerate(lines):
            if l.startswith('import '):
                insert_at=i+1
                continue
            if insert_at>0 and l.strip()=='' :
                insert_at=i+1
                continue
            if insert_at>0:
                break
        exports=[
            'export const dynamic = "force-dynamic";',
            'export const revalidate = 0;',
            ''
        ]
        new_lines = lines[:insert_at] + exports + lines[insert_at:]
        new_txt='\n'.join(new_lines)+('\n' if not txt.endswith('\n') else '')
        with open(path,'w',encoding='utf-8') as f:
            f.write(new_txt)
        added.append((path,'dynamic+revalidate'))

print('patched',len(added))
for p,what in added[:50]:
    print(what, p)

const fs = require('fs');
const path = require('path');

const mapping = [
    { regex: /background:\s*['"]#F8FAFC['"]/g, replace: "background: 'var(--bg-hover)'" },
    { regex: /background:\s*['"]#F1F5F9['"]/g, replace: "background: 'var(--bg-active)'" },
    { regex: /background:\s*['"]#FFFFFF['"]/g, replace: "background: 'var(--bg-base)'" },
    { regex: /backgroundColor:\s*['"]#FFFFFF['"]/g, replace: "backgroundColor: 'var(--bg-base)'" },
    { regex: /background:\s*['"]#1A202C['"]/g, replace: "background: 'var(--bg-header)'" },
    { regex: /color:\s*['"]#1E293B['"]/g, replace: "color: 'var(--text-primary)'" },
    { regex: /color:\s*['"]#2D3748['"]/g, replace: "color: 'var(--text-primary)'" },
    { regex: /color:\s*['"]#64748B['"]/g, replace: "color: 'var(--text-secondary)'" },
    { regex: /color:\s*['"]#475569['"]/g, replace: "color: 'var(--text-secondary)'" },
    { regex: /color:\s*['"]#94A3B8['"]/g, replace: "color: 'var(--text-muted)'" },
    { regex: /color:\s*['"]#A0AEC0['"]/g, replace: "color: 'var(--text-muted)'" },
    { regex: /color:\s*['"]#E2E8F0['"]/g, replace: "color: 'var(--text-inverse)'" },
    { regex: /border:\s*['"]1px solid #E2E8F0['"]/g, replace: "border: '1px solid var(--border-light)'" },
    { regex: /borderBottom:\s*['"]1px solid #E2E8F0['"]/g, replace: "borderBottom: '1px solid var(--border-light)'" },
    { regex: /borderTop:\s*['"]1px solid #E2E8F0['"]/g, replace: "borderTop: '1px solid var(--border-light)'" },
    { regex: /border:\s*['"]1px solid #CBD5E0['"]/g, replace: "border: '1px solid var(--border-main)'" },
    { regex: /border:\s*['"]1px solid #2D3748['"]/g, replace: "border: '1px solid var(--border-dark)'" },
    { regex: /borderBottom:\s*['"]1px solid #2D3748['"]/g, replace: "borderBottom: '1px solid var(--border-dark)'" },
    { regex: /borderRight:\s*['"]1px solid #2D3748['"]/g, replace: "borderRight: '1px solid var(--border-dark)'" },
    
    // Some compound colors inside strings
    { regex: /['"]#1A202C['"]/g, replace: "'var(--bg-header)'" },
    { regex: /['"]#FFFFFF['"]/g, replace: "'var(--bg-base)'" },
    { regex: /['"]#1E293B['"]/g, replace: "'var(--text-primary)'" },
    { regex: /['"]#2D3748['"]/g, replace: "'var(--text-primary)'" },
];

function getFiles(dir, files = []) {
    const fileList = fs.readdirSync(dir);
    for (const file of fileList) {
        const name = dir + '/' + file;
        if (fs.statSync(name).isDirectory()) {
            getFiles(name, files);
        } else {
            if (name.endsWith('.tsx') || name.endsWith('.ts')) {
                files.push(name);
            }
        }
    }
    return files;
}

const files = getFiles('./src');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    mapping.forEach(m => {
        content = content.replace(m.regex, m.replace);
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Updated ' + file);
    }
});

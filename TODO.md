# TODO - Fix Vercel Deploy Error (Next.js TypeScript target)

## Status: [0/4] ⏳ In Progress

### ✅ 1. [DONE] Planning
- [x] Analyzed error: regex `/gs` flag requires ES2018+, tsconfig target is ES2017
- [x] Confirmed file: dashboard-v2/src/app/admin/page.tsx (line 79+)
- [x] User approved plan: update tsconfig.json target to ES2020

### ✅ 2. [DONE] Update tsconfig.json
- [x] Edit dashboard-v2/tsconfig.json: change "target": "ES2017" → "ES2020" 
- [x] Verified next.config.ts — no TypeScript overrides

### ⏳ 3. [PENDING] Local Test
- [ ] cd dashboard-v2 && npm run build
- [ ] Confirm no TypeScript errors
- [ ] Update TODO.md ✓

### ⏳ 4. [PENDING] Deploy Test
- [ ] Push to GitHub (if needed) or re-trigger Vercel deploy
- [ ] Confirm build success
- [ ] [COMPLETION] attempt_completion

## Files to Edit:
```
dashboard-v2/tsconfig.json
  ↓ Change "target": "ES2017" → "target": "ES2020"
```

Next step: Edit tsconfig.json → `read_file` to confirm content → `edit_file` with precise diff → local test

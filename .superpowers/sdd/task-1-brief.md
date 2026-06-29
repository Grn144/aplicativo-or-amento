## Task 1: Scaffolding do projeto

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `.env.local.example`, `components.json`

**Interfaces:**
- Produz: projeto Next.js 15 rodando em `localhost:3000` com shadcn/ui e Vitest configurados

- [ ] **Step 1: Criar app Next.js 15**

No diretório `aplicativo-orcamento`:

```bash
npx create-next-app@15 . --typescript --tailwind --app --src-dir=no --import-alias="@/*" --use-npm --yes
```

- [ ] **Step 2: Instalar dependências**

```bash
npm install @supabase/supabase-js @supabase/ssr resend
npm install exceljs
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Inicializar shadcn/ui**

```bash
npx shadcn@latest init --defaults
npx shadcn@latest add button input label card badge dialog select textarea sonner
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 5: Criar `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Criar `.env.local.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Resend (email para MFA)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Criar `.env.local` com valores reais** (não commitar)

Copie `.env.local.example` para `.env.local` e preencha com os valores do seu projeto Supabase e Resend.

- [ ] **Step 8: Adicionar script de test ao `package.json`**

Abra `package.json` e adicione dentro de `"scripts"`:

```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 9: Verificar que o app sobe**

```bash
npm run dev
```

Esperado: `localhost:3000` carrega a página padrão do Next.js sem erros.

- [ ] **Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffolding Next.js 15 + shadcn + Vitest"
```

---


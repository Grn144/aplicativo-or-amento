### Task 1: Instalar Recharts e tokens de cor do dashboard

**Files:**
- Modify: `package.json` (via npm)
- Modify: `app/globals.css`

**Interfaces:**
- Produces: dependência `recharts`; CSS vars `--chart-1..5` com as cores do prompt (azul, verde, amarelo, vermelho, roxo) em light/dark — já mapeadas para Tailwind pelo `@theme inline` existente (`--color-chart-*`). Gráficos usarão `var(--chart-N)` diretamente.

- [ ] **Step 1: Instalar recharts**

Run: `npm install recharts`
Expected: adiciona `recharts` em `dependencies` sem erros de peer deps (React 19 é suportado no recharts ≥ 2.15).

- [ ] **Step 2: Substituir as cores de chart em `app/globals.css`**

No bloco `:root`, substituir as cinco linhas `--chart-1` a `--chart-5` por:

```css
  --chart-1: #2563eb; /* azul */
  --chart-2: #22c55e; /* verde */
  --chart-3: #f59e0b; /* amarelo */
  --chart-4: #ef4444; /* vermelho */
  --chart-5: #8b5cf6; /* roxo */
```

No bloco `.dark`, substituir as cinco linhas `--chart-1` a `--chart-5` por:

```css
  --chart-1: #3b82f6;
  --chart-2: #22c55e;
  --chart-3: #fbbf24;
  --chart-4: #ef4444;
  --chart-5: #a78bfa;
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build verde (as vars são usadas nas próximas tasks; aqui só valida o CSS).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/globals.css
git commit -m "feat: instalar recharts e cores de grafico do dashboard"
```

---


# Transformar o LAButuca em aplicativo desktop (Windows)

## Context

O usuário quer que o app vire um programa instalável: o visitante baixa no site do app e instala no PC. Escolha confirmada: **Electron** (instalador `.exe` de verdade via NSIS), alvo **Windows**.

Esclarecimento importante já comunicado: Electron usa o mesmo motor Chromium do navegador, então o ganho bruto de desempenho é pequeno — os benefícios reais são janela dedicada (sem throttle de aba), estabilidade e o instalador. O desempenho de jogos já foi tratado na otimização de captura de tela feita anteriormente (`src/lib/webrtc.ts`).

Fatos técnicos verificados:
- O build Vite gera `dist/` (`vite.config.ts`, base `/`). O app usa apenas env vars compiladas no bundle (`VITE_*`, `BASE_URL`, e as credenciais hardcoded do cliente Supabase) → funcionam no app empacotado sem mudanças.
- `eslint.config.js` só linta `**/*.{ts,tsx}` → arquivos `.cjs` do Electron não quebram lint.
- `tsconfig` só inclui `src/` e `vite.config.ts` → Electron não afeta typecheck.
- O app usa `localStorage` para sessão (Supabase) → funciona com `file://` no Electron.
- O app já chama `navigator.mediaDevices.getDisplayMedia(...)` no `RoomClient.startScreen()` — no Electron o seletor nativo do sistema é exibido automaticamente (sem handler personalizado).

## Abordagem

1. **Shell Electron mínimo**: `electron/main.cjs` (CommonJS puro, sem etapa de build) que abre `dist/index.html` numa janela, com permissões de microfone/captura, autoplay de áudio liberado, `backgroundThrottling: false` (mantém o WebRTC ativo com a janela em segundo plano) e single-instance lock.
2. **Empacotamento Windows**: `electron-builder` com alvo NSIS (`.exe`), ícone `build/icon.png` (≥256px, convertido automaticamente para `.ico`), `directories.output: release` (evita conflito com o `dist` do Vite).
3. **Scripts npm**: `desktop` (roda o app), `desktop:dir` (pasta descompactada para teste) e `desktop:dist` (gera o instalador `.exe`).
4. **Instalação segura no sandbox**: `.npmrc` com `electron_skip_binary_download=1` para não baixar o binário do Electron (~100 MB) no sandbox; o `electron-builder` baixa o que precisa no computador do usuário ao gerar o instalador.
5. **Página de download no site**: seção "Baixe o aplicativo" na Landing com botão Windows, com URLs dos instaladores centralizadas em `src/lib/download-links.ts` (para o usuário preencher quando hospedar o `.exe`).
6. **Analytics**: novo evento `desktop_download_clicked` (registrar + `trackEvent` no clique de download).

## Arquivos

| Arquivo | Ação |
|---|---|
| `electron/main.cjs` | novo — processo principal do Electron |
| `electron-builder.yml` | novo — config de empacotamento |
| `.npmrc` | novo — `electron_skip_binary_download=1` |
| `build/icon.png` | novo — baixar o logo atual (`https://cdn.enter.pro/resources/uid_100541343/labutuca-logo_bd041355.png`) |
| `package.json` | adicionar `main`, scripts `desktop*`, deps `electron` + `electron-builder` (devDependencies) |
| `src/lib/download-links.ts` | novo — constantes de URL dos instaladores |
| `src/pages/Landing.tsx` | seção de download + `trackEvent` no clique |
| `.enter/plans/` (registry de analytics) | registrar `desktop_download_clicked` (conversion) |

## `electron/main.cjs` — pontos-chave

- `app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")` antes do ready (áudio remoto toca sem gesto).
- `BrowserWindow`: 1280×800, `minWidth: 940`, `minHeight: 600`, `backgroundColor: "#0b0e17"`, `autoHideMenuBar: true`, `icon: build/icon.png`, `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }`.
- `win.loadFile(path.join(__dirname, "../dist/index.html"))`.
- `session.defaultSession.setPermissionRequestHandler` concedendo `media` e `display-capture` (microfone/captura de tela em app empacotado).
- `requestSingleInstanceLock` + `second-instance` (foca a janela existente).
- `setWindowOpenHandler`: links externos abrem no navegador do sistema.

## `electron-builder.yml` — pontos-chave

```yaml
appId: com.labutuca.desktop
productName: LAButuca
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - electron/**/*
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  shortcutName: LAButuca
  installerLanguages: [pt_BR, en_US]
```

## Scripts (package.json)

- `"main": "electron/main.cjs"`
- `"desktop": "vite build && electron ."`
- `"desktop:dir": "vite build && electron-builder --win --dir"`
- `"desktop:dist": "vite build && electron-builder --win"`

`vite build` (modo produção) carrega as env vars de `.env` → analytics embutido no bundle.

## Seção de download (Landing)

- Botão principal "Baixar para Windows" (ícone lucide, ex. `Download`) apontando para `DESKTOP_WINDOWS_URL` de `src/lib/download-links.ts`.
- Texto curto explicando que o instalador traz janela dedicada. Links `macOS`/`Linux` exibidos como "em breve" (constantes vazias → não renderizam link).
- `trackEvent("desktop_download_clicked", { eventType: "conversion" })` no clique.

## Implementation checklist

- [ ] Criar `.npmrc` com `electron_skip_binary_download=1`.
- [ ] Adicionar `electron` e `electron-builder` como devDependencies (install no sandbox não baixa binário).
- [ ] Criar `electron/main.cjs` com todos os pontos-chave acima.
- [ ] Criar `electron-builder.yml` com output `release/`, alvo NSIS x64, ícone `build/icon.png`.
- [ ] Baixar o logo atual para `build/icon.png` (fallback: `image_generation`).
- [ ] Atualizar `package.json`: `main`, scripts `desktop`, `desktop:dir`, `desktop:dist`.
- [ ] Criar `src/lib/download-links.ts` com `DESKTOP_WINDOWS_URL`, `DESKTOP_MAC_URL`, `DESKTOP_LINUX_URL`.
- [ ] Adicionar seção de download na `src/pages/Landing.tsx` (ícone lucide `Download`, sem emoji).
- [ ] Registrar evento `desktop_download_clicked` (conversion) no registry de analytics.
- [ ] Adicionar `trackEvent("desktop_download_clicked", ...)` no clique do botão Windows.

## Verification checklist

- [ ] `pnpm run check` (lint + tsc) passa sem erros.
- [ ] `pnpm run build` (build web) continua passando.
- [ ] `pnpm list electron electron-builder` mostra as deps instaladas; `node_modules/electron/dist` ausente (skip ativo, esperado).
- [ ] `dist/index.html` ainda é gerado normalmente (nada do Electron interfere no app web).
- [ ] `desktop_download_clicked` aparece em `list_analytics_events` (registered).
- [ ] Screenshot da Landing mostra a nova seção "Baixe o aplicativo" com botão Windows renderizando.
- [ ] Negativo: nenhuma alteração em `src/integrations/supabase/client.ts` ou `types.ts` (arquivos gerados).
- [ ] Documentar no chat: para gerar o `.exe`, rodar `pnpm install && pnpm run desktop:dist` no PC local; o instalador sai em `release/` e deve ser hospedado e apontado em `download-links.ts`.

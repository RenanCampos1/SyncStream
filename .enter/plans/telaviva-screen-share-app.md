# TelaViva — App de compartilhamento de tela ao vivo + chat de voz

## Contexto

O usuário quer um app onde cada pessoa se cadastra (email e senha), cria uma sala, convida amigos (que também precisam se cadastrar) e qualquer participante pode compartilhar a tela ao vivo. A sala é um chat de voz (áudio ao vivo) e também terá chat de texto escrito. Público-alvo: grupos pequenos de amigos (5–8 pessoas).

Tecnologia chave: **WebRTC em malha (mesh)** — cada participante conecta direto com os outros (voz + tela). Sinalização (troca de ofertas/respostas/ICE) via **Enter Cloud Realtime**. O app depende de backend para: autenticação, salas, convites, mensagens e presença.

**Nome do app: TelaViva.**

## Arquitetura

```
Browser A ────────RTCPeerConnection──────── Browser B
     \                                        /
      \── (áudio + tela compartilhada) ──────/
       └────────── RTCPeerConnection ──────── Browser C

Sinalização: tabela signal_messages (INSERT + Realtime broadcast)
Presença:    Realtime Presence (quem está online, mic ligado, tela ligada)
```

- **Malha WebRTC**: cada participante tem um `RTCPeerConnection` para cada outro (padrão perfect negotiation para evitar glare). Voz (mic) + tela (getDisplayMedia, renegotiation).
- **Nenhuma função de backend (edge function) necessária**: tudo resolvido com auth, tabelas + Realtime.

## Backend (Enter Cloud) — implementado

Tabelas criadas via migração: `rooms` (com trigger `set_room_code` gerando código único de 6 chars), `room_members`, `messages` (com `display_name`), `signal_messages`.

- **RLS em todas as tabelas**, com funções `security definer` (`is_room_member`, `room_exists`) para evitar recursão — corrigido durante o desenvolvimento (o primeiro rascunho causava "infinite recursion").
- **Auth**: email/senha, auto-confirm ativado, `display_name` em user metadata.
- **Realtime** em `messages` e `signal_messages`.
- RPC `get_room_by_code` (security definer) para entrar por código de convite.

## Frontend — implementado

| Rota | Página | Acesso |
|---|---|---|
| `/` | Landing (`Landing.tsx`) | público |
| `/auth` | Login/Cadastro (`Auth.tsx`) | público |
| `/home` | Dashboard (`Home.tsx`) | autenticado |
| `/room/:code` | Sala (`Room.tsx`) | autenticado |

Arquivos principais:
- `src/hooks/use-auth.tsx` — contexto de auth (user + session, listener antes de checar sessão, chamadas adiadas no callback).
- `src/lib/webrtc.ts` — classe `RoomClient` (malha, sinalização via postgres_changes, presença, mic/screen).
- `src/components/room/video-grid.tsx`, `participant-list.tsx`, `chat-panel.tsx`, `control-bar.tsx`.
- `src/index.css` + `tailwind.config.ts` — tema dark "estúdio ao vivo" (verde-sinal, violeta, Unbounded/Sora/Space Mono, live dot pulsante, glows, bg-grid).
- i18n: idioma `pt-BR` adicionado e **definido como padrão** (detecção via cookie; app abre em português), com `en` e `zh-CN` espelhados.

## Verificação — status

- [x] `pnpm check` (lint + tsc) sem erros.
- [x] `pnpm run build` OK (só aviso de chunk > 500kB, sem impacto funcional).
- [x] `check-i18n.mjs` e `scan-i18n.mjs` passaram.
- [x] Backend testado via API (curl) de ponta a ponta: cadastro com auto-confirm, criação de sala com código, RPC por código, join, mensagens (insert/read), sinais WebRTC (insert/read), "minhas salas" (join aninhado), isolamento RLS de não-membro.
- [x] Landing desktop + mobile e página de auth verificadas por screenshot; clipping do título do painel corrigido.
- [ ] **Pendente de verificação visual**: sala `/room/:code` (exige sessão autenticada e dois navegadores). Voz/tela/chat reais precisam de teste manual com 2+ contas. Responsividade da sala ainda não comprovada por screenshot.
- [ ] **Limitações conhecidas**: compartilhar tela/microfone podem ser bloqueados dentro do iframe de preview (permissões do navegador) — funcionam no site publicado. Malha indicada para até ~8 pessoas.

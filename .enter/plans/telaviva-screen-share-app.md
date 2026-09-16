# TelaViva — App de compartilhamento de tela ao vivo + chat de voz

## Contexto

O usuário quer um app onde cada pessoa se cadastra (email e senha), cria uma sala, convida amigos (que também precisam se cadastrar) e qualquer participante pode compartilhar a tela ao vivo. A sala é um chat de voz (áudio ao vivo) e também terá chat de texto escrito. Público-alvo: grupos pequenos de amigos (5–8 pessoas).

Tecnologia chave: **WebRTC em malha (mesh)** — cada participante conecta direto com os outros (voz + tela). Sinalização (troca de ofertas/respostas/ICE) via **Enter Cloud Realtime**. O app depende de backend para: autenticação, salas, convites, mensagens e presença.

**Nome sugerido para o app: TelaViva.**

## Arquitetura

```
Browser A ────────RTCPeerConnection──────── Browser B
     \                                        /
      \── (áudio + tela compartilhada) ──────/
       └────────── RTCPeerConnection ──────── Browser C

Sinalização: tabela signal_messages (INSERT + Realtime broadcast)
Presença:    Realtime Presence (quem está online, mic ligado, tela ligada)
```

- **Malha WebRTC**: cada participante tem um `RTCPeerConnection` para cada outro. Adequado para 5–8 amigos (limitação conhecida: banda/CPU cresce com o grupo; documentar).
- **Nenhuma função de backend (edge function) necessária**: tudo resolvido com auth, tabelas + Realtime do Enter Cloud.

## Backend (Enter Cloud)

Ativar Enter Cloud (`supabase_enable`). Depois, migração única (`supabase_migration`):

### Tabelas
| Tabela | Colunas |
|---|---|
| `rooms` | `id` uuid PK, `code` text unique (6 chars, gerado por trigger), `name`, `created_by` → auth.users, `created_at` |
| `room_members` | `id`, `room_id` → rooms (cascade), `user_id` → auth.users (cascade), `joined_at`, unique(`room_id`,`user_id`) |
| `messages` | `id`, `room_id`, `user_id`, `content`, `created_at` |
| `signal_messages` | `id`, `room_id`, `from_user`, `to_user` (null = broadcast), `payload` jsonb, `created_at` |

### Regras
- Trigger `set_room_code`: gera código único de 6 caracteres (A–Z, 0–9) com retry em colisão.
- **RLS em todas as tabelas** (na mesma migração):
  - `rooms`: INSERT autenticado; SELECT para quem é membro ou criou.
  - `room_members`: INSERT quando `user_id = auth.uid()` (entrar na sala); SELECT apenas membros; DELETE da própria linha (sair).
  - `messages`: SELECT/INSERT apenas para membros.
  - `signal_messages`: SELECT/INSERT apenas para membros (`from_user = auth.uid()`).
- **Realtime** via `ALTER PUBLICATION supabase_realtime ADD TABLE` para `messages`, `room_members`, `signal_messages`.
- **Auth**: email/senha, auto-confirm ativado (`supabase_configure_auth`), `emailRedirectTo: ${window.location.origin}/` no signup. `display_name` enviado como user metadata no signup (evita tabela extra de perfis).
- `src/integrations/supabase/client.ts` e `types.ts` são gerados pelo framework — **não editar**.

## Frontend

### Rotas (`src/router.tsx`)
| Rota | Página | Acesso |
|---|---|---|
| `/` | Landing (`Landing.tsx`) | público |
| `/auth` | Login/Cadastro (`Auth.tsx`) | público |
| `/home` | Dashboard (`Home.tsx`): criar sala, entrar por código, minhas salas | autenticado |
| `/room/:code` | Sala (`Room.tsx`): voz + tela + chat | autenticado |

### Arquivos novos
- `src/hooks/use-auth.tsx` — contexto de auth: `onAuthStateChange` registrado **antes** de checar sessão existente; guarda user + session; chamadas ao supabase dentro do callback adiadas com `setTimeout(..., 0)` (regra do skill enter_cloud).
- `src/hooks/use-room.ts` — buscar sala por código, auto-join em `room_members`, mensagens (subscribe postgres_changes), envio de mensagem.
- `src/lib/webrtc.ts` — classe `RoomClient` (gerente da malha):
  - `getUserMedia({ audio: true })` no entrar; toggle de mudo (enabled/disable track).
  - Por peer remoto: `RTCPeerConnection`, oferta/resposta, candidatos ICE — tudo via `signal_messages` (subscribe postgres_changes por room; `to_user` direciona).
  - Glare handling básico: se chegar oferta com oferta local pendente, responder com a do remoto.
  - Presença via `supabase.channel('presence:room:{code}')` com `track({ userId, displayName, micOn, screenOn })`.
  - **Compartilhar tela**: `getDisplayMedia` → adiciona track de vídeo às conexões → `negotiationneeded` reenvia ofertas; parar = remover tracks + `screenOn: false`. Feed exibido em `<video>` por peer.
- `src/components/room/` — componentes da sala:
  - `ControlBar.tsx` (mudo, compartilhar/parar tela, sair)
  - `VideoGrid.tsx` (tiles de vídeo/avatar por participante + indicador "compartilhando tela")
  - `ParticipantList.tsx` (membros online, quem está falando/mudo/tela)
  - `ChatPanel.tsx` (chat de texto da sala)

### Design
- Tema **dark** (estilo app de voz, ex. Discord/Meet). Tokens semânticos em `src/index.css` e `tailwind.config.ts`; componentes shadcn (button, card, input, avatar, scroll-area, sheet) personalizados com variantes.
- Aplicar o skill `frontend-design` para o sistema visual (cores, tipografia, estados).
- Ícones via `lucide-react` (Mic, MicOff, MonitorUp, MonitorX, Copy, Users, Send, LogOut, etc.) — **sem emojis**.

### i18n
- App em português: registrar idioma `pt-BR` no `i18n.config.json` (detect `["pt"]`) e criar `public/locales/pt-BR.json` com as strings. Seguir o skill `enter_i18n` (manifesto centralizado).

### Limitações (documentar na landing ou rodapé)
- Tela compartilhada e microfone funcionam em top-level (site publicado); dentro do iframe de preview, o navegador pode bloquear `getDisplayMedia`/`getUserMedia` por política de permissões — testar no site publicado.
- Malha WebRTC: recomendado para até ~8 pessoas; acima disso a qualidade sofre (seria preciso servidor de mídia, fora do escopo).

## Passos de implementação

1. Ativar Enter Cloud; rodar migração (tabelas + trigger de código + RLS + realtime).
2. Configurar auth email/senha (auto-confirm) e registrar idioma pt-BR no i18n.
3. Design system (dark) via skill `frontend-design` + tokens em `index.css`/`tailwind.config.ts`.
4. `use-auth` + páginas Landing e Auth.
5. Dashboard Home (criar sala, entrar por código, listar salas).
6. `webrtc.ts` (RoomClient) + página Room (presença, sinalização, voz, chat, compartilhar tela).
7. Ajustes de RLS/políticas se necessário e limpeza final.

## Verificação

- [ ] `pnpm check` (lint + tsc) e `pnpm run build` sem erros.
- [ ] Fluxo completo manual: cadastrar usuário A → criar sala → copiar convite (link/código) → cadastrar usuário B em outro navegador → entrar na sala pelo código.
- [ ] Voz: A e B se ouvem; mudo liga/desliga.
- [ ] Tela: A compartilha a tela; B vê o vídeo ao vivo; parar de compartilhar encerra o feed.
- [ ] Chat de texto: A envia, B recebe em tempo real (Realtime).
- [ ] Presença: B entra/sai e a lista de participantes atualiza; indicador de quem está com a tela ativa.
- [ ] Saída da sala remove o membro (`room_members` DELETE) e não quebra as conexões dos demais.
- [ ] RLS: usuário não membro não vê mensagens/sinais da sala (checar via console).
- [ ] `get_console_logs` sem erros de runtime nas rotas principais.
- [ ] Screenshots de responsividade (`mobile_390` e `desktop_1280`) nas rotas Landing/Auth/Home/Room.

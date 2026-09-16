# Add Analytics Tracking to TelaViva

## Context

Analytics has just been enabled for this project. The SDK (`@enter-pro/analytics-sdk` v0.0.10) is already installed and bootstrapped at app entry (`src/main.tsx` → `src/analytics.ts`). Only the auto events (`page_view`, `session_start`, `session_end`) exist today — no custom events are registered and no user interactions are tracked.

This plan instruments the app's key funnels and features: auth signup/login, room creation/joining/leaving, and in-room interactions (mic, screen share, chat, candles, kicks, invite copy).

## Events to register (backend)

Register each event with `register_analytics_event` BEFORE wiring any `trackEvent` calls (unregistered events are silently dropped). Current registry has only defaults; all 11 below are new.

| event_name | event_type | trigger | properties |
|---|---|---|---|
| signup_completed | conversion | Auth form, signup mode, success | — |
| login_completed | conversion | Auth form, login mode, success | — |
| room_created | conversion | Home "create room" success | — |
| room_joined | custom | Room successfully joined (after `client.join()`) | — |
| room_left | custom | Leave-room confirmation | — |
| chat_message_sent | custom | Chat message insert | — |
| candle_sent | custom | Candle sent to a participant | `color` ("white"/"black") |
| participant_kicked | custom | Creator kicks a participant | — |
| screen_share_toggled | custom | Screen-share button | `enabled` (bool, resulting state) |
| mic_toggled | custom | Mic button | `enabled` (bool, resulting state) |
| invite_code_copied | custom | Copy room code (header chip or button) | — |

No PII or raw form values in any payload (per SDK privacy rules).

## Code changes (all imperative `trackEvent`)

Import `trackEvent` from `@enter-pro/analytics-sdk` in the three files below.

### `src/pages/Auth.tsx`
- After `submit()` succeeds (`result.error` falsy): fire `login_completed` or `signup_completed` (conversion), depending on `mode`.

### `src/pages/Home.tsx`
- In `createRoom()`, after the room is created and before/at `navigate(...)`: fire `room_created` (conversion).

### `src/pages/Room.tsx`
- Add a `joinedTrackedRef` guard; fire `room_joined` once, right before `setReady(true)` after `await client.join()`.
- In `confirmLeave()`: fire `room_left` before navigating home.
- In `sendMessage()`: fire `chat_message_sent` after the insert.
- In `sendCandle()`: fire `candle_sent` with `properties: { color }`.
- In `kickUser()`: fire `participant_kicked` after the kick/ban/event inserts succeed.
- In `toggleScreen()`: compute resulting state via `getScreenOn()` before toggling, then fire `screen_share_toggled` with `properties: { enabled }`.
- Replace the inline `onToggleMic` handler with a named handler that toggles the mic and fires `mic_toggled` with `properties: { enabled: !clientState.self.micOn }` (the resulting state at click time).
- In `copyCode()`: fire `invite_code_copied`.

No changes to `src/analytics.ts`, `src/main.tsx`, or bootstrap logic.

## Implementation checklist

- [ ] Register all 11 events via `register_analytics_event` (each returns 200/409) and confirm via `list_analytics_events`.
- [ ] Add `trackEvent` import + `login_completed`/`signup_completed` fires in `src/pages/Auth.tsx` (success paths only).
- [ ] Add `room_created` fire in `src/pages/Home.tsx` createRoom success path.
- [ ] Add `room_joined` (guarded, fires once per join) in `src/pages/Room.tsx`.
- [ ] Add `room_left` in Room `confirmLeave`.
- [ ] Add `chat_message_sent` in Room `sendMessage`.
- [ ] Add `candle_sent` with `color` property in Room `sendCandle`.
- [ ] Add `participant_kicked` in Room `kickUser`.
- [ ] Add `screen_share_toggled` with `enabled` property in Room `toggleScreen`.
- [ ] Add named mic-toggle handler firing `mic_toggled` with `enabled` property.
- [ ] Add `invite_code_copied` in Room `copyCode`.
- [ ] No banned property keys and no new analytics `fetch`/`sendBeacon` anywhere.

## Verification checklist

- [ ] `pnpm run check` (lint + `tsc --noEmit`) passes.
- [ ] `pnpm run build` succeeds.
- [ ] `list_analytics_events` shows all 11 custom events registered.
- [ ] Runtime: `getAnalyticsHealth()` returns `{ initialized: true, enabled: true }` and `outboxSize` grows after performing each tracked action in the preview (auth signup/login, create room, join room, leave, send chat, send candle, kick, screen share, mic toggle, copy code).
- [ ] Negative check: `login_completed`/`signup_completed` are NOT emitted on failed auth attempts.
- [ ] Default events (`page_view`, `session_start`, `session_end`) remain untouched — not re-registered, not re-emitted.

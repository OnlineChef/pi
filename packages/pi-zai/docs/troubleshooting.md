# Troubleshooting

## `Connection error` / `Recv failure` / `fetch failed`

Pi already retries transient transport errors (`connection error` is retryable). Defaults: **3 agent retries** with 2s/4s/8s backoff, but **0 SDK retries** — so a dropped TCP connection fails fast.

**Reduce failures:**

1. Run `/zai-doctor` — checks **Connection stability** (3 chat probes) and **Pi retry settings**.
2. Add SDK retries in `~/.pi/agent/settings.json`:

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 5,
    "baseDelayMs": 2000,
    "provider": {
      "maxRetries": 2,
      "maxRetryDelayMs": 60000
    }
  }
}
```

3. Switch endpoint: `/zai-endpoint platform` or `/zai-endpoint coding` (one may be more stable from your network).
4. Disable VPN/proxy temporarily; check firewall to `api.z.ai`.
5. During retries Pi shows a retry indicator — wait before assuming total failure.

After all retries fail, pi-zai shows an actionable hint via `agent_settled`.

## `/zai-doctor` network probe fails

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No credentials` | Key not in Pi auth | Configure via `/login`, `auth.json`, `models.json`, or `ZAI_API_KEY` |
| HTTP 401 | Invalid or rotated key | Update credentials |
| HTTP 403 | Region or product restriction | Try Platform vs Coding endpoint |
| Connection drop on Coding Plan | Network path to `/coding/` endpoint | Use Platform; check VPN/firewall |
| Timeout | Slow network | Retry; check `curl` to base URL |

## Low cache hit ratio

1. Run `/zai-cache status` and read recommendations.
2. Move volatile content below `--- dynamic context ---`.
3. Avoid changing tools or system prompt mid-session.
4. Stay on one endpoint and model.
5. Confirm `clear_thinking` is true (default) — preserved thinking hurts cache.

## `clear_thinking` not true

Check `/zai`:

- `Preserved thinking: enabled` disables cost-first mode
- Disable via `zai.preserveThinking: false` in settings.json

## Extension not loading

- Pi version must be **>= 0.80.0**
- Run `/reload` after install
- Check Pi extension errors on startup

## Platform cost shows `$0.00`

Coding Plan sessions always show `subscription-managed`. Switch to `zai-platform` for metered estimates.

## Coding Plan vs Platform confusion

`/zai` shows the active endpoint from the **selected model's provider**, not a separate toggle. Use `/zai-endpoint` or Pi model picker.

## Pi version too old

```bash
pi --version
```

If below 0.80.0, upgrade Pi before installing this extension.

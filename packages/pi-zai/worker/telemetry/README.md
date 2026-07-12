# pi-zai telemetry worker

Ingests anonymous daily Z.AI aggregate payloads from pi-zai clients.

## Route

Production target: `https://api.chefgroep.online/pi-zai/telemetry/v1/aggregate`

Bind this worker to that path on the `api.chefgroep.online` zone (dashboard or sibling `cf-api` router).

## Deploy

```bash
cd packages/pi-zai/worker/telemetry
npm install
npm run check
npx wrangler deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Payload rules

- Schema 1 daily aggregates only
- Rejects bodies containing project/session/fingerprint/prompt/path fields
- Writes to Analytics Engine dataset `pi_zai_telemetry`

Client opt-in is enforced in pi-zai (`zai.telemetry.mode: aggregate` + `/zai-telemetry enable`).
